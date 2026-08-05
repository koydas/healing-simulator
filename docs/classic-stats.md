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
| Druid and paladin spells (rank 1) | [EZDownRank](https://github.com/mrbuds/EZDownRank/blob/master/EZDownRank.lua) for Healing Touch, Rejuvenation and Holy Light's cost/cast time/level; every other number (Thorns, Tranquility, Blessing of Protection, Divine Shield, and every heal amount) is **Approximated or Designed** — the primary spell databases were blocked by this session's network policy, see "Approximations" | addon + secondary sources (ADR-0021) |
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
| Druid | 33 | 50 |

`CLASS_BASE_BY_LEVEL` carries the same two columns for all seven classes at
every level up to 60 (`getClassBase(classId, level)`); the level 1 row above is
just the first entry. A handful of rows in the source table are not monotonic
(warrior 101 → 100 at level 11, paladin 28 → 26 at level 2) — they are copied
as they are, not smoothed. Druid (class id 11 in `player_classlevelstats`) was
added in [ADR-0021](./adr/0021-per-class-spellbooks-and-absorb-shields.md).

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

Only these five race/class combinations, plus `human/paladin` and
`nightElf/druid` (added for ADR-0021), carry a full 1 – 60 column; the other
ten keep their level 1 row. Adding a race or class to the party means
extending its column from the same SQL file first — `getAttributes` throws for
a level it has no row for, rather than interpolating a character that never
existed.

### The player's own class is editable, and each one has its own spellbook

Since [ADR-0020](./adr/0020-editable-character-identity.md) the character
sheet's name and class can be edited; the healer party member is rebuilt from
whichever is chosen, the same way it was always rebuilt from Elowen the human
priest. Class is restricted to
`PLAYABLE_CLASSES = ['priest', 'druid', 'paladin']` — the three sourced
combinations that both spend mana and, since
[ADR-0021](./adr/0021-per-class-spellbooks-and-absorb-shields.md), simulate a
real healing kit: Priest (Shield, Renew, Heal, Prayer of Healing), Druid
(Healing Touch, Rejuvenation, Thorns, Tranquility) and Paladin (Holy Light,
Blessing of Protection, Divine Shield, Holy Radiance). Mage and Hunter, and
Warrior and Rogue before them, are excluded — the first two never got a
spellbook of their own, and the latter two have **0 mana at every level**
(`CLASS_BASE_BY_LEVEL`). Each class's spellbook, not just its identity and
derived stats, now changes with the choice — see the "Spells" section below.

The tank has 1.96 times the hunter's health — the original "the tank has twice
the health of the others" rule is no longer imposed, it **emerges** from picking
a dwarf warrior (stamina 25, the highest in the game at level 1).

## Mana and regeneration

| Value | Level 1 (priest default) | Level 60 | Origin |
| --- | --- | --- | --- |
| Pool | 160 | 2956 | class base + intellect bonus (22 → 120) |
| Regeneration tick | every 2 s | every 2 s | vanilla |
| Mana per tick | 18.5 | 45.25 | spirit / 4 + 12.5 (24 → 131) |
| Five-second rule | 5 s | 5 s | vanilla |

Druid and paladin get the exact same formula and cadence, from their own class
base and their own attributes at that level (`manaProfileAtLevel`) — a level 1
night elf druid has 100 mana, a level 1 human paladin 79 (see the "two new
playable classes" test in `tests/classicStats.test.ts`).

In vanilla, spirit-based regeneration is **fully suspended for the 5 seconds
following a mana expenditure** (without the Meditation talent). A healer who
chains casts therefore regenerates nothing at all: the breathing window is part
of the game.

## Spells (rank 1) — one four-spell kit per class (ADR-0021)

Before [ADR-0021](./adr/0021-per-class-spellbooks-and-absorb-shields.md) every
playable class cast the same five priest spells. Each of the three now has its
own four, gated by `requiredLevel` the same way. Healing is **rolled uniformly
inside the spell's range**, like in game — there is no "base ± 10%".

### Priest

| Spell | Level | Mana | Cast | Effect | Id |
| --- | --- | --- | --- | --- | --- |
| Renew | **1** (Designed override; real level is 8) | 30 | instant | 45 over 15 s (5 ticks of 9, every 3 s) | 139 |
| Power Word: Shield | 4 | 45 | instant | Absorbs 44 damage for 15 s | 17 |
| Heal | 16 | 155 | 3.0 s | 295 – 341 | 2054 |
| Prayer of Healing | 30 | 410 | 3.0 s | 312 – 333 on the party | 596 |

Lesser Heal and Flash Heal, from the pre-ADR-0021 kit, are gone. Renew's gate
moving to level 1 is the one deliberate, Designed exception in this table: real
Classic trains it at 8, but leaving the default class with nothing to cast for
three levels — Shield itself only trains at 4 — was worse than the deviation
(see ADR-0021's Context).

### Druid

| Spell | Level | Mana | Cast | Effect | Id |
| --- | --- | --- | --- | --- | --- |
| Healing Touch | **1** | 25 | 1.5 s | 37 – 51 | 5185 |
| Rejuvenation | 4 | 25 | instant | 32 over 12 s (4 ticks of 8, every 3 s) | 774 |
| Thorns | 6 | 35 | instant | Absorbs 36 damage for 10 min | 467 |
| Tranquility | 30 | 300 | instant | 100 over 15 s on the party (5 ticks of 20, every 3 s) | 740 |

Thorns and Tranquility are **reflavored**, not just Approximated: real Thorns
reflects damage to the attacker (this game never lets a heal contribute party
damage — see `PARTY_DAMAGE`'s design note) and real Tranquility is a channel,
which the engine has no concept of. Both are reimplemented with a mechanic
this project already has (an absorb shield; an instant party-wide HoT) instead.

### Paladin

| Spell | Level | Mana | Cast | Effect | Id |
| --- | --- | --- | --- | --- | --- |
| Holy Light | **1** | 35 | 2.5 s | 39 – 47 | 635 |
| Blessing of Protection | 5 | 220 | instant | Absorbs 200 damage for 6 s | 1022 |
| Divine Shield | 18 | 15 | instant | Absorbs 500 damage for 12 s, self only | 642 |
| Holy Radiance | 30 | 350 | 2.5 s | 280 – 310 on the party | 82327 |

Blessing of Protection and Divine Shield are real full-immunity effects in
Classic (they block *all* damage, not a fixed pool); both are modeled here as
a shield sized to comfortably outlast its own duration, the mechanic this
engine actually has. Holy Radiance has no vanilla equivalent at all — real
1.12 paladins had no AoE heal — and is borrowed anachronistically from a later
expansion, marked Designed outright rather than presented as sourced.

**At level 1 each class knows exactly one spell**: Renew, Healing Touch or
Holy Light. The other three of each kit are shown locked with their training
level. See [ADR-0008](./adr/0008-classic-spellbook-level-gating.md) for the
original discussion and ADR-0021 for the per-class split.

A note on scale: Prayer of Healing and Holy Radiance cost 410 and 350 mana,
multiples of a level 1 pool. That is not an inconsistency — they are level 30
spells, and a level 30 priest has 1322 mana.

Only **rank 1** of each family exists in the game so far, at every level. A
level 60 character therefore heals for the same amounts as when the spell first
unlocked — see the levelling section below.

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

- base health and mana per class, at every level from 1 to 60, including
  druid (ADR-0021);
- attributes per race/class, at every level for the party's five combinations,
  plus `human/paladin` and `nightElf/druid` (ADR-0021);
- the experience required for each level, and the level cap of 60;
- the stamina → health and intellect → mana formulas;
- Renew, Heal and Prayer of Healing's cost, cast time, required level and
  healing amount (priest); Healing Touch and Rejuvenation's cost, cast time
  and required level (druid); Holy Light's cost, cast time and required level
  (paladin) — all four confirmed against `EZDownRank.lua`;
- the 1.5 s global cooldown;
- the 2 s regeneration tick and the five-second rule;
- the attack speed of level 1 creatures (2000 ms).

### Derived — computed from the sources

- each party member's health and mana, at the profile's level;
- Renew's, Rejuvenation's and Tranquility's healing per tick (total ÷ ticks);
- every playable class's mana per tick (from spirit);
- which spells are trained at a given level.

### Approximated — flagged as such

- **The spirit regeneration coefficient.** The real value lives in the
  `gtRegenMPPerSpt` DBC, which depends on both class *and* level and is not
  publicly usable. We apply the commonly documented priest formula
  (`spirit / 4 + 12.5` per 2 s tick), which describes level 60. At level 1 the
  true value is probably a little lower.
- **Every heal amount and cost not confirmed against `EZDownRank.lua`**, and
  Thorns' and the two paladin defensive spells' cost/level/duration
  (ADR-0021): Healing Touch and Holy Light's heal ranges, Rejuvenation's total
  heal, Thorns' mana/level/duration, Blessing of Protection and Divine
  Shield's mana/level. This session's network policy blocked every primary
  spell database it tried (wowclassicdb, wowhead, every fandom mirror
  returned HTTP 403); these numbers are cross-checked against secondary web
  sources instead and should be replaced with a primary source when one is
  reachable.

### Designed — game design, not Classic

- **Melee damage per enemy: Gorvath 5, Skarn 6, Threx 9 per swing.** Each was
  originally bracketed by the measurements (median 2 × elite factor 3 = 6;
  high end 10 × 1.2 = 12); Gorvath's was lowered from 8 to 5 for ADR-0021 (see
  its update note on [ADR-0010](./adr/0010-level-1-boss-profile.md)) so a
  level 1 priest's Renew — 3 HP/s sustained on one target — can out-heal it.
- **Thorns' and Divine Shield's absorb amount, and Blessing of Protection's**
  (ADR-0021): all three real spells are either a damage-reflect buff or a
  full-immunity effect, not an HP-based pool, so this game's absorb-shield
  mechanic needs a number none of them actually have. Each is sized to
  comfortably outlast its own duration.
- **Tranquility's and Holy Radiance's healing amounts** (ADR-0021): both
  spells are reimplemented with a mechanic the real one does not use (an
  instant party-wide HoT instead of a channel; a same-expansion group heal
  paladins never had), so their numbers describe the reimplementation, not
  the original spell.
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
- **Which classes the player's own character can be**: Priest, Druid or
  Paladin (ADR-0021, replacing Mage and Hunter). All three are sourced
  race/class pairs with a full attribute table and their own real healing
  kit; Warrior and Rogue remain excluded because they have no mana in Classic
  and every spell this game simulates costs mana (ADR-0020).
- **Renew's level 1 gate, and the shield mechanic itself** (ADR-0021): moving
  Renew from its real level 8 to 1 is a designed exception to the sourced
  training level, made for playability; the absorb-shield `SpellKind` and its
  resolution (consume before HP, decay on a timer, never stack) are this
  project's own engine mechanic, reused for every shield-kind spell rather
  than invented per spell.

## Resulting balance

This table described a Lesser Heal-spamming bot, before
[ADR-0021](./adr/0021-per-class-spellbooks-and-absorb-shields.md) removed that
spell from the priest's kit. Re-measured against a bot that spams **Renew** on
the lowest-ratio living ally instead — the priest's actual level 1 spell —
against each of the three selectable enemies:

| Enemy | No healing | Naive Renew-spam (12 seeds) |
| --- | --- | --- |
| Gorvath | 32 s | 44 – 54 s, 7 wins / 5 wipes |
| Skarn | 26 s | 44 – 46 s, 1 win / 11 wipes |
| Threx | 20 s | 30 – 36 s, 0 wins / 12 wipes |

Gorvath's tank melee was lowered from 8 to 5 per swing specifically so this
bot — the same class of naive, always-retarget strategy the original balance
pass used — produces a real mix of outcomes again (see ADR-0021 and
ADR-0010's update note); Skarn (6 per swing, 3 HP/s, exactly Renew's own
sustained rate) and Threx (9 per swing, 4.5 HP/s) were **not** recalibrated
and remain very hard to near-unwinnable for a level 1 priest playing this
naively, since Renew alone still cannot outpace their tank pressure with any
margin. This is a known, deliberately deferred consequence — see ADR-0021's
Alternatives Considered — not a bug: a real player reacting faster and
smarter than "always retarget to the lowest ratio" fares better than these
numbers suggest, and a level 4+ priest has Shield to lean on besides. Druid
and paladin, whose level 1 spell is a strong direct heal rather than a slow
HoT, are not affected by any of this — their own naive-bot numbers were not
part of this measurement.

Since [ADR-0017](./adr/0017-boss-health-and-victory.md), "survival" is no
longer the only measure: if the boss's health reaches 0 before a wipe
condition does, the fight is won. A dead DPS both slows the boss kill down and
does not slow the incoming damage down, a death spiral that punishes losing
party members twice over.

## What levelling still does not cover

Levels 1 to 60 are in place — stats, thresholds, spell gating — but two pieces
of the game stayed at level 1, and the fight is unbalanced because of it.

1. **Every spellbook is rank 1 only.** `PRIEST_SPELLS_RANK_1`,
   `DRUID_SPELLS_RANK_1` and `PALADIN_SPELLS_RANK_1` each hold one rank per
   family, so a level 60 priest still heals for 295 – 341 with Heal while
   carrying a 2956 mana pool. The rank tables
   ([EZDownRank](https://github.com/mrbuds/EZDownRank/blob/master/EZDownRank.lua))
   are the next thing to source, for all three classes.
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
