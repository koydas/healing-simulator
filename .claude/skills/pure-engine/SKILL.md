---
name: pure-engine
description: Rules for changing the simulation engine under src/simulation/ — purity, immutability, the fixed 100 ms step, the event resolution order, and seed-carried randomness. Use this skill whenever you touch src/simulation/ or src/config/, add or retune a game mechanic, change what happens on a step, work with timers or randomness, or debug why a fight is not reproducible — even if the change looks like a one-line tweak.
---

# pure-engine

## When to Apply

Any change under `src/simulation/` or `src/config/`: a new mechanic, a new
event on the timeline, a change to healing, damage, deaths or the wipe
conditions, anything touching randomness, and any bug hunt in the fight logic.

The engine is the only part of this project that is genuinely load-bearing: the
whole test suite, replayability, and the pause/wipe guarantees rest on it
behaving like a pure function. Changes that "work" while breaking that contract
usually pass a manual check and fail silently later.

## Expected Behavior

### The contract

```ts
stepSimulation(state: GameState, dtMs: number): GameState
```

- **Never mutate the input.** Start from `cloneState(state)` and mutate that
  draft. Actions in `actions.ts` do the same and return a new state.
- **Return the same reference** when `status !== 'active'`. Pause and wipe rely
  on this: tests assert `expect(after).toBe(before)`, which is only meaningful
  because nothing is reallocated.
- **No clock, no DOM, no React** anywhere under `src/simulation/`. The real
  clock is read in exactly two places, both outside the engine:
  `useGameLoop` (frame timing) and `App.readInitialSeed` (seed generation).

Self-check before committing:

```bash
grep -rnE "Date\.now|performance\.now|Math\.random|setTimeout|setInterval|document\.|window\." src/simulation src/config
```

Only comments should match.

### Randomness

Every draw goes through `random.ts` (`nextRandom`, `nextRange`, `nextInt`) and
threads the seed back into the state:

```ts
const pick = nextInt(draft.seed, candidates.length);
draft.seed = pick.seed;
```

Randomness is consumed in three places, in a fixed order: the healing roll on
cast completion, the spike target, then the next spike interval. **Adding a
fourth draw shifts every subsequent value**, so a seed that produced a given
fight before will not reproduce it. That is acceptable, but say so in the commit
message and in `docs/simulation.md` — someone comparing recorded runs needs to
know the sequence changed.

When you need an integer in an inclusive range, take `max - min + 1` buckets
(`min + Math.floor(value * (max - min + 1))`). Rounding a continuous sample
gives the two endpoints half the weight of the interior values — a real bug this
project already shipped once.

### The resolution order

Events landing on the same instant resolve in this order, and the order is part
of the contract:

1. cast completion, 2. HoT ticks, 3. mana regeneration, 4. tank damage,
5. AoE damage, 6. spike, 7. death resolution, 8. wipe check.

A new event goes in the position where it makes sense against the others, and
`docs/simulation.md` gets the same list updated. Deaths resolve **once**, at
step 7 — never mark someone dead inside a damage helper, or the wipe check and
the feedback ordering fall out of sync.

### Timers

Timers are countdowns in `state.timers`, decremented by `dtMs` and rescheduled
by adding the interval back:

```ts
draft.timers.aoeMs -= dtMs;
while (draft.timers.aoeMs <= 0) {
  /* apply the event */
  draft.timers.aoeMs += AOE_DAMAGE.intervalMs;
}
```

The `while` matters: a long catch-up step can cross two intervals. Keep every
interval a multiple of `TICK_MS` (100 ms) so events land exactly.

### Balance values

Numbers live in `src/config/gameConfig.ts`, never inline in the engine. If the
number claims to come from WoW Classic, it belongs in `classicData.ts` instead —
see the `classic-data` skill.

## Constraints

- Do not add a real timer, an `async` path, or an event emitter to the engine:
  the fixed step is what makes fights reproducible.
- Do not reach for React state or the store from `src/simulation/` — the
  dependency direction is one-way, and breaking it makes the engine untestable
  in the `node` environment.
- Do not silently change the meaning of an existing field of `GameState`;
  add a field instead, so old tests keep saying what they meant.
- A change to the engine without a test is incomplete (see `test-protocol`).

## References

- `docs/simulation.md` — the contract, event order and invariant table
- `docs/adr/0001-pure-simulation-engine.md` — why the engine is pure
- `docs/adr/0002-fixed-timestep-loop.md` — why the step is fixed at 100 ms
- `docs/adr/0003-deterministic-prng-in-state.md` — why the seed lives in the state
- `src/simulation/simulation.ts` — the step itself, in resolution order
