# ADR-0003: Deterministic pseudo-random generator carried in the state

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

Three mechanics need randomness: the target of a spike, the healing amount
(rolled inside the spell's range, e.g. 46 – 56 for Lesser Heal), and the delay
before the next spike. `Math.random()` would make every fight unique but also
impossible to replay, debug and test — you could not write "this spike must hit
a non-tank" without relying on luck.

## Decision

A pure **mulberry32** generator lives in `src/simulation/random.ts`:

```ts
nextRandom(seed: number): { value: number; seed: number }
```

The generator state is a plain integer stored in `state.seed` and replaced on
every draw. No function keeps hidden state.

The consumption order is fixed and documented:

1. the healing amount, when a cast completes;
2. the spike target;
3. the next spike interval.

`createInitialState(seed)` performs a single draw, to schedule the **first**
spike, and keeps the original seed in `initialSeed` (shown on the end screen,
usable through `?seed=`).

## Alternatives Considered

- **`Math.random()`** — rejected: no reproducibility, fragile tests.
- **A mutable PRNG object (`rng.next()`)** — rejected: cloning the state would
  no longer capture the generator's position; two "identical" states would
  diverge on the next draw.
- **Mersenne Twister / an external library** — rejected: unnecessary dependency
  for the statistical quality needed here; mulberry32 fits in ten lines and is
  more than good enough for a game.

> Update (ADR-0007): the healing roll now uses the Classic spell's min/max range
> instead of a ±10% variation around a base value. Its position in the sequence
> has not changed.

## Consequences

- ✅ Full replayability: `?seed=1337` always produces the same fight for the
  same actions.
- ✅ Tests can sweep 40 seeds and assert a property ("the spike never targets the
  tank", "the interval stays within [6 s, 10 s)").
- ✅ Cloning the state captures the randomness: pause, resume and state
  comparison stay exact.
- ⚠️ Adding a new use of randomness **shifts the whole sequence** of subsequent
  draws: fights recorded with a given seed are only comparable at a fixed engine
  version.
- ⚠️ Since the seed is visible and editable, a player could hunt for a
  favourable one. With no online leaderboard, that is harmless.
