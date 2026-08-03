# ADR-0001: Pure simulation engine, isolated from React

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

The game is a real-time simulation: periodic damage, HoTs, casts, regeneration,
deaths, wipes. Mixing that logic with `useState` and `useEffect` would make the
behaviour depend on React's render order, very hard to test, and impossible to
replay exactly.

## Decision

All game logic lives under `src/simulation/` and imports **nothing** from React,
the DOM or the real clock. The central function is:

```ts
stepSimulation(state: GameState, dtMs: number): GameState
```

It clones the input state (`cloneState`), works on that draft and returns a new
state. Player actions (`castSpell`, `selectTarget`, `cancelCast`,
`togglePause`) follow the same `(state, payload) => state` signature.

The `GameState` is a serializable data structure: party, mana, timers, seed,
feedback, statistics.

Forbidden under `src/simulation/`: `Date.now()`, `performance.now()`,
`Math.random()`, `setTimeout`, DOM access, React imports.

## Alternatives Considered

- **Logic inside React components** — rejected: not testable without a DOM,
  non-deterministic, and any re-render risks duplicating effects.
- **A mutable `Game` class** — rejected: simpler to write, but you lose state
  comparison ("is the state identical after a pause?") and tests have to rebuild
  the object for every scenario.
- **An external ECS library** — rejected: game-engine dependencies are ruled out
  by the brief, and it would be oversized for five entities.

## Consequences

- ✅ The engine is testable without a DOM or time mocking: `tests/` runs in a
  `node` environment.
- ✅ A test can build a state from scratch (`patchState`), so reaching a given
  situation does not require simulating minutes of gameplay.
- ✅ Comparing two states is enough to prove the absence of progress (pause,
  wipe): `expect(after).toBe(before)`.
- ⚠️ Every step allocates a clone of the state. At 10 steps per second for five
  members the cost is negligible, but it would not be for a 40-player raid.
- ⚠️ Contributors have to think immutably: mutating `state.party[0].hp` directly
  from a component would silently break the contract.
