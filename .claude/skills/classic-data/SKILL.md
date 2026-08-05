---
name: classic-data
description: How to add or change any value that claims to come from WoW Classic — health, mana, spells, experience, regeneration, creature stats — by sourcing it in classicData.ts, deriving it in gameConfig.ts, and recording it in docs/classic-stats.md. Use this skill whenever you touch character stats, spell values, per-level tables, the boss profile or party composition, whenever someone asks to add a race, class, spell rank or level, and whenever you are tempted to write a game number from memory.
---

# classic-data

## When to Apply

Any time a number in this project is presented as coming from WoW Classic:
character health and mana, attributes, spell costs and healing, cast times,
training levels, experience per level, the global cooldown, mana regeneration,
creature damage.

The credibility of the whole project rests on one claim — that these values are
the game's, not ours. A single invented number that looks plausible destroys
that claim, and nobody can tell which ones to trust afterwards. So the rule is
not "be accurate", it is **"be traceable"**.

## Expected Behavior

### Two files, two jobs

- `src/config/classicData.ts` holds **only sourced data and official
  formulas**, each with a comment saying where it comes from.
- `src/config/gameConfig.ts` **derives** everything else from it. Health, mana
  and healing per tick are computed, never typed in.

```ts
// classicData.ts — sourced
export function healthBonusFromStamina(stamina: number): number {
  const base = Math.min(stamina, 20);
  return base + (stamina - base) * 10;
}

// gameConfig.ts — derived
hpMax: maxHealthAtLevel(slot.classId, attributes, level),
```

If you find yourself writing `hpMax: 90`, stop: that 90 is an output of the
formula, and hard-coding it means the next change to race, class or level
silently lies.

### Where the data actually comes from

| Need | Source |
| --- | --- |
| Base health / mana per class and level | `player_classlevelstats` in the [MaNGOS Zero vanilla DB](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql) |
| Attributes per race, class and level | `player_levelstats`, same repository |
| Experience required per level | `player_xp_for_level`, same repository |
| Stat → health / mana formulas | `StatSystem.cpp` in [mangoszero/server](https://github.com/mangoszero/server/blob/master/src/game/Object/StatSystem.cpp) |
| Spell costs, cast times, levels | [EZDownRank](https://github.com/mrbuds/EZDownRank/blob/master/EZDownRank.lua) rank tables |
| Spell healing amounts | [wowclassicdb](https://wowclassicdb.com/spell/2050) |
| Creature stats | `creature_template`, same vanilla DB |

### The tables are level-indexed

`CLASS_BASE_BY_LEVEL` and `RACE_CLASS_ATTRIBUTES` hold one array per class and
per race/class, index 0 being level 1, and the accessors are
`getClassBase(classId, level)` and `getAttributes(race, classId, level)`. Both
**throw** for a row they do not have — a missing level is a table to extend,
never a value to interpolate.

Only the five race/class combinations the party is built from carry a full
1 – 60 column; the other twelve keep their level 1 row. Putting a new race or
class in `PARTY_SLOTS` therefore starts with extending its column from the same
SQL file, `curl` + `grep`, not with a plausible-looking guess.

Rows that look wrong in the source (warrior base health 101 → 100 at level 11,
paladin 28 → 26 at level 2) are copied as they are. Smoothing them would make
this file a rewrite of the game rather than a copy of it.

Emulator tables and server code beat wikis, because they are the values a
server actually applies. Fetch them with `curl` from `raw.githubusercontent.com`
and grep the rows you need rather than trusting a summary.

### Every value lands in one of four buckets

`docs/classic-stats.md` keeps four lists, and a new number joins exactly one:

- **Sourced** — the exact Classic value, with its link.
- **Derived** — computed from sourced values by a documented formula.
- **Approximated** — you could not get the real value; say what the real source
  would be and why it is out of reach. Today only the spirit regeneration
  coefficient is in here.
- **Designed** — our own game design (the boss profile, the ramp, the wipe
  rules, the experience a boss kill is worth). Own it as design; do not dress
  it up as Classic.

The experience reward is the model to copy when a sourced value turns out to be
unusable: the level thresholds stay Classic's, the reward is ours, and
`gameConfig.ts` carries the arithmetic that explains why — vanilla's kill
formula would take about 8,000 boss kills to reach 60. Quote the real value you
rejected; "we designed this" without the number it replaced reads like a
shortcut.

A change that adds a number and does not touch `docs/classic-stats.md` is
incomplete.

### Sanity-check what you add

Pick a value with a publicly known answer and assert it in
`tests/classicStats.test.ts` — the level 1 human warrior at 60 health is the
existing example, and the level 60 priest at 1707 health / 2956 mana is the
other end of the same check. Formulas are worth testing at their thresholds
(stamina 19, 20, 22) because the 20-point break is where mistakes hide.

A whole table is worth one aggregate assertion too: the experience table is
pinned by its total, 4,084,700 from level 1 to 60. A single mistyped row moves
it.

### Levels

`STARTING_LEVEL` (1), `MAX_LEVEL` (60) and `state.playerLevel` — taken from the
saved profile — drive the spellbook *and* every derived stat, through
`partyTemplateAtLevel` and `manaProfileAtLevel`. There is no level 1 shortcut
left in the config: `PARTY_TEMPLATE` and `MANA` are just those functions
applied to level 1.

Two things did **not** follow the party up:

- the spellbook is rank 1 only, at every level;
- the encounters keep `ENEMY_LEVEL` (1) and their level 1 damage.

Both are known and documented (ADR-0019, `docs/balance.md`), so a fight gets
easier as the party levels. If you take that on, source the priest's spell
ranks from EZDownRank first and scale the bosses second — the other order makes
every fight unwinnable instead of easy.

## Constraints

- Never write a "Classic" number from memory. If you cannot produce a link,
  it goes under **Designed** or **Approximated**, with the reasoning.
- Never hard-code a value the formulas can compute.
- Do not silently widen `getAttributes` with invented attributes to make a new
  race/class combination — or a new level — work.
- Do not persist a derived stat to make a screen faster: health and mana are
  recomputed from the level every time (see `player-progression`).
- Keep the balance consequences honest: after a stat change, re-check the
  orders of magnitude in `docs/balance.md` (they are load-bearing for the fight
  being playable at all).

## References

- `docs/classic-stats.md` — sources, formulas, and the four buckets
- `src/config/classicData.ts` — the only place raw Classic data lives
- `docs/adr/0007-classic-derived-stats.md` — why stats are computed, not copied
- `docs/adr/0008-classic-spellbook-level-gating.md` — spells and training levels
- `docs/adr/0009-vanilla-mana-regen-five-second-rule.md` — the regeneration model
- `docs/adr/0010-level-1-boss-profile.md` — how the designed boss was bracketed
- `docs/adr/0019-levelling-to-60-and-boss-experience.md` — the per-level tables,
  and why the experience reward is designed rather than sourced
