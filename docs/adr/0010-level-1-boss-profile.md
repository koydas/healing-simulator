# ADR-0010: Level 1 boss profile — what is sourced, what is designed

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

The boss has to be level 1 as well. But the party's health just dropped from
4000 to about fifty: the 400 damage per hit of the first version would kill
anyone instantly.

Two difficulties:

1. No level 1 creature is a real boss in WoW Classic. The "boss"-rank entries at
   level 1 in `creature_template` are shapeshift forms and triggers, not
   opponents.
2. An ordinary level 1 creature hits for 2 to 10 every 2 s, i.e. 1 to 5 damage
   per second. Against a Lesser Heal restoring 51 health every 1.5 s there is no
   fight at all: the healer wins indefinitely, and the ×1.15 ramp would take
   eleven minutes to change anything.

So an opponent has to be built — but built **from the data** rather than out of
thin air.

## Decision

The boss is a **level 1 elite**, and every value is either measured or
explicitly designed and justified.

Measurements taken from the vanilla database (597 real level 1 creatures,
filtered of triggers and forms):

| Measurement | Value |
| --- | --- |
| Melee damage, median | 2 |
| Melee damage, 3rd quartile | 9 – 10 |
| Attack speed | 2000 ms |
| Elite damage factor | ×1.24 (lv. 20) to ×3.1 (lv. 30-60) |

Resulting profile:

- **Melee: 8 damage every 2 s.** The amount is bracketed by the measurements
  (median 2 × 3 = 6; high end 10 × 1.2 = 12) and placed in the middle of that
  range. The cadence, on the other hand, is **sourced**: every level 1 creature
  has `MeleeBaseAttackTime = 2000`. It replaces the 1.5 s of the original brief.
- **AoE: 6 damage on every living member every 12 s** — designed.
- **Spike: 18 damage on a living non-tank every 6 to 10 s** — designed,
  calibrated to remove roughly a third of a level 1 DPS's health.
- **Ramp: ×1.15 every 30 s** — unchanged, it is the mode's mechanic.

Result measured by simulation (automated healer, eight seeds): 22 s of survival
with no healing, 48 to 97 s with a naive healer. Initial pressure is 8.8 HP/s
against roughly 15 HP/s sustainable — holdable at first, doomed in the long run.

## Alternatives Considered

- **Copying a level 1 creature literally** (2 damage / 2 s) — rejected:
  faithful but unplayable, the healer cannot lose.
- **Applying the ×3 elite factor to the high end** (30 damage per swing) —
  rejected: the tank dies in three hits and there is no fight left.
- **Keeping the 1.5 s cadence from the original brief** — rejected after
  measuring: the vanilla 2 s cadence is sourced, and it stretches unhealed
  survival from 16 s to 22 s, which gives the player time to act.
- **Raising the party's health to compensate** — rejected: that would throw away
  the stat fidelity gained in ADR-0007.

> Update (ADR-0017): the boss now has a health pool too, and the party (tank +
> DPS) chips away at it over the fight. "Doomed in the long run" and "holdable
> at first" described a fight that could only ever end in a wipe — that is no
> longer true, a fast enough kill now ends it in a win instead. The profile
> and its measurements above are unchanged; only the possible outcomes are not
> the ones described here anymore.

> Update (ADR-0021): melee drops from 8 to 5 damage every 2 s. Per-class
> spellbooks made the priest's level 1 kit Renew alone (3 HP/s sustained on
> one target); at 8 per swing (4 HP/s) the tank's own damage could not be
> out-healed by Renew even with perfect, unlimited-mana play — simulating the
> naive-healer benchmark found 0 wins in 400 seeds. At 5 per swing (2.5 HP/s)
> Renew clears it with a margin and the benchmark returns a real win/wipe mix
> again. Druid and paladin, whose level 1 spell is a strong direct heal, were
> never at risk from the original value. AoE, spike and ramp are unchanged.

## Consequences

- ✅ The fight remains a fight, at a credible level 1 scale.
- ✅ The designed part is explicitly separated from the sourced part, both in
  [`docs/classic-stats.md`](../classic-stats.md) and in the `gameConfig.ts`
  comments.
- ✅ The measurements are reproducible: the source tables are public and the
  filtering is described.
- ⚠️ Three values out of four (AoE, spike, ramp) remain game design. The boss is
  not "a WoW Classic creature", it is an opponent calibrated for level 1 scale.
- ⚠️ The melee cadence changed (1.5 s → 2 s): the tests that checked it were
  updated and now read `TANK_DAMAGE.intervalMs` instead of a literal.
