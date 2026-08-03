# Architecture

## Layers

```
┌───────────────────────────────────────────────────────────────┐
│ components/  — rendering, touch input                         │  React
│ hooks/       — useGameLoop (rAF), useGameStore (subscriptions) │
├───────────────────────────────────────────────────────────────┤
│ store/gameStore.ts — mutable source of truth + snapshots      │  Bridge
├───────────────────────────────────────────────────────────────┤
│ simulation/  — pure engine: stepSimulation, actions, effects  │  Engine
│ config/gameConfig    — balance constants (derived)            │
│ config/classicData   — WoW Classic 1.12 data + formulas       │  Data
└───────────────────────────────────────────────────────────────┘
```

Dependencies point **strictly downwards**: `simulation/` never imports
`store/`, `hooks/` or `components/`. The engine is therefore usable — and
tested — without React or a DOM.

## Before the fight

`App` renders `EnemySelect` — three cards (name, level, one-line profile)
built from `ENEMIES` / `ENEMY_ORDER` in `gameConfig.ts` — until the player
picks an enemy. No `GameStoreContext` exists yet at that point; `App` only
mounts `Fight` (the former `App` body: the store, the game loop, the layout)
once a choice is made, passing the chosen `EnemyId` into
`createGameStore(seed, enemyId)`. The game-over screen's "Choose another
enemy" button unmounts `Fight`, tearing the store down, and returns to
`EnemySelect`. See [ADR-0016](./adr/0016-selectable-enemy-encounters.md).

`classicData.ts` is the bottom layer: it depends on nothing and holds only
sourced values plus the game's official formulas. `gameConfig.ts` derives every
balance constant from it (see [classic-stats.md](./classic-stats.md)).

## Engine modules

| File | Role |
| --- | --- |
| `types.ts` | shape of the `GameState` data (no logic) |
| `random.ts` | pure mulberry32 generator: `nextRandom`, `nextRange`, `nextInt` |
| `initialState.ts` | `createInitialState(seed)` and `cloneState` |
| `effects.ts` | applies healing, damage, HoTs and spell effects |
| `feedback.ts` | pushes and prunes combat feedback |
| `simulation.ts` | `stepSimulation(state, dtMs)` — one simulation step |
| `actions.ts` | pure player actions: cast, target, cancel, pause, restart |
| `selectors.ts` | derived reads: ratios, progress, end-of-fight statistics |

## Flow of one frame

```
requestAnimationFrame(t)
  └─ useGameLoop: delta = t - previousT
       ├─ delta > 1000 ms  → discarded (no catch-up)
       ├─ accumulator += delta, capped at 500 ms
       ├─ while accumulator ≥ 100 ms:
       │     store.advance(100) → stepSimulation → new GameState
       │        └─ snapshots recomputed; listeners notified IF one changed
       └─ store.emitFrame() → "frame" callbacks (mana / cast / GCD bars)
```

## Rendering strategy

The tricky constraint is "no full re-render every 100 ms". Three mechanisms
handle it:

1. **Source of truth outside React.** The `GameState` lives in the store, held
   by a `useRef` in `App`. `App` never re-renders during a fight.
2. **Per-component memoised snapshots.** After every step the store rebuilds
   light projections (`MemberSnapshot`, `HeaderSnapshot`, `ControlsSnapshot`,
   messages, summary). When the content is unchanged, the **previous reference
   is kept**. Components subscribe through `useSyncExternalStore`: React
   compares the reference and only re-renders what actually changed. A party
   frame therefore re-renders only when its health, alive state, Renew,
   selection or feedback changes. The boss health bar (ADR-0017) rides
   `HeaderSnapshot` rather than a `useFrame` CSS-variable channel: it only
   changes once a second (`PARTY_DAMAGE.intervalMs`), the same cadence the
   header's timer label already re-renders on.
3. **Continuous values outside React.** Mana, cast progress and GCD progress
   change on every step: they are written straight into **CSS variables**
   (`--mana-fill`, `--cast-progress`, `--gcd-progress`) and a `textContent`
   through DOM refs, inside the `onFrame` callbacks. No React render is
   triggered.

`React.memo` wraps every subscribed component (`PartyFrame`, `PartyList`,
`SpellButton`, `CastBar`, `ManaBar`, `Header`, `Controls`, `GameOver`,
`MessageFeed`), and callbacks passed as props are stabilised with `useCallback`.

## Cleanup

- `useGameLoop` cancels its `requestAnimationFrame` and removes its
  `visibilitychange` listener on unmount.
- `useFrame` returns the store's unsubscribe function from its `useEffect`.
- Expired feedback is pruned on every step and the list is capped at
  `FEEDBACK.maxEntries`: no memory build-up is possible.

## What the application does not do

- no network call, no remote asset, no CDN;
- no persistence (`localStorage`, `sessionStorage`, cookies, IndexedDB);
- no real timer (`setInterval` / `setTimeout`) in the business logic.
