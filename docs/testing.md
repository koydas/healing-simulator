# Testing

```bash
npm test          # single run
npm run test:watch
```

Runner: **Vitest**, `node` environment (`vite.config.ts` → `test.environment`).
The tests exercise the **pure engine**, the store and the profile: no DOM, no
React render, and no time mocking is needed — `stepSimulation` takes the delta
as a parameter, and the storage functions take their `Storage` as an argument.

## Layout

| File | Coverage |
| --- | --- |
| `tests/helpers.ts` | helpers: `advance`, `patchMember`, `patchState`, `isolateTimers`, `unlockAllSpells` |
| `tests/classicStats.test.ts` | vanilla formulas, party health and mana at levels 1 and 60, the experience table and cap, spells known per level, rank 1 spell values |
| `tests/profile.test.ts` | experience granted and carried across levels, the cap, the per-boss record, the designed reward, and the `localStorage` layer (round-trip, corrupt save, clamping, delete, storage that throws) |
| `tests/gameStore.test.ts` | the store builds a fight at the level it is given, reports the end of a fight exactly once with the enemy fought, and a level 60 party wins with no healing (the balance consequence of ADR-0019) |
| `tests/random.test.ts` | PRNG purity, `nextRange` / `nextInt` bounds, seed normalisation |
| `tests/determinism.test.ts` | seed + action replayability, non-mutation, time slicing |
| `tests/damage.test.ts` | tank damage, AoE, spike selection and rescheduling, ramp (Gorvath, the default enemy) |
| `tests/encounter.test.ts` | enemy selection: `ENEMY_ORDER`/`ENEMIES` shape, `state.encounter` per enemy, per-enemy damage applied, `restartGame` with an explicit enemy, determinism per enemy |
| `tests/bossHealth.test.ts` | boss health per enemy, party damage per tick (scaled by alive contributors, healer excluded), clamped at 0, victory sets `outcome`/cancels the cast, a simultaneous tank+boss death resolves as a wipe, no event after the fight ends, both outcomes reachable through the real cast/select/step path |
| `tests/spells.test.ts` | level gating, cost, GCD, refusals, cast resolution, Renew, cancellation, five-second rule |
| `tests/healing.test.ts` | effective healing vs overhealing, `hpMax` clamp, dead targets, HPS / efficiency |
| `tests/wipe.test.ts` | wipe conditions, freeze after a wipe, pause, invariants over a full fight |
| `tests/selectors.test.ts` | ratios, cast / GCD progress, feedback, duration formatting |
| `tests/assetBase.test.ts` | the build base stays root-relative, so the SPA fallback boots on any path (ADR-0011) |

## Techniques used

- **`isolateTimers(state)`** pushes the timeline (tank / AoE / spike) far away so
  one behaviour can be observed in isolation — for instance a spell's healing
  without incoming damage muddying the health values.
- **`patchState` / `patchMember`** build a precise situation (a member at 10 HP,
  a timer at 100 ms, `elapsedMs` at 29,900 ms) without playing minutes of
  simulation. That works because the `GameState` is a plain data structure.
- **`unlockAllSpells(state)`** raises `playerLevel` to 60 and grants the needed
  mana, leaving health and regeneration where the fight built them: that is how
  Renew, Heal, Flash Heal and Prayer of Healing get tested against level 1
  pools. To fight *as* a level 60 party instead — the Classic tables applied to
  everyone — build the state with `createInitialState(seed, 60)`.
- **A fake `Storage`** (a plain object with `getItem` / `setItem` /
  `removeItem`) drives the persistence tests, including one that throws on
  every call to stand in for Safari's private mode. No global is mocked.
- **`advance(state, ms)`** slices into `TICK_MS` steps: beware, the durations
  passed in must be multiples of 100 ms (otherwise they get rounded).

## Requirements

- every new exported engine function is tested on **its failure branches**, not
  just its happy path;
- never reduce the test count of an existing file;
- the following tests are mandatory (original requirement) and must stay:
  determinism, tank damage, AoE, spike selection, ramp, Renew application and
  refresh, cast interruption, mana expenditure, overheal computation, wipe
  conditions, no progress while paused;
- since the move to Classic stats, add: the stamina → health and intellect →
  mana formulas, the party's derived health, spell availability by level, and
  the five-second rule.

## Reference values

The tests rely on the level 1 stats: tank 90 HP, healer 51 HP and 160 mana, DPS
55 / 50 / 46 HP; melee 8, AoE 6, spike 18. Timings are read from the
configuration (`TANK_DAMAGE.intervalMs`, `MANA.tickMs`, …) rather than written
as literals — a balance change therefore only breaks value assertions, not
cadence ones.

At the other end of the table: tank 2639 HP, healer 1707 HP with 2956 mana and
45.25 mana per tick, DPS 2093 / 1620 / 2177 HP. On the progression side, 400
experience for level 2, 4 084 700 for the whole climb, and a 136-point reward
for a level 1 victory.

## Manual UI check

The React layer has no automated tests. To verify it:

```bash
npm run build && npm run preview
```

Things to check: the home screen on load (character sheet with the experience
bar, record table, three enemy cards), the options dialog (focus lands in it,
Tab cannot reach the screen behind, `Escape` closes it, "Delete saved game"
asks twice then resets the sheet to level 1), the experience line on the end
screen after a victory, and the sheet showing the new level once you come back.
Then: `?seed=1&enemy=skarn&level=30` skipping straight to that fight, at the
level the link pins rather than whatever the current profile is; opening the
same kind of link at a level *different* from the current profile's and
confirming the end screen shows the "not recorded" note instead of an
experience line, and that the profile's level and record are unchanged
afterwards; picking an enemy from the screen rewriting the URL to
`?seed=…&enemy=…&level=…` afterwards, selecting a frame, the refusal message
shown when tapping an unavailable
spell, the cast bar and `Cancel` button, GCD progress across the five
buttons, the boss health bar draining over the fight, the end screen titled
"Victory" or "Wipe" depending on which happened, "New fight" (same enemy, new
seed — and the URL's `seed` updating to match), and "Choose another enemy"
(back to the selection screen, with `seed` and `enemy` cleared from the URL —
picking a new enemy afterwards must roll a fresh seed, not reuse the
completed fight's).
