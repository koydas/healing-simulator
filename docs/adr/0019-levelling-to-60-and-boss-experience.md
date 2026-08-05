# ADR-0019: Levelling to 60 on Classic tables, with a designed boss reward

- **Date:** 2026-08-04
- **Status:** Accepted

## Context

The game asked for a character sheet with levels and an experience bar, capped
at 60, built on WoW Classic stats — and for a boss kill to grant experience.

Two things stood in the way.

**The stat tables stopped at level 1.** `CLASS_BASE_LEVEL_1` and
`RACE_CLASS_ATTRIBUTES_LEVEL_1` held one row each, and `getAttributes` threw
for anything else, deliberately (ADR-0007). `docs/classic-stats.md` already
listed what extending them would take.

**Classic's own kill reward does not fit this game.** Vanilla pays
`2 × (5 × level + 45)` experience for a same-level elite: 100 at level 1, 690
at level 59. The level thresholds it pays against are 400 and 209,800. Levels 1
to 60 are 4,084,700 experience in total, so reaching the cap on boss kills at
the sourced rate takes roughly **8,000 fights** — vanilla expects quests and
thousands of trash mobs to cover the rest, and this game has neither.

## Decision

**Stats and thresholds are sourced, for every level.** `classicData.ts` now
carries `player_classlevelstats` for all six classes at levels 1 to 60,
`player_levelstats` at every level for the five race/class combinations the
party is built from, and `player_xp_for_level` in full. `getAttributes(race,
classId, level)` still throws rather than interpolate, so a combination whose
column has not been extended fails loudly instead of inventing a character.
Health, mana and regeneration keep being *computed* by the vanilla formulas —
at level 60 the priest lands on 1707 health, 2956 mana and 45.25 mana per tick.

**The whole party levels, not the healer alone.** `partyTemplateAtLevel(level)`
rebuilds all five members, and `GameState.playerLevel` — which already gated
the spellbook — now sizes health, mana and regeneration too. `manaRegenPerTick`
is a new state field: the engine reads the amount from the state instead of
looking the level up in the config on every tick.

**The reward is designed, and says so.** A victory grants
`round(xpToNextLevel(level) × BOSS_XP.victoryShare)` with `victoryShare = 0.34`
— three victories per level, at every level, 136 experience at level 1 and
71,332 at level 59. A wipe grants nothing: the boss has to die. The level
thresholds under the bar stay Classic's, so the bar itself never lies about
what a level costs.

## Alternatives Considered

- **Vanilla's kill formula, unmodified.** Rejected on the arithmetic above:
  ~8,000 fights to reach 60. It is the honest number, and it is unplayable —
  which is why it is quoted in `gameConfig.ts` next to the value that replaced
  it.
- **A flat multiplier on the vanilla formula.** Rejected: the reward grows
  linearly (`5 × level + 45`) while the requirement grows far faster, so any
  single multiplier that makes level 50 bearable makes level 2 instant. The
  pacing problem is the *shape* of the curve, not its scale.
- **A flat experience number per boss.** Rejected for the same reason, plus it
  would decouple the bar from the Classic table entirely.
- **Levelling the healer only, leaving the party at level 1.** Rejected: a
  level 40 priest healing four level 1 characters is neither Classic nor
  coherent — and the tank's health is what the whole fight is calibrated
  against.
- **A cosmetic sheet, with the fight staying at level 1.** Rejected: it makes
  the level a number with no consequence. Levelling now genuinely changes the
  fight — Renew at 8, Heal at 16, Flash Heal at 20, Prayer of Healing at 30,
  and pools that grow with the tables.
- **Scaling the encounters with the level at the same time.** Deliberately not
  done here, and not only for scope: the spellbook is still rank 1 only, so
  healing throughput barely moves between level 1 and 60 while health pools
  grow ~30×. Scaling the bosses against a rank 1 spellbook would make every
  fight unwinnable instead of easy. Spell ranks come first — see Consequences.

## Consequences

- ✅ The character sheet shows real Classic numbers at every level, all of them
  derived rather than stored.
- ✅ Levelling has visible consequences in the fight: four spells unlock at
  their real training levels, and every pool grows by the tables.
- ✅ The experience bar is honest about what a level costs, because the
  thresholds are the game's own.
- ✅ Progression is paced by one constant, `BOSS_XP.victoryShare`, and the
  reward stays proportional at every level.
- ⚠️ **The encounters do not scale.** Gorvath, Skarn and Threx remain the level
  1 designs of ADR-0010 and ADR-0016, so the fight gets easier with every
  level; past roughly level 8 a party wins without a single heal.
  `tests/gameStore.test.ts` pins that consequence rather than hiding it. Boss
  scaling and priest spell ranks are the follow-up work, in that order.
- ⚠️ The reward is our design, not Classic's. It is listed under **Designed** in
  `docs/classic-stats.md`, next to the sourced formula it replaced.
- ⚠️ `classicData.ts` grew from 280 to ~550 lines, most of it data. Adding a
  race or class to the party means extending its column from the same SQL file
  first.
