# ADR-0007: Stats derived from the WoW Classic tables and formulas (level 1)

- **Date:** 2026-08-02
- **Status:** Accepted

> Update (ADR-0019): the tables now cover every level up to 60 and are indexed
> by it — `CLASS_BASE_LEVEL_1` became `CLASS_BASE_BY_LEVEL` (read through
> `getClassBase(classId, level)`) and `RACE_CLASS_ATTRIBUTES_LEVEL_1` became
> `RACE_CLASS_ATTRIBUTES` (`getAttributes(race, classId, level)`). The decision
> itself is unchanged: stats are still computed by the vanilla formulas, never
> copied, and a missing row still throws instead of being interpolated.

## Context

The first version used invented values: 4000 health per character, 8000 for the
tank, 10,000 mana, heals from 800 to 2000. Internally consistent, but unrelated
to WoW. The request is to use the **real WoW Classic stats**, with every
character at level 1.

There are two ways to do that: copy values found here and there by hand, or
rebuild the characters the way the server does — class base table, race/class
attributes, then the conversion formulas.

## Decision

Stats are **computed**, never copied.

`src/config/classicData.ts` contains sourced data only:

- `CLASS_BASE_LEVEL_1` — base health and mana per class, from the
  `player_classlevelstats` table of the vanilla MaNGOS Zero (1.12) database;
- `RACE_CLASS_ATTRIBUTES_LEVEL_1` — strength / agility / stamina / intellect /
  spirit per race and class, from `player_levelstats`;
- the two official formulas, taken from the server code (`StatSystem.cpp`):

```
health bonus = min(sta, 20) × 1 + max(0, sta − 20) × 10
mana bonus   = min(int, 20) × 1 + max(0, int − 20) × 15
```

`gameConfig.ts` derives the party from them: a dwarf warrior has 90 health, a
human priest 51 health and 160 mana, and so on. No health value is hard-coded in
the engine, the components or the tests — those read `PARTY_TEMPLATE`.

A regression test checks a publicly known value: a level 1 human warrior does
have 60 health.

The sourced / derived / approximated / designed split is kept up to date in
[`docs/classic-stats.md`](../classic-stats.md).

## Alternatives Considered

- **Copying values from a wiki** — rejected: there would be no way to verify an
  inconsistency, and nothing would let us move to level 2 afterwards.
- **Keeping "round" health values and calling them Classic** — rejected:
  dishonest, and the scale (thousands of health) gives it away immediately.
- **Loading the client DBC files** — rejected: they are not redistributable, and
  the game must stay a dependency-free static site.
- **Keeping the "the tank has twice the health of the others" rule** — dropped
  in favour of the real values. The resulting ratio (90 against 46) is 1.96: the
  original rule is *recovered* rather than imposed, because the tank is a dwarf
  warrior (stamina 25, the highest at level 1).

## Consequences

- ✅ Every number is traceable to a server table or a line of emulator code.
- ✅ Levelling the party to 10 or 60 will mean extending two tables, not
  rewriting the balance: the source SQL files already contain every level.
- ✅ Tests exercise the formulas, not copied constants.
- ⚠️ The scale changes radically (46 to 90 health instead of 4000): the whole
  damage timeline had to be recalibrated (see ADR-0010).
- ⚠️ Health varies a lot between members because of the 20-stamina threshold.
  That is faithful, but surprising if you expect uniform health pools.
- ⚠️ The tables currently cover only level 1 and the party's race/class
  combinations: asking for anything else raises an explicit error rather than
  returning a wrong value.
