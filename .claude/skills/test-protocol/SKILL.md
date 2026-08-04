---
name: test-protocol
description: Test conventions for this repo — Vitest in a node environment over the pure engine, the tests/helpers.ts toolkit, reading timings from config instead of literals, failure-branch coverage, and reproducing a bug before fixing it. Use this skill whenever you add or modify tests, whenever you change anything under src/simulation/ or src/config/, and whenever a test fails in a way you do not immediately understand.
---

# test-protocol

## When to Apply

Adding or changing tests, changing engine or config code (which always needs a
test), and investigating a failing or flaky test.

## Expected Behavior

### Running

```bash
npm test          # single run
npm run test:watch
```

Vitest, `environment: 'node'`, files matched by `tests/**/*.test.ts`. There is
no DOM, no jsdom, no React testing library — the engine is pure, so tests
exercise it directly. Import from `vitest` explicitly (`describe`, `it`,
`expect`); globals are not enabled.

The store (`tests/gameStore.test.ts`) and the profile (`tests/profile.test.ts`)
run in that same environment, and they have to keep doing so. That is why
`createGameStore` takes its callbacks as options and the storage functions take
their `Storage` as an argument: **inject the dependency, do not mock a global**.
A persistence test builds a plain object with `getItem` / `setItem` /
`removeItem` — plus one that throws on every call, standing in for a browser
that refuses storage.

### Build the situation, do not play towards it

`tests/helpers.ts` exists so a test can jump straight to the interesting state
instead of simulating minutes of fight:

| Helper | Use |
| --- | --- |
| `advance(state, ms)` | run the simulation in `TICK_MS` steps |
| `isolateTimers(state)` | push tank / AoE / spike / mana ticks far away to isolate one behaviour |
| `patchMember(state, id, patch)` | put a member at a chosen health, or kill them |
| `patchState(state, patch)` | force any field — `elapsedMs`, a timer, `status`, `mana` |
| `unlockAllSpells(state)` | raise `playerLevel` and mana to reach the spells gated above level 1, leaving health and regeneration where the fight built them |
| `memberOf`, `totalHp` | read helpers |

To fight *as* a higher-level party — the Classic tables applied to everyone —
build the state with `createInitialState(seed, 60)` instead; `unlockAllSpells`
only moves the gate.

A typical isolation: `isolateTimers`, then set exactly the one timer you care
about to `TICK_MS`, then step once.

### Timings

- Durations passed to `advance` must be multiples of 100 ms — it rounds
  `ms / TICK_MS`, so 1250 ms silently becomes 1300 ms.
- An event scheduled at 2000 ms fires during the step that **reaches** 2000 ms,
  not the one after. The same applies to the five-second rule: the tick landing
  exactly at 5000 ms already counts.
- Read cadences from the config (`TANK_DAMAGE.intervalMs`, `MANA.tickMs`,
  `SPELLS.lesserHeal.castTimeMs`) rather than writing `2000`. A balance change
  should then break only the assertions about *values*, not the ones about
  *timing*.

Values themselves (90 / 51 / 55 / 50 / 46 health, 8 / 6 / 18 damage) are fine as
literals with a comment — they are what the test is pinning down.

### Coverage expectations

- Every exported engine function is tested on **its failure branches**, not
  only the happy path: the refusal that spends nothing, the dead target, the
  empty candidate list, the zero-width range.
- Determinism gets its own guard: same seed and same actions produce an equal
  state, and the input state is never mutated.
- Never reduce the number of tests in a file. If a test becomes wrong because
  behaviour changed on purpose, rewrite what it asserts and say so in the commit
  message — do not delete it.

### Fixing a bug

Reproduce first. Write the failing test — or a scratch script printing the
symptom — before touching the fix, so you know the fix is a fix. Every bug
found in review so far had a two-line reproduction; the reproduction is also
what makes the review reply convincing.

Then keep the test: bugs that reached review are exactly the ones worth pinning.

### Pin a consequence you decided to live with

When a change knowingly leaves the game in a state you are not fixing yet, the
assertion is the honest place to say so — `tests/gameStore.test.ts` asserts
that a level 60 party wins with no healing, because the encounters stayed level
1 designs. A test like that is documentation with a build failure attached: it
breaks the day someone scales the bosses, which is exactly when it should.
Never delete one to tidy up a suite.

## Constraints

- No test may need a DOM, a browser, or a timer mock.
- Do not use `--no-verify` or skip the suite before committing; the Docker build
  runs `npm test` too, so a red suite blocks the image as well.
- Do not weaken an assertion to make it pass (`toBeGreaterThan(0)` where the
  exact value is known); pin the value, or the test stops catching anything.
- Statistical assertions need a fixed seed and a wide enough tolerance to be
  deterministic — see the healing-distribution tests for the shape.

## References

- `docs/testing.md` — file-by-file coverage map and reference values
- `tests/helpers.ts` — the toolkit described above
- `tests/spells.test.ts` — refusals, cancellation, five-second rule
- `tests/classicStats.test.ts` — formulas and distribution checks
- `tests/profile.test.ts` — injected storage, corrupt saves, a storage that
  throws
- `tests/gameStore.test.ts` — the store's callbacks, and the balance
  consequence of levelling, asserted rather than left implicit
