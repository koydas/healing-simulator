# WoW Classic stats — levels 1 to 60

Every character, spell and regeneration value in the game comes from **WoW
Classic (patch 1.12)**. A character starts at **level 1** and can reach the
vanilla cap of **60**; every stat in between is read from the game's own
tables. This document says where each number comes from, how it is computed,
and — just as importantly — **what is not sourced**.

The raw data lives in [`src/config/classicData.ts`](../src/config/classicData.ts).
Derived values are computed in [`src/config/gameConfig.ts`](../src/config/gameConfig.ts):
no health value or spell cost is written by hand anywhere else.

## Sources

| Data | Source | Nature |
| --- | --- | --- |
| Base health and mana per class (levels 1 – 60) | `player_classlevelstats` table of the vanilla [MaNGOS Zero](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql) database | 1.12 server |
| Attributes per race and class (levels 1 – 60) | `player_levelstats` table, [same database](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql) | 1.12 server |
| Experience required per level | `player_xp_for_level` table, [same database](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_xp_for_level.sql) | 1.12 server |
| Stamina → health formula | `Player::GetHealthBonusFromStamina`, [mangoszero/server `StatSystem.cpp`](https://github.com/mangoszero/server/blob/master/src/game/Object/StatSystem.cpp) | server code |
| Intellect → mana formula | `Player::GetManaBonusFromIntellect`, same file | server code |
| Priest healing spells (rank 1) | [wowclassicdb](https://wowclassicdb.com/spell/2050) for the amounts, [EZDownRank](https://github.com/mrbuds/EZDownRank/blob/master/EZDownRank.lua) for costs / cast times / levels | database + addon |
| Level 1 creatures | `creature_template` table, [same vanilla database](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/creature_template.sql) | 1.12 server |
| Spirit regeneration | commonly documented priest formula (see "Approximations") | **approximation** |

## Formulas

```
Health = class base health + stamina bonus
         stamina bonus   = min(sta, 20) × 1 + max(0, sta − 20) × 10

Mana   = class base mana + intellect bonus
         intellect bonus = min(int, 20) × 1 + max(0, int − 20) × 15
```

The threshold at 20 points explains the large health gaps between characters:
one point of stamina above 20 is worth ten points below it.

Sanity check: a level 1 human warrior has 22 stamina, so
`20 + (20 × 1) + (2 × 10) = 60` health — the value observed in game.
`tests/classicStats.test.ts` locks that check in.

### Class bases at level 1

| Class | Base health | Base mana |
| --- | --- | --- |
| Warrior | 20 | — (rage) |
| Paladin | 28 | 59 |
| Hunter | 26 | 63 |
| Rogue | 25 | — (energy) |
| Priest | 31 | 110 |
| Mage | 31 | 100 |

`CLASS_BASE_BY_LEVEL` carries the same two columns for all six classes at every
level up to 60 (`getClassBase(classId, level)`); the level 1 row above is just
the first entry. A handful of rows in the source table are not monotonic
(warrior 101 → 100 at level 11, paladin 28 → 26 at level 2) — they are copied
as they are, not smoothed.

## The party

Five Alliance characters, all at the profile's level. Health is not written in
the code: it is recomputed from the attributes of that level, by
`partyTemplateAtLevel`.

| Member | Race / class | Health lv. 1 | Health lv. 60 |
| --- | --- | --- | --- |
| Thorgrim (tank) | Dwarf warrior | **90** | **2639** |
| Elowen (healer) | Human priest | **51** | **1707** |
| Kaelan (DPS) | Human rogue | **55** | **2093** |
| Fizzwick (DPS) | Gnome mage | **50** | **1620** |
| Sylandra (DPS) | Night elf hunter | **46** | **2177** |

At level 1 the attributes behind those numbers are:

| Member | Sta. | Int. | Spirit | Mana |
| --- | --- | --- | --- | --- |
| Thorgrim | 25 | 19 | 19 | — |
| Elowen | 20 | 22 | 24 | **160** |
| Kaelan | 21 | 20 | 20 | — |
| Fizzwick | 19 | 26 | 22 | 210 |
| Sylandra | 20 | 20 | 21 | 83 |

Only the priest's mana is simulated: it is the player's resource.

Only these five race/class combinations carry a full 1 – 60 column; the other
twelve keep their level 1 row. Adding a race or class to the party means
extending its column from the same SQL file first — `getAttributes` throws for
a level it has no row for, rather than interpolating a character that never
existed.

### The player's own class is editable, among three of those five

Since [ADR-0020](./adr/0020-editable-character-identity.md) the character
sheet's name and class can be edited; the healer party member is rebuilt from
whichever is chosen, the same way it was always rebuilt from Elowen the human
priest. Class is restricted to `PLAYABLE_CLASSES = ['priest', 'mage', 'hunter']`
— three of the five combinations above, each paired with the race the party
already uses for it. Warrior and rogue are the other two, and both are
excluded on purpose: their base mana is **0 at every level**
(`CLASS_BASE_BY_LEVEL`), and every spell this game simulates costs mana. The
spellbook itself never changes with class — only the identity, and the
health/mana/attributes it derives, do.

The tank has 1.96 times the hunter's health — the original "the tank has twice
the health of the others" rule is no longer imposed, it **emerges** from picking
a dwarf warrior (stamina 25, the highest in the game at level 1).

## Mana and regeneration

| Value | Level 1 | Level 60 | Origin |
| --- | --- | --- | --- |
| Priest pool | 160 | 2956 | class base + intellect bonus (22 → 120) |
| Regeneration tick | every 2 s | every 2 s | vanilla |
| Mana per tick | 18.5 | 45.25 | spirit / 4 + 12.5 (24 → 131) |
| Five-second rule | 5 s | 5 s | vanilla |

In vanilla, spirit-based regeneration is **fully suspended for the 5 seconds
following a mana expenditure** (without the Meditation talent). A priest who
chains casts therefore regenerates nothing at all: the breathing window is part
of the game.

In numbers at level 1: 160 mana = 5 Lesser Heals back to back, then you must
stop casting for 5 s to restart the ticks, at 9.25 mana per second. *Sustainable*
healing throughput lands around 15 HP/s, while *burst* throughput reaches
34 HP/s.

## Priest spells (rank 1)

| Spell | Level | Mana | Cast | Effect | Id |
| --- | --- | --- | --- | --- | --- |
| Lesser Heal | **1** | 30 | 1.5 s | 46 – 56 | 2050 |
| Renew | 8 | 30 | instant | 45 over 15 s (5 ticks of 9, every 3 s) | 139 |
| Heal | 16 | 155 | 3.0 s | 295 – 341 | 2054 |
| Flash Heal | 20 | 125 | 1.5 s | 193 – 237 | 2061 |
| Prayer of Healing | 30 | 410 | 3.0 s | 312 – 333 on the party | 596 |

Healing is **rolled uniformly inside the spell's range**, like in game — there
is no "base ± 10%" any more.

**At level 1 a priest only knows Lesser Heal.** The other four spells are shown
locked with their training level, and unlock as the character levels: Renew at
8, Heal at 16, Flash Heal at 20, Prayer of Healing at 30. See
[ADR-0008](./adr/0008-classic-spellbook-level-gating.md) for the discussion.

A note on scale: Prayer of Healing costs 410 mana, 2.5 times a level 1 priest's
pool. That is not an inconsistency — it is a level 30 spell, and a level 30
priest has 1322 mana.

Only **rank 1** of each family exists in the game so far, at every level. A
level 60 priest therefore heals for the same amounts as a level 16 one — see
the levelling section below.

## Experience and levels

The experience needed for each level is the table the game itself uses,
`player_xp_for_level`: 400 to reach level 2, 7600 for level 11, 209,800 for
level 60, and **4,084,700** in total from 1 to 60. `xpToNextLevel(level)`
returns `null` at the cap, and throws outside `[1, 60]` — a corrupt saved
profile fails where it is loaded rather than during a fight.

What a boss kill is *worth* is ours, not Classic's. Vanilla pays
`2 × (5 × level + 45)` for a same-level elite — 100 experience at level 1, 690
at level 59 — which against the table above is about 8,000 boss kills to reach
60. A victory therefore grants `round(xpToNextLevel(level) × 0.34)` instead:
**three victories per level**, 136 experience at level 1, 71,332 at level 59. A
wipe grants nothing. That constant, `BOSS_XP.victoryShare`, is the single knob
for progression pacing. See
[ADR-0019](./adr/0019-levelling-to-60-and-boss-experience.md).

The name, the class, the level, the experience inside it, the level and
experience stashed for every other class ever played, and the win/loss record
per boss (shared across classes) are saved in `localStorage`
([ADR-0018](./adr/0018-persistent-player-profile-localstorage.md),
[ADR-0020](./adr/0020-editable-character-identity.md)).

## The enemies

Every enemy is level 1 as well. Measured over the 597 "real" level 1 creatures
of `creature_template` (triggers and shapeshift forms excluded):

| Measurement | Value |
| --- | --- |
| Melee damage, median | 2 |
| Melee damage, third quartile | 9 – 10 |
| Health, median | 64 |
| Attack speed | 2000 ms (identical for all of them) |

Elite factor measured on the same data, comparing rank 0 and rank 1 at equal
level:

| Level | Normal → elite damage | Normal → elite health |
| --- | --- | --- |
| 20 | 27.5 → 34 (×1.24) | ×1.58 |
| 30 | 47.5 → 147.5 (×3.11) | ×1.79 |
| 40 | 69.5 → 227.5 (×3.27) | ×2.07 |
| 60 | 188 → 544.5 (×2.90) | ×3.11 |

No level 1 creature is a real boss in the game (the rank 3 entries at level 1
are shapeshift forms). Every enemy profile is therefore **built** from those
measurements — see the next section.

The player picks one of three encounters on the opening selection screen
(ADR-0016): **Gorvath the Cavebreaker** (the original profile, ADR-0010),
**Skarn the Swarmcaller** (AoE-heavy) and **Threx the Impaler** (burst). All
three share the sourced 2000 ms melee cadence; only the amounts differ, and
all three stay inside the [6, 12] bracket those measurements define for a
single swing.

Since ADR-0017 every enemy also has a health pool, and the fight can end in a
victory: the tank and the three DPS deal a designed amount of damage to it
automatically over the fight (the healer never contributes). No level 1
creature's health is usable here either — the "Health, median 64" measurement
above describes an ordinary level 1 creature being killed by a full group in
seconds, not a fight balanced around a single healer — so, like the damage
amounts, every enemy's `hpMax` is Designed and calibrated by simulation
rather than sourced.

## Sourced, derived, or designed

This is the section to read before quoting any number from this project.

### Sourced — exact Classic value

- base health and mana per class, at every level from 1 to 60;
- attributes per race/class, at every level for the party's five combinations;
- the experience required for each level, and the level cap of 60;
- the stamina → health and intellect → mana formulas;
- cost, cast time, required level and healing amount of the five spells;
- the 1.5 s global cooldown;
- the 2 s regeneration tick and the five-second rule;
- the attack speed of level 1 creatures (2000 ms).

### Derived — computed from the sources

- each party member's health and mana, at the profile's level;
- Renew's healing per tick (45 / 5 ticks = 9);
- the priest's mana per tick (from spirit);
- which spells are trained at a given level.

### Approximated — flagged as such

- **The spirit regeneration coefficient.** The real value lives in the
  `gtRegenMPPerSpt` DBC, which depends on both class *and* level and is not
  publicly usable. We apply the commonly documented priest formula
  (`spirit / 4 + 12.5` per 2 s tick), which describes level 60. At level 1 the
  true value is probably a little lower.

### Designed — game design, not Classic

- **Melee damage per enemy: Gorvath 8, Skarn 6, Threx 9 per swing.** Each is
  bracketed by the measurements (median 2 × elite factor 3 = 6; high end
  10 × 1.2 = 12), but chosen.
- **AoE and spike per enemy** — no level 1 creature has those abilities; every
  amount is calibrated against level 1 health pools:
  - Gorvath: AoE 6 per member every 12 s, spike 18 on a non-tank every 6 to
    10 s (removes about a third of a DPS's health).
  - Skarn: AoE 8 per member every 9 s, spike 14 every 8 to 12 s — pressure
    shifted from a single target onto the whole party.
  - Threx: AoE 4 per member every 16 s, spike 26 every 5 to 8 s — over half of
    a DPS's health in one hit.
- **Ramp ×1.15 every 30 s.** A mechanic of the game mode, shared by every
  enemy rather than a property of one.
- **Boss health per enemy: Gorvath 600, Skarn 550, Threx 460.** No level 1
  creature's health applies to a boss balanced around a single healer; each
  value was found by simulating the naive-healer win/wipe distribution
  (ADR-0017), not measured from a source.
- **Outgoing party damage: 3 per contributing member, every second.** No
  per-class attack is simulated; the tank and three DPS are abstracted into
  one throughput.
- **Wipe conditions** (tank death or three deaths).
- **The experience a boss kill is worth**: 34% of the current level's
  requirement on a victory, nothing on a wipe. The requirement itself is
  sourced; the share is a pacing choice (ADR-0019).
- **Party composition**, character names, and the three enemies' names and
  selection-screen descriptions.
- **Which classes the player's own character can be**: Priest, Mage or
  Hunter. All three are sourced race/class pairs with a full attribute table;
  the restriction to exactly these three is designed, because Warrior and
  Rogue have no mana in Classic and this game only simulates a mana-costed
  spellbook (ADR-0020).

## Resulting balance

Verified by simulating an automated healer chaining Lesser Heal on the lowest
member (eight seeds), against each of the three selectable enemies:

| Enemy | No healing | Naive automated healer |
| --- | --- | --- |
| Gorvath | 22 s | 48 – 63 s |
| Skarn | 26 s | 40 – 63 s |
| Threx | 20 s | 34 – 56 s |

Gorvath's initial pressure is about 8.8 HP/s (melee 4.0 + AoE 2.5 + spike 2.2)
against roughly 15 HP/s sustainable: the fight is holdable at first, then the
ramp overtakes the healer's throughput. Skarn and Threx land a little lower on
the naive-healer end by design — spreading heals across a bleeding party, or
reacting fast enough to a short-fuse burst, is harder for a bot that always
targets the single lowest-HP ally than steady single-target pressure is. See
[ADR-0016](./adr/0016-selectable-enemy-encounters.md).

With a single spell available, the difficulty comes mostly from **triage** —
one Lesser Heal every 1.5 s cannot follow two low targets at once.

Since [ADR-0017](./adr/0017-boss-health-and-victory.md), "survival" is no
longer the only measure: if the boss's health reaches 0 before a wipe
condition does, the fight is won. The same naive healer, twelve seeds,
produces a real mix rather than a guaranteed outcome either way — Gorvath 7
wins / 5 wipes, Skarn 7/5, Threx 6/6 — because a dead DPS both slows the boss
kill down and does not slow the incoming damage down, a death spiral that
punishes losing party members twice over.

## What levelling still does not cover

Levels 1 to 60 are in place — stats, thresholds, spell gating — but two pieces
of the game stayed at level 1, and the fight is unbalanced because of it.

1. **The spellbook is rank 1 only.** `PRIEST_HEALS_RANK_1` holds one rank per
   family, so a level 60 priest still heals for 46 – 56 with Lesser Heal while
   carrying a 2956 mana pool. The rank tables
   ([EZDownRank](https://github.com/mrbuds/EZDownRank/blob/master/EZDownRank.lua))
   are the next thing to source.
2. **The encounters are level 1 designs.** Gorvath, Skarn and Threx keep the
   damage of ADR-0010 and ADR-0016 whatever the party's level, so the fight
   gets easier every level — past roughly level 8 the party wins with no
   healing at all (`tests/gameStore.test.ts` pins it).

The order matters: scaling the bosses *before* the spell ranks would make every
fight unwinnable rather than easy, because health pools grow about 30× between
level 1 and 60 while rank 1 healing does not move at all. See
[ADR-0019](./adr/0019-levelling-to-60-and-boss-experience.md).

## References

- [ADR-0007](./adr/0007-classic-derived-stats.md) — stats derived from the Classic tables
- [ADR-0008](./adr/0008-classic-spellbook-level-gating.md) — real spells and level gating
- [ADR-0009](./adr/0009-vanilla-mana-regen-five-second-rule.md) — vanilla regeneration
- [ADR-0010](./adr/0010-level-1-boss-profile.md) — level 1 boss profile
- [ADR-0016](./adr/0016-selectable-enemy-encounters.md) — the selection screen and the other two enemies
- [ADR-0017](./adr/0017-boss-health-and-victory.md) — boss health, party damage output, and the victory condition
- [ADR-0018](./adr/0018-persistent-player-profile-localstorage.md) — the saved profile
- [ADR-0019](./adr/0019-levelling-to-60-and-boss-experience.md) — levels 1 to 60 and the experience reward
- [ADR-0020](./adr/0020-editable-character-identity.md) — editable name/class and per-class progress
- [balance.md](./balance.md) — constant reference
