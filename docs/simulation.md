# Simulation engine

## Contract

```ts
stepSimulation(state: GameState, dtMs: number): GameState
```

- **Pure**: the input state is never mutated; a new state is returned. The
  engine works on a deep clone (`cloneState`).
- **Clockless**: no `Date.now()`, `performance.now()`, `Math.random()`, DOM
  access or React API under `src/simulation/`. The real clock is only read in
  `src/hooks/useGameLoop.ts`.
- **Fixed step**: the loop always calls `stepSimulation(state, 100)`. Every
  timeline interval is a multiple of 100 ms, so resolution is exact.
- **Inert outside an active fight**: when `status !== 'active'` the function
  returns **the same reference**. Pause and wipe therefore freeze the game
  completely.

## Resolution order

When several events land on the same instant they resolve in this order — the
part of the contract that makes the game predictable:

1. cast completion;
2. HoT ticks;
3. mana regeneration;
4. tank damage;
5. AoE damage;
6. spike;
7. death resolution;
8. wipe check;
9. party damage on the boss;
10. victory check.

Step 10 is a no-op once step 8 has already ended the fight this tick: a
mutual kill (the boss and the tank dying on the same step) resolves as a
wipe, not a victory. See [ADR-0017](./adr/0017-boss-health-and-victory.md).

Expired feedback is pruned after step 10.

Before step 1 the step updates `elapsedMs`, `damageMultiplier`,
`gcdRemainingMs` and `msSinceLastCastStart` (the five-second rule counter).

## Determinism

The pseudo-random generator state (`state.seed`) is part of the `GameState`.
Randomness is consumed in exactly three places, always in the same order:

| Order within the step | Use |
| --- | --- |
| heal completion | roll inside the spell's range, e.g. 46 – 56 (`rollHealAmount`) |
| spike, first | target choice among living non-tanks |
| spike, then | next spike interval, uniform in [6 s, 10 s) |

One extra draw happens once, in `createInitialState`, to schedule the **first**
spike.

Consequence: *same seed + same action sequence ⇒ same fight*, whatever the time
slicing. `tests/determinism.test.ts` verifies it.

## Damage timeline

The three timers below (`state.timers.tankDamageMs` / `aoeMs` / `spikeMs`) are
always driven by `state.encounter` — the profile of the enemy picked on the
selection screen (ADR-0016), copied in at `createInitialState`. The table
shows the default, Gorvath the Cavebreaker; Skarn the Swarmcaller and Threx
the Impaler have their own amounts and cadences, listed in
[balance.md](./balance.md#enemies--three-selectable-encounters). The melee
cadence (2 s) is the one number every enemy shares — it is sourced, not
designed.

| Event | Amount | Interval | First hit |
| --- | --- | --- | --- |
| Melee on the tank | 8 | 2 s (vanilla cadence) | 2 s |
| AoE | 6 per living member | 12 s | 12 s |
| Spike | 18 on a living non-tank | uniform [6 s, 10 s) | rolled at creation |

Those amounts are on a level 1 scale (the tank has 90 HP). Where each one comes
from — measured or designed — is detailed in
[classic-stats.md](./classic-stats.md).

The ramp multiplies all damage **cumulatively** by 1.15 every 30 s:

```
multiplier = 1.15 ^ floor(elapsedMs / 30000)

0 – 29.999 s   ×1.0000
30 – 59.999 s  ×1.1500
60 – 89.999 s  ×1.3225
```

The final amount is rounded to the nearest integer (`Math.round`) before being
applied. A spike that finds no valid target deals nothing but still reschedules
the next one.

## Boss health and outcome

The tank and the three DPS deal `PARTY_DAMAGE.perMemberAmount` (3, designed)
each, once per second (`timers.partyDamageMs`), to `state.bossHp` — the healer
never contributes. A dead contributor's share is simply not dealt; the
survivors do not pick up the slack. `state.bossHp` starts at
`state.encounter.hpMax` and is clamped at 0.

When it reaches 0 while the fight is still active, `status` becomes `'over'`
and `state.outcome` becomes `'victory'` (step 10). The existing wipe check
(step 8, tank death or `WIPE.maxDeaths`) sets `outcome` to `'wipe'` the same
way; `outcome` is `null` for the whole fight until one of the two fires. See
[ADR-0017](./adr/0017-boss-health-and-victory.md) for the calibration and the
death-spiral dynamic this creates (fewer DPS alive → slower kill → more time
for the ramp to finish the party).

## Cast rules

`checkCast(state, spellId)` refuses in this order — the first matching reason is
the one displayed:

| Order | Reason | Message |
| --- | --- | --- |
| 1 | fight is over | `Fight is over` |
| 2 | game paused | `Game paused` |
| 3 | the healer is dead | `You are dead` |
| 4 | already casting | `Already casting` |
| 5 | global cooldown active | `Global cooldown` |
| 6 | spell not trained at this level | `Level too low` |
| 7 | no target (targeted spells) | `Target required` |
| 8 | target is dead | `Target is dead` |
| 9 | not enough mana | `Not enough mana` |

A refusal spends **no** mana and triggers **no** GCD; it only produces a
message.

An accepted cast spends mana immediately, triggers a 1.5 s GCD and resets
`msSinceLastCastStart`. Instant spells (Renew) apply their effect straight away
and count both as *started* and *completed*.

A cast is cancelled in four cases only: the `Cancel` button, its target dying,
**the healer dying**, or the fight ending. A cancellation keeps the mana and the
GCD, applies no healing and increments `castsCancelled`.

## When the healer dies

Elowen is a party member like any other: an AoE or a spike can kill her while
the tank is still holding, and the fight carries on until a wipe condition is
met. From that moment the player is a spectator:

- every cast is refused with `You are dead`, and spends neither mana nor GCD;
- the cast in flight is interrupted (it counts as cancelled and heals nobody);
- HoTs applied while she was alive **keep ticking**, as they do in game.

## Mana — vanilla model

- pool: 160 for a level 1 human priest (2956 at level 60), full at the start;
- regeneration lands in **2-second ticks** (`timers.manaTickMs`), not
  continuously;
- a tick only credits mana when `msSinceLastCastStart >= 5000`: that is the
  **five-second rule**, which fully suspends regeneration after any
  expenditure;
- amount per tick: `state.manaRegenPerTick`, 18.5 at level 1 (spirit 24) and
  45.25 at level 60 — it is a state field so a step never has to look the
  level up;
- mana is clamped to `[0, manaMax]`.

See [ADR-0009](./adr/0009-vanilla-mana-regen-five-second-rule.md).

## Level and spell availability

The `GameState` carries `playerLevel`, taken from the saved profile when the
fight is created (1 without one, 60 at most). It does two things: a spell whose
`requiredLevel > playerLevel` is refused with the `level` reason, and the whole
party's health, mana and regeneration are built from the Classic tables at that
level. At level 1 only Lesser Heal is available; the other buttons are visible
but locked, and unlock at 8, 16, 20 and 30. See
[ADR-0008](./adr/0008-classic-spellbook-level-gating.md) and
[ADR-0019](./adr/0019-levelling-to-60-and-boss-experience.md).

The level never changes **during** a fight: experience is granted when the
fight ends, outside the engine, and applies from the next one.

## Renew

- 5 ticks of 9 (45 total), **3 s** apart, with **no immediate tick**;
- never stacks: reapplying replaces the effect, resets the ticks to 5 and the
  delay to 3 s;
- falls off when its carrier dies.

## End of fight

The fight ends in one of two ways, and `state.outcome` records which:

- **Wipe** (`outcome: 'wipe'`) — the tank dies, **or** three members are dead.
- **Victory** (`outcome: 'victory'`) — the boss's health reaches 0 while the
  fight is still active (see "Boss health and outcome" above).

Either way the engine sets `status` to `'over'` and cancels the running cast.
Nothing can happen afterwards: `stepSimulation` returns the state untouched.

## Guaranteed invariants

| Invariant | Where it is enforced |
| --- | --- |
| `0 <= hp <= hpMax` | `applyHealTo` / `applyDamageTo` (clamps) |
| `0 <= mana <= manaMax` | `regenerateMana`, `castSpell` |
| no healing on a dead target | `applyHealTo`, `applySpellEffect` |
| a dead healer casts nothing | `checkCast` (`caster_dead`) + `resolveDeaths` |
| no spell cast below its required level | `checkCast` (`level` reason) |
| nothing spent when a cast is refused | `castSpell` (refusal branch) |
| no refund after an interruption | `cancelActiveCast` |
| Renew never stacks | `applyHot` (replacement by `spellId`) |
| no progress while paused | `stepSimulation` guard clause |
| same seed + same actions = same fight | seed inside the state |
| no real timer in the business logic | no time API under `simulation/` |
| no event after the fight ends (wipe or victory) | `stepSimulation` guard clause |
| `bossHp` never negative | `applyPartyDamage` (clamp) |
| no feedback memory leak | `pruneFeedback` + the `maxEntries` cap |

## Statistics

`GameStats` accumulates raw healing, effective healing, overhealing, mana spent,
damage taken (health actually lost), casts started and completed per spell,
casts cancelled, and deaths (ids, in order).

`computeStatsSummary` derives:

```
HPS         = effective healing / duration in seconds
Overheal %  = overhealing / raw healing × 100
Efficiency  = effective healing / mana spent
```

All three are 0 when their denominator is zero. `StatsSummary.outcome` mirrors
`state.outcome`, so the end screen can title itself "Victory" or "Wipe".
