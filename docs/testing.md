# Testing

```bash
npm test          # single run
npm run test:watch
```

Runner: **Vitest**, `node` environment (`vite.config.ts` → `test.environment`).
The tests exercise the **pure engine** only: no DOM, no React render, and no
time mocking is needed — `stepSimulation` takes the delta as a parameter.

## Layout

| File | Coverage |
| --- | --- |
| `tests/helpers.ts` | helpers: `advance`, `patchMember`, `patchState`, `isolateTimers`, `unlockAllSpells` |
| `tests/classicStats.test.ts` | vanilla formulas, party health and mana, rank 1 spell values |
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
  mana: that is how Renew, Heal, Flash Heal and Prayer of Healing get tested
  even though the fight is played at level 1.
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

## Manual UI check

The React layer has no automated tests. To verify it:

```bash
npm run build && npm run preview
```

Things to check: the enemy selection screen on load (three cards, each with a
level), selecting a frame, the refusal message shown when tapping an
unavailable spell, the cast bar and `Cancel` button, GCD progress across the
five buttons, the boss health bar draining over the fight, the end screen
titled "Victory" or "Wipe" depending on which happened, "New fight" (same
enemy, new seed), and "Choose another enemy" (back to the selection screen).
