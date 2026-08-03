# ADR-0016: A selection screen and three enemy encounters, carried in `GameState`

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

Until now the game had exactly one opponent: Gorvath the Cavebreaker, wired as
a handful of top-level constants (`BOSS`, `TANK_DAMAGE`, `AOE_DAMAGE`,
`SPIKE_DAMAGE`) that `src/simulation/simulation.ts` imported directly. Opening
the app always dropped the player straight into the same fight shape.

Requested change: opening the app should offer a choice of enemies, each
showing its level, before the fight starts. That means the damage profile can
no longer be a fixed import read by the engine — it has to vary per fight
while the engine stays pure and replayable.

## Decision

Three level 1 elite encounters, each an `EncounterProfile` (`src/simulation/types.ts`):
tank melee, AoE, and spike — the same three timers `simulation.ts` already
drove, just parameterised instead of imported as constants.

- **Gorvath the Cavebreaker** — the original profile, numerically unchanged:
  melee 8 / 2 s, AoE 6 / 12 s, spike 18 in [6 s, 10 s). See ADR-0010.
- **Skarn the Swarmcaller** — AoE-heavy: melee 6 / 2 s, AoE 8 / 9 s, spike 14
  in [8 s, 12 s). The whole party takes chip damage together instead of one
  target at a time.
- **Threx the Impaler** — burst: melee 9 / 2 s, AoE 4 / 16 s, spike 26 in
  [5 s, 8 s). A single hit can remove over half of a level 1 DPS's health.

All three keep the melee cadence at 2000 ms — sourced, identical for every
level 1 creature (ADR-0010) — and only the *amount* per profile is designed.
The ramp (×1.15 / 30 s) stays a single global constant: it is the game mode's
mechanic, not a property of an enemy, so it was not tripled.

`createInitialState(seed, playerLevel, enemyId)` looks the profile up in
`ENEMIES` and copies it into `state.encounter`. `stepSimulation` reads
`draft.encounter.tankDamage` / `.aoeDamage` / `.spikeDamage` instead of the old
static imports — the engine stays a pure function of its input state, and a
fight replays identically from its seed *and* its encounter, both carried
inside `GameState`.

On the React side, `App` renders `EnemySelect` (three cards, name + level +
one-line profile description) until a choice is made, and only then mounts
`Fight`, which creates the store for that `enemyId`. No `GameStoreContext`
exists before a choice — there is no "empty" `GameState` to fake. The
game-over screen gained a second button, "Choose another enemy", which
unmounts `Fight` back to `EnemySelect`; "New fight" keeps its original
behaviour of a same-enemy rematch on a new seed.

Calibration used the same method as ADR-0010 — an automated healer chaining
Lesser Heal on the lowest-ratio ally, eight fixed seeds — to keep all three
profiles in a comparable difficulty band:

| Enemy | No healing | Naive automated healer |
| --- | --- | --- |
| Gorvath | 22 s | 48 – 63 s |
| Skarn | 26 s | 40 – 63 s |
| Threx | 20 s | 34 – 56 s |

Skarn and Threx land lower on the naive-healer end than Gorvath by design: a
bot that always heals the single lowest-HP target is structurally worse at
spreading heals across a bleeding party (Skarn) or reacting to short-fuse
bursts (Threx) than a human player using Renew or pre-emptive casts would be —
the same caveat ADR-0010 already carries for Gorvath.

## Alternatives Considered

- **Pick the enemy at random each fight** — rejected: removes player agency,
  and makes it impossible to intentionally replay a specific fight shape (the
  `?seed=` mechanic from ADR-0005 would then also need to pin the enemy, which
  is exactly what carrying it in `GameState` already gives for free).
- **A single difficulty multiplier on Gorvath's existing profile** — rejected:
  a faster or slower version of the same shape does not teach a different
  healing pattern; the interesting distinction is *where* the damage lands
  (single target, spread, or burst), not how much.
- **Keep the profile a module-level mutable variable set before creating the
  state** — rejected: it would work, but it breaks the purity contract this
  project has held onto since ADR-0001 — the engine would depend on something
  outside its input state, and a state clone would silently carry whatever the
  variable held *at clone time*, not at creation time. Embedding the profile
  in `GameState` keeps `stepSimulation` a pure function of its argument.
- **Per-enemy ramp** — rejected for now: no profile needed it to reach a
  comparable difficulty band, and the ramp already reads as "the mode's
  mechanic" rather than a boss ability. Left as a lever if a future enemy
  needs it.

## Consequences

- ✅ Gorvath's numbers, and the fight it produces, are byte-for-byte unchanged
  — `TANK_DAMAGE`, `AOE_DAMAGE`, `SPIKE_DAMAGE` still name its profile, and
  every pre-existing test that reads them still passes without modification.
- ✅ The engine's purity is preserved: the encounter travels inside
  `GameState`, so determinism (`docs/simulation.md`) still only depends on the
  seed and the action sequence.
- ✅ Each enemy exercises a different triage skill, and the difficulty stays
  in a comparable band, verified with the same measurement method as
  ADR-0010.
- ⚠️ Three profiles to keep balanced instead of one: a future tuning pass
  touches three rows in `docs/balance.md`, not one.
- ⚠️ The ramp is intentionally *not* per-enemy. If a future encounter needs a
  different ramp, `EncounterProfile` will need a `ramp` field and `RAMP` will
  stop being a single shared constant — deferred until an enemy actually needs
  it.
