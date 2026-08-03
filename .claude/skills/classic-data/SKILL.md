---
name: classic-data
description: How to add or change any value that claims to come from WoW Classic — health, mana, spells, regeneration, creature stats — by sourcing it in classicData.ts, deriving it in gameConfig.ts, and recording it in docs/classic-stats.md. Use this skill whenever you touch character stats, spell values, the boss profile or party composition, whenever someone asks to level the party up or add a race, class or spell, and whenever you are tempted to write a game number from memory.
---

# classic-data

## When to Apply

Any time a number in this project is presented as coming from WoW Classic:
character health and mana, attributes, spell costs and healing, cast times,
training levels, the global cooldown, mana regeneration, creature damage.

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
hpMax: maxHealthAtLevel1(slot.classId, attributes),
```

If you find yourself writing `hpMax: 90`, stop: that 90 is an output of the
formula, and hard-coding it means the next change to race or class silently
lies.

### Where the data actually comes from

| Need | Source |
| --- | --- |
| Base health / mana per class | `player_classlevelstats` in the [MaNGOS Zero vanilla DB](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql) |
| Attributes per race and class | `player_levelstats`, same repository |
| Stat → health / mana formulas | `StatSystem.cpp` in [mangoszero/server](https://github.com/mangoszero/server/blob/master/src/game/Object/StatSystem.cpp) |
| Spell costs, cast times, levels | [EZDownRank](https://github.com/mrbuds/EZDownRank/blob/master/EZDownRank.lua) rank tables |
| Spell healing amounts | [wowclassicdb](https://wowclassicdb.com/spell/2050) |
| Creature stats | `creature_template`, same vanilla DB |

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
  rules). Own it as design; do not dress it up as Classic.

A change that adds a number and does not touch `docs/classic-stats.md` is
incomplete.

### Sanity-check what you add

Pick a value with a publicly known answer and assert it in
`tests/classicStats.test.ts` — the level 1 human warrior at 60 health is the
existing example. Formulas are worth testing at their thresholds (stamina 19,
20, 22) because the 20-point break is where mistakes hide.

### Levelling up

`PLAYER_LEVEL` and `state.playerLevel` already gate spells, but the stat tables
only cover level 1, and `getAttributes` throws for anything it does not know —
deliberately, so a missing row fails loudly instead of returning a wrong
character. Raising the level means extending the tables from the same SQL files
first.

## Constraints

- Never write a "Classic" number from memory. If you cannot produce a link,
  it goes under **Designed** or **Approximated**, with the reasoning.
- Never hard-code a value the formulas can compute.
- Do not silently widen `getAttributes` with invented attributes to make a new
  race/class combination work.
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
