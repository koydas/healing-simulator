---
name: class-spellbooks
description: How each of the three playable classes (Priest, Druid, Paladin) gets its own four rank-1 spells — the ClassSpellRank data shape, the SpellKind taxonomy (direct/hot/group/groupHot/shield), the override-for-playability and reflavor-for-engine-fit patterns, and the checklist for adding or changing a spell or a class. Use this skill whenever you touch SPELLS/SPELL_ORDER/ClassSpellRank in classicData.ts or gameConfig.ts, add or change a spell for an existing class, add a new playable class, or add a new SpellKind.
---

# class-spellbooks

## When to Apply

Adding, removing or retuning a spell on any class's kit; adding a fourth
playable class; touching `ClassSpellRank`, `SPELLS`, `SPELL_ORDER`,
`SpellKind`, or `defineSpell` in `classicData.ts`/`gameConfig.ts`; and any
question of the shape "does this need a new mechanic, or does an existing
`SpellKind` already cover it?"

This sits between two other skills and duplicates neither: `classic-data`
owns the sourcing discipline (where a number comes from, the four buckets),
`pure-engine` owns how a spell's effect actually resolves inside a step
(`applySpellEffect`, the resolution order). This skill owns the shape in
between — one class, four spells, and the choices that shape implies.

## Expected Behavior

### One class, one table, four spells

Each playable class has its own `Record<string, ClassSpellRank>` in
`classicData.ts` (`PRIEST_SPELLS_RANK_1`, `DRUID_SPELLS_RANK_1`,
`PALADIN_SPELLS_RANK_1`), and `gameConfig.ts` turns each entry into a
`SpellDefinition` through `defineSpell(id, source, description, overrides?)`.
`SPELLS` itself stays **one flat `Record<SpellId, SpellDefinition>`** across
every class — spell ids are unique across the whole roster on purpose, so
`SPELLS[cast.spellId]` inside the engine never needs to know which class is
fighting. What varies per class is `SPELL_ORDER: Record<PlayableClassId,
readonly SpellId[]>`, always **ascending by `requiredLevel`** — the order a
character actually learns their own four spells in.

Adding a spell to an existing class touches five places, the same "no partial
edit" discipline `player-progression` uses for a profile field:

1. A `ClassSpellRank` entry in that class's table in `classicData.ts`, with a
   source comment (see `classic-data`).
2. A `defineSpell(...)` call in `SPELLS` (`gameConfig.ts`).
3. An entry in that class's `SPELL_ORDER` array, in the right level position.
4. A row in the class's table in `docs/classic-stats.md`, in the right bucket
   (Sourced/Derived/Approximated/Designed).
5. A test: the spell's values (`tests/classicStats.test.ts`), and its
   level-gating and cast behavior (`tests/spells.test.ts`,
   `tests/classSpellbooks.test.ts`, or a dedicated file for a new mechanic).

### `SpellKind` is derived, never chosen by hand

`classifySpellKind` in `gameConfig.ts` reads four fields off the merged
`ClassSpellRank` — `targetsParty`, `targetsSelf`, `hotTicks`, `shieldAmount` —
and picks `shield` / `groupHot` / `group` / `hot` / `direct` from them. Adding
a new spell means setting the right *source* fields, not writing a `kind`
literal:

| Spell shape | Set this | Kind you get |
| --- | --- | --- |
| Direct heal, one target | `healMin`/`healMax` only | `direct` |
| HoT, one target | `hotTicks` > 0 | `hot` |
| Direct heal, whole party | `targetsParty: true`, `healMin`/`healMax` | `group` |
| HoT, whole party | `targetsParty: true`, `hotTicks` > 0 | `groupHot` |
| Absorb shield | `shieldAmount` > 0 | `shield` |

A shield can also be `targetsSelf: true` (Divine Shield): `requiresTarget`
becomes `false` and `castSpell` resolves the effective target to
`PLAYER_MEMBER_ID` before the usual `requiresTarget` branch runs — see
`pure-engine` for the engine-side half of the shield mechanic (consumption
order, decay, no stacking).

**Reuse a `SpellKind` before inventing one.** Five real spells across the
three kits (Power Word: Shield, Thorns, Blessing of Protection, Divine
Shield; Tranquility) do not actually work the way their Classic original
does — a damage-reflect buff, a full-immunity effect, a channel — and every
one of them was mapped onto `shield` or `groupHot` rather than growing a
sixth mechanic for the occasion. A new spell whose real effect doesn't fit
`direct`/`hot`/`group`/`groupHot`/`shield` is a signal to ask whether the
*flavor* can bend to an existing mechanic before the engine grows a new one —
seeing ADR-0021's Alternatives Considered is the worked example (a true
timed-immunity mechanic for Blessing of Protection/Divine Shield was
considered and rejected in favor of reusing `shield`).

### Two escape hatches, and how to use them honestly

**Overriding a real training level for playability** (Renew: real level 8,
shipped as 1) is a last resort, not a knob. Use `defineSpell`'s `overrides`
parameter so the sourced level stays visible in `classicData.ts` and only
`gameConfig.ts` carries the deviation:

```ts
renew: defineSpell('renew', PRIEST_SPELLS_RANK_1.renew, '9 / tick × 5', {
  requiredLevel: 1, // real level is 8 — see the comment on PRIEST_SPELLS_RANK_1.renew
}),
```

Before reaching for this, actually check whether the class needs it: simulate
the naive-healer benchmark the way ADR-0021 did (`tests/bossHealth.test.ts`'s
`playNaively`, or a scratch script following the same shape) rather than
guessing from the numbers on paper — Renew's own case was not "level 8 feels
high", it was "0 wins in 400 seeds, mathematically, because 3 HP/s cannot
outpace 4 HP/s no matter how the bot plays". A deviation that changes a real
training level needs: a comment at the source (`classicData.ts`), the
`overrides` call site commented the same way, a line in `docs/classic-stats.md`
under **Designed**, and — if it's a new *kind* of exception, not a repeat of
one already accepted — an ADR.

**Reflavoring a spell whose real mechanic the engine cannot express**
(Thorns' reflect, Tranquility's channel, the two paladin full-immunity
spells, and the paladin's group heal — which has no real Classic spell at
all) means the *numbers* move from Approximated to **Designed**, because they
now describe the reimplementation, not the original spell. Say so at the
source table (see `DRUID_SPELLS_RANK_1`'s and `PALADIN_SPELLS_RANK_1`'s doc
comments in `classicData.ts` for the phrasing) and in
`docs/classic-stats.md`'s Designed bucket — a reflavored spell that reads as
Approximated overstates how close its number is to Classic's. Borrowing a
real Blizzard spell name from a different expansion when nothing in 1.12 fits
at all (Holy Radiance) is preferable to inventing a name: it stays checkable
against a real spell id, with the anachronism stated plainly, rather than
becoming an assertion nobody can verify either way.

### Adding a fourth playable class

This skill covers the spellbook; the rest is a checklist across three others:

1. **`classic-data`**: source the class's `CLASS_BASE_BY_LEVEL` row and a full
   1 – 60 `RACE_CLASS_ATTRIBUTES` column for its race pairing, from the same
   MaNGOS Zero tables — `curl` + `grep`, not a guess.
2. **This skill**: a `ClassSpellRank` table with four spells, added to
   `PLAYABLE_CLASSES`, `PLAYABLE_CLASS_RACE`, `CLASS_LABELS` and
   `SPELL_ORDER` in `gameConfig.ts`.
3. **`player-progression`**: nothing to do — `otherClassProgress` and
   `switchClass` already generalize to any `PlayableClassId`, that's the
   point of `Partial<Record<PlayableClassId, ClassProgress>>`.
4. **`render-budget`**: `CharacterAvatar` needs a new `AvatarPalette` entry
   (procedural SVG, no new asset) so the class reads apart from the other
   three at a glance.
5. **Balance**: re-run the naive-healer benchmark against every enemy at
   level 1 before calling it done — a class whose only level 1 spell cannot
   out-heal Gorvath's tank pressure is not a harder class, it is a softlock
   (this is exactly what happened once already; see ADR-0021's Context).

## Constraints

- Never let two classes' `SPELL_ORDER` share a spell id — `SPELLS` is one
  flat lookup, and a collision would make one class silently cast the other's
  numbers.
- Never write a `kind` literal by hand in a `SpellDefinition` you construct
  outside `defineSpell`; derive it from the source fields so the mapping in
  the table above stays the single source of truth.
- Never introduce a shield-like mechanic that isn't the `shield` `SpellKind`
  (a second absorb pool, a damage-reduction-only variant, …) without first
  checking whether a larger/shorter/self-only `shield` already gets the same
  practical outcome.
- Never leave a reflavored spell's numbers in the Approximated bucket; they
  are Designed, because there is no real number for them to approximate.
- Do not change `SPELL_ORDER`'s ordering convention (ascending by
  `requiredLevel`) for one class without changing it for all three — the
  home screen's spell list and the fight's button row both read this order.

## References

- `docs/adr/0021-per-class-spellbooks-and-absorb-shields.md` — the decision,
  the alternatives that lost, and the naive-healer re-measurement
  methodology
- `docs/classic-stats.md`, "Spells (rank 1) — one four-spell kit per class" —
  the three kits, spell by spell, with their bucket
- `docs/balance.md`, "Spells — rank 1, one four-spell kit per class" — the
  same tables, balance-reference form
- `src/config/classicData.ts` — `ClassSpellRank` and the three per-class
  tables
- `src/config/gameConfig.ts` — `classifySpellKind`, `defineSpell`, `SPELLS`,
  `SPELL_ORDER`
- `src/simulation/effects.ts` — `applyShield`, `applyHot`, and the
  `applySpellEffect` branch per `SpellKind`
- `tests/shieldMechanics.test.ts` — the shield mechanic's own coverage
- `tests/classSpellbooks.test.ts` — per-class `SPELL_ORDER` shape and Holy
  Radiance
- `pure-engine` skill — the resolution-order half of shields and `groupHot`
- `classic-data` skill — the sourcing discipline this skill's Designed/
  Approximated calls rely on
