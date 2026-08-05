# Balance

Two files, two roles:

- **`src/config/classicData.ts`** — raw WoW Classic 1.12 data and official
  formulas. Only sourced values go in there (see
  [classic-stats.md](./classic-stats.md)).
- **`src/config/gameConfig.ts`** — game constants. Character stats are
  *computed* from the previous file; only the boss profile and the event cadence
  are set by hand.

No other layer holds a gameplay number.

## Loop

| Constant | Value | Role |
| --- | --- | --- |
| `TICK_MS` | 100 | fixed simulation step |
| `MAX_CATCHUP_MS` | 500 | maximum catch-up per frame (5 steps) |
| `LONG_STALL_MS` | 1000 | beyond this, elapsed time is discarded |
| `DEFAULT_SEED` | 1337 | seed used when `?seed=` is invalid |
| `STARTING_LEVEL` | 1 | level of a character with no saved profile |
| `MAX_LEVEL` | 60 | vanilla level cap |
| `ENEMY_LEVEL` | 1 | level of every encounter, whatever the party's |

## Party — derived from the vanilla formulas

`partyTemplateAtLevel(level)` computes health and mana from race, class and the
attributes of that level; `PARTY_TEMPLATE` is the level 1 case. None of these
values are hard-coded.

| Member | Race / class | Health lv. 1 | Mana lv. 1 | Health lv. 60 |
| --- | --- | --- | --- | --- |
| Thorgrim (tank) | Dwarf warrior | 90 | — | 2639 |
| Elowen (healer) | Human priest | 51 | 160 | 1707 |
| Kaelan (DPS) | Human rogue | 55 | — | 2093 |
| Fizzwick (DPS) | Gnome mage | 50 | 210 | 1620 |
| Sylandra (DPS) | Night elf hunter | 46 | 83 | 2177 |

Changing a member's race or class is enough to recompute their health: you edit
`PARTY_SLOTS`, never a number. A race/class without a full 1 – 60 column in
`RACE_CLASS_ATTRIBUTES` will throw above level 1 — extend the table first.

The healer row is also the player's own character, and its name/race/class
are editable from the sheet (ADR-0020): `partyTemplateAtLevel(level, player)`
overrides just that slot when a `PlayerIdentity` is passed, leaving the other
four untouched. `player` is restricted to `PLAYABLE_CLASSES` — Priest, Mage,
Hunter — because Warrior and Rogue have 0 mana at every level and this game
only simulates a mana-costed spellbook.

## Healer mana

`manaProfileAtLevel(level)`; `MANA` is the level 1 case.

| Constant | Level 1 | Level 60 | Origin |
| --- | --- | --- | --- |
| `MANA.max` | 160 | 2956 | class base + intellect bonus |
| `MANA.tickMs` | 2000 | 2000 | vanilla regeneration tick |
| `MANA.perTick` | 18.5 | 45.25 | `spirit / 4 + 12.5` |
| `MANA.fiveSecondRuleMs` | 5000 | 5000 | five-second rule |
| `GCD_MS` | 1500 | 1500 | vanilla global cooldown |

The amount per tick travels in `GameState.manaRegenPerTick`, set when the fight
is created: the engine reads it from the state rather than looking the level up.

## Experience

| Constant | Value | Nature |
| --- | --- | --- |
| `XP_TO_NEXT_LEVEL` | 400 at level 1 … 209 800 at level 59 (4 084 700 total) | sourced (`player_xp_for_level`) |
| `BOSS_XP.victoryShare` | 0.34 — three victories per level | **designed** |
| `BOSS_XP.wipeShare` | 0 — a wipe pays nothing | **designed** |

`bossXpReward(level)` is `round(xpToNextLevel(level) × victoryShare)`: 136 at
level 1, 7888 at level 20, 71 332 at level 59, 0 at the cap. Progression pacing
is that one constant — see
[ADR-0019](./adr/0019-levelling-to-60-and-boss-experience.md).

## Spells — rank 1, gated by level

| Spell | Level | Mana | Cast | Effect |
| --- | --- | --- | --- | --- |
| Lesser Heal | **1** | 30 | 1.5 s | 46 – 56 |
| Renew | 8 | 30 | instant | 9 per tick × 5, every 3 s |
| Heal | 16 | 155 | 3.0 s | 295 – 341 |
| Flash Heal | 20 | 125 | 1.5 s | 193 – 237 |
| Prayer of Healing | 30 | 410 | 3.0 s | 312 – 333 on the party |

At level 1 only Lesser Heal is castable; the others appear locked with their
required level (ADR-0008) and unlock as the character levels. No per-spell
cooldown, no haste, no spell queue — and **only rank 1 of each family exists**,
at every level.

## Enemies — three selectable encounters

Picked on the opening selection screen (`EnemySelect`) and carried in
`GameState.encounter` (ADR-0016); `ENEMY_ORDER` lists them in the order shown.
The melee cadence (2000 ms) is sourced — every level 1 creature swings at that
rate — and identical across all three; every amount is designed. The ramp
(`RAMP`, ×1.15 every 30 000 ms) is a single shared constant, not per-enemy.

| Enemy | Health | Tank melee | AoE | Spike |
| --- | --- | --- | --- | --- |
| Gorvath the Cavebreaker (`TANK_DAMAGE` / `AOE_DAMAGE` / `SPIKE_DAMAGE`) | 600 | 8 every 2000 ms | 6 per member every 12 000 ms | 18, uniform [6000, 10 000) ms |
| Skarn the Swarmcaller (`SKARN_*`) | 550 | 6 every 2000 ms | 8 per member every 9000 ms | 14, uniform [8000, 12 000) ms |
| Threx the Impaler (`THREX_*`) | 460 | 9 every 2000 ms | 4 per member every 16 000 ms | 26, uniform [5000, 8000) ms |

| Constant | Value | Nature |
| --- | --- | --- |
| `WIPE.maxDeaths` | 3 | designed |
| `PARTY_DAMAGE.perMemberAmount` | 3, per contributing (non-healer) member, every 1000 ms | designed |

Where the amounts come from: [classic-stats.md](./classic-stats.md#the-enemies)
and [ADR-0010](./adr/0010-level-1-boss-profile.md) (Gorvath),
[ADR-0016](./adr/0016-selectable-enemy-encounters.md) (Skarn, Threx, and the
selection screen itself), [ADR-0017](./adr/0017-boss-health-and-victory.md)
(boss health, party damage output, and the victory condition).

The tank and the three DPS deal `PARTY_DAMAGE` damage to the boss automatically,
once a second; the healer never contributes, and a dead contributor's share is
not picked up by the survivors. With all four alive that is 12 HP/s on the
boss — enough to kill a 600 HP Gorvath in 50 s at full uptime, but losing even
one DPS stretches that considerably (a death spiral: less boss damage → a
longer fight → more time for the ramp to kill someone else).

## Orders of magnitude

Gorvath — the reference profile:

- Pressure on the tank: 8 / 2 s = **4.0 HP/s**; they fall in 22 s with no
  healing.
- AoE: 6 × 5 / 12 s ≈ **2.5 HP/s** spread across the party.
- Spike: 18 every 8 s on average ≈ **2.2 HP/s** on a non-tank, a third of their
  health in one hit.
- **Burst** healing throughput: 51 HP every 1.5 s ≈ 34 HP/s.
- **Sustainable** healing throughput: mana-limited to ≈ 15 HP/s (9.25 mana/s
  outside the five-second rule, 1.7 HP per point of mana).

Measured survival, all three enemies, eight fixed seeds (ADR-0016):

| Enemy | No healing | Naive automated healer |
| --- | --- | --- |
| Gorvath | 22 s | 48 – 63 s |
| Skarn | 26 s | 40 – 63 s |
| Threx | 20 s | 34 – 56 s |

The ramp pushes pressure above sustainable healing after a few tiers, for
every enemy. Since ADR-0017 that is no longer automatically a loss: if the
boss dies first, it is a win. Measured outcome distribution for the same
naive healer, twelve fixed seeds (ADR-0017):

| Enemy | Wins | Wipes |
| --- | --- | --- |
| Gorvath | 7 | 5 |
| Skarn | 7 | 5 |
| Threx | 6 | 6 |

### Above level 1, that balance no longer holds

Every number in this section describes a **level 1** party, which is what the
encounters were calibrated against — and they stay level 1 designs whatever the
party's level (`ENEMY_LEVEL`). Since the party's health now grows by the
Classic tables (×29 for the tank between level 1 and 60) while the spellbook
stays rank 1, the fight gets easier every level: past roughly level 8 the party
survives Gorvath with no healing at all, and the fight is only a question of
how long the boss takes to die. `tests/gameStore.test.ts` asserts that outcome
rather than leaving it implicit.

Fixing it means sourcing the priest's spell ranks first, then scaling the
encounters — in that order, since scaling the bosses against a rank 1 spellbook
makes every fight unwinnable instead of easy. See
[ADR-0019](./adr/0019-levelling-to-60-and-boss-experience.md).

## Feedback

| Constant | Value |
| --- | --- |
| `FEEDBACK.lifetimeMs` | 1200 ms (floating numbers) |
| `FEEDBACK.messageLifetimeMs` | 1600 ms (messages, deaths) |
| `FEEDBACK.maxEntries` | 40 (anti-leak cap) |

## Tuning the difficulty

Do not touch the sourced values: the tuning room is on the enemy side. Each
enemy has its own set of constants (`TANK_DAMAGE` / `AOE_DAMAGE` /
`SPIKE_DAMAGE` for Gorvath, `SKARN_*` and `THREX_*` for the other two) — pick
the one you mean to retune.

- **Easier**: lower an enemy's `tankDamage.amount` or `spikeDamage.amount`, or
  lengthen `RAMP.intervalMs` (shared by all three).
- **Harder**: raise `spikeDamage.amount`, shorten `spikeDamage.minIntervalMs`,
  or lower `RAMP.intervalMs`.
- **Change pacing**: `BOSS_XP.victoryShare` is how many victories a level
  costs (0.34 → three); nothing else in the game depends on it.
- **Easier to win**: lower an enemy's `hpMax`, or raise
  `PARTY_DAMAGE.perMemberAmount`.
- **Harder to win**: raise `hpMax`, but re-run the win/wipe sweep (ADR-0017) —
  past a point the death spiral makes victory unreachable under naive play,
  which is what happened at the first values tried (780/780/660: 0 wins in 12
  seeds, on every enemy).
- **Add a fourth enemy**: give it an `EnemyId`, an `EncounterProfile` entry
  (including `hpMax`) in `ENEMIES`, and a slot in `ENEMY_ORDER`. Calibrate it
  the way ADR-0016 and ADR-0017 did — the no-heal/naive-healer survival
  windows, then the win/wipe distribution — before committing the numbers.

After any change, run `npm test`: several tests rely on the nominal values
(90 / 51 / 55 / 50 / 46 health, 8 / 6 / 18 damage for Gorvath — see
`tests/encounter.test.ts` and `tests/bossHealth.test.ts` for the rest).
