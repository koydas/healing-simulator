# ADR-0004: External store and memoised snapshots to isolate React renders

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

The simulation produces a new state every 100 ms. Putting that state in a
`useState` at the top of the application would trigger 10 full re-renders per
second: five party frames, five spell buttons, the header and the bars would be
rebuilt constantly — which the brief explicitly forbids.

## Decision

The `GameState` lives in a store created by `createGameStore(seed)` and held by
a `useRef` in `App`. The store exposes two distinct channels:

**1. Memoised snapshots + `useSyncExternalStore`.** After every step the store
rebuilds light projections (`MemberSnapshot`, `HeaderSnapshot`,
`ControlsSnapshot`, messages, end-of-fight summary). A shallow comparison
(`snapshotEqual`, with element-wise equality for arrays) lets it **reuse the
previous reference** when the content is unchanged. Components subscribe to
their own snapshot; React compares the reference and only re-renders what
actually moved. The store notifies its listeners only when at least one snapshot
changed.

**2. "Frame" callbacks (`onFrame`).** The values that change on every step —
mana, cast progress, GCD progress — are written straight into CSS variables
(`--mana-fill`, `--cast-progress`, `--gcd-progress`) and a `textContent`,
through DOM refs. No React render is involved.

Every subscribed component is wrapped in `React.memo` and receives callbacks
stabilised with `useCallback`.

## Alternatives Considered

- **A global `useState` in `App`** — rejected: full re-render at 10 Hz.
- **Redux / Zustand / Jotai** — rejected: an external dependency is not needed;
  `useSyncExternalStore` does exactly this job out of the box.
- **`useReducer` + Context** — rejected: Context propagates the value to every
  consumer, which reintroduces the global-render problem.
- **Rendering on a `<canvas>`** — rejected: you lose accessibility and native
  touch targets for no benefit at this scale.

## Consequences

- ✅ `App` never re-renders during a fight; a frame only re-renders when its
  health, alive state, Renew, selection or feedback changes.
- ✅ Animated bars stay smooth with no reconciliation cost.
- ✅ No external state dependency: the store is around 250 lines and stays
  readable.
- ⚠️ Memoisation is manual: adding a field to a snapshot without thinking about
  its stability can reintroduce useless renders.
- ⚠️ Values driven by `onFrame` are invisible in the React DevTools — you have
  to inspect the DOM to debug them.
