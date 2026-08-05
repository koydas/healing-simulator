# Architecture

## Layers

```
┌───────────────────────────────────────────────────────────────┐
│ components/  — rendering, touch input                         │  React
│ hooks/       — useGameLoop (rAF), useGameStore (subscriptions) │
├───────────────────────────────────────────────────────────────┤
│ store/gameStore.ts — mutable source of truth + snapshots      │  Bridge
│ profile/profileStorage — localStorage read / write / delete   │
├───────────────────────────────────────────────────────────────┤
│ simulation/  — pure engine: stepSimulation, actions, effects  │  Engine
│ profile/playerProfile — pure level / XP / record functions    │
│ config/gameConfig    — balance constants (derived)            │
│ config/classicData   — WoW Classic 1.12 data + formulas       │  Data
└───────────────────────────────────────────────────────────────┘
```

Dependencies point **strictly downwards**: `simulation/` never imports
`store/`, `hooks/`, `components/` or `profile/`. The engine is therefore
usable — and tested — without React or a DOM. The profile flows the other way
as a plain number: `App` hands `profile.level` to `createGameStore`, and the
engine never learns where it came from.

## Before the fight

`App` renders `HomeScreen` until the player picks an enemy: the character
sheet (`CharacterSheet`, derived from the saved profile by
`playerCharacterAtLevel`), the overall record (`BossRecords`), the three
enemy cards (`EnemySelect`, built from `ENEMIES` / `ENEMY_ORDER`, each card
carrying the win/loss record against that boss, read from
`profile.records`) and the options dialog (`OptionsMenu`, which deletes the
save). None of it touches the
store — no `GameStoreContext` exists at that point.

`App` only mounts `Fight` (the store, the game loop, the layout) once a choice
is made, passing the chosen `EnemyId` and the profile's level into
`createGameStore(seed, enemyId, { playerLevel, onFightEnd })`. The game-over
screen's "Choose another enemy" button unmounts `Fight`, tearing the store
down, and returns to the home screen. See
[ADR-0016](./adr/0016-selectable-enemy-encounters.md).

## The profile

`App` owns the profile — level, experience, per-boss record — because it
outlives every fight. The store reports the end of a fight exactly once
through `onFightEnd(outcome, enemyId)`, detected on the state transition into
`status === 'over'`; `App` then applies `applyFightOutcome`, writes the result
to `localStorage` and passes the experience gained down to the end screen.
`App` therefore re-renders once per finished fight (never during one), which
is also when the game-over dialog appears. See
[ADR-0018](./adr/0018-persistent-player-profile-localstorage.md) and
[ADR-0019](./adr/0019-levelling-to-60-and-boss-experience.md).

`classicData.ts` is the bottom layer: it depends on nothing and holds only
sourced values plus the game's official formulas. `gameConfig.ts` derives every
balance constant from it (see [classic-stats.md](./classic-stats.md)).

## Engine modules

| File | Role |
| --- | --- |
| `types.ts` | shape of the `GameState` data (no logic) |
| `random.ts` | pure mulberry32 generator: `nextRandom`, `nextRange`, `nextInt` |
| `initialState.ts` | `createInitialState(seed, level, enemyId)` and `cloneState` |
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

The home screen is outside all of this on purpose: the profile changes at most
once per fight, so `CharacterSheet`, `BossRecords`, `EnemySelect` and the
experience bar are plain memoised components fed by props — no snapshot, no
`useFrame`, and a static inline width for the bar.

## Dialogs

Both dialogs (`GameOver`, `OptionsMenu`) do the three things `role="dialog"`
only claims: `tabIndex={-1}` plus `.focus()` on mount, `inert` on their
siblings (removed on unmount, and only from the siblings they marked), and
`aria-labelledby` pointing at the visible title. `OptionsMenu` also closes on
`Escape`, and its destructive action asks for a second tap before deleting.

## Cleanup

- `useGameLoop` cancels its `requestAnimationFrame` and removes its
  `visibilitychange` listener on unmount.
- `useFrame` returns the store's unsubscribe function from its `useEffect`.
- Expired feedback is pruned on every step and the list is capped at
  `FEEDBACK.maxEntries`: no memory build-up is possible.

## What the application does not do

- no network call, no remote asset, no CDN;
- no server-side state, no account, no cookie, no `sessionStorage`, no
  IndexedDB — the only thing stored is the profile, in `localStorage`, on the
  player's own device and deletable from the options menu (ADR-0018);
- no persistence of a fight in progress: it still dies with the tab;
- no real timer (`setInterval` / `setTimeout`) in the business logic.
