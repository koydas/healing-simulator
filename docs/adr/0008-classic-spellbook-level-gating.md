# ADR-0008: Real priest spell book gated by training level

- **Date:** 2026-08-02
- **Status:** Accepted

> Update (ADR-0019): the level is no longer a constant. `PLAYER_LEVEL` is now
> `STARTING_LEVEL` (still 1), and `state.playerLevel` comes from the saved
> profile, so the "when the time comes" of this ADR has come: Renew, Heal,
> Flash Heal and Prayer of Healing unlock by playing. The gating rule and its
> refusal message are untouched. Only rank 1 of each family exists so far.

## Context

The four original spells (Renew, Flash Heal, Greater Heal, Group Heal) were
invented. Moving to Classic stats meant they had to become real vanilla priest
spells.

A problem shows up immediately: **at level 1 a priest only knows Lesser Heal**.
Renew is learned at level 8, Heal at 16, Flash Heal at 20, Prayer of Healing at
30. A four-spell bar that is "all level 1" does not exist in the game. The costs
confirm it: Prayer of Healing costs 410 mana, 2.5 times a level 1 priest's pool.

## Decision

The bar shows the **five vanilla priest healing families**, at rank 1, with
their real values:

| Spell | Level | Mana | Cast | Effect |
| --- | --- | --- | --- | --- |
| Lesser Heal | 1 | 30 | 1.5 s | 46 – 56 |
| Renew | 8 | 30 | instant | 5 ticks of 9, every 3 s |
| Heal | 16 | 155 | 3.0 s | 295 – 341 |
| Flash Heal | 20 | 125 | 1.5 s | 193 – 237 |
| Prayer of Healing | 30 | 410 | 3.0 s | 312 – 333 on the party |

The healer's level is carried by the `GameState` (`playerLevel`, initialised
from `PLAYER_LEVEL = 1`). `checkCast` refuses any spell whose
`requiredLevel > playerLevel`, with the `level` reason and the message
"Level too low". Locked buttons stay visible, dashed, and display "Lv. 8",
"Lv. 16" and so on.

**At level 1 the fight is therefore played with a single spell.** That is a
deliberate choice: it is the real kit of a level 1 priest, and it turns the
fight into an exercise in triage — one Lesser Heal every 1.5 s cannot follow two
low targets at once.

Healing is rolled uniformly inside the spell's range (46 – 56), like in game,
replacing the old "base ± 10%".

## Alternatives Considered

- **Keeping four invented spells at level 1 scale** — rejected: that was exactly
  what we were replacing; the spells would have been just as arbitrary as
  before, only with smaller numbers.
- **Showing the five spells with no level condition** — rejected: it contradicts
  "everyone at level 1", and Prayer of Healing would be unusable anyway (410
  mana for a 160 pool). Flash Heal (193 – 237) would heal four times a DPS's
  maximum health: the game would lose all tension.
- **Showing only Lesser Heal and hiding the rest** — rejected: locked buttons
  inform ("this spell arrives at level 8") and make progression legible.
- **Using a level 16-20 priest kit** to get four usable spells — rejected here,
  but that is exactly what `PLAYER_LEVEL = 20` will produce when the time comes:
  nothing else to change.

## Consequences

- ✅ Every spell matches a real spell, with its Blizzard id, verifiable in the
  database.
- ✅ Raising `PLAYER_LEVEL` unlocks spells automatically, with no engine or UI
  change.
- ✅ Since the level lives in the `GameState`, tests can simulate a level 20
  priest without touching a global constant.
- ⚠️ At level 1 four buttons out of five are inert: faithful, but it can read as
  an unfinished interface at first glance.
- ⚠️ The bar grows from four to five buttons (three per row on a phone, two on
  the second row); the 72 × 72 px constraint still holds.

> Update (ADR-0015): on a phone, spell buttons drop to 64 × 64 px and pack
> into a single row instead of two, to leave room for the whole party without
> scrolling. The 72 × 72 px size is kept on desktop/landscape only.
- ⚠️ The higher ranks' amounts (Heal, Flash Heal, Prayer of Healing) are out of
  scale for level 1 health pools: they will only make sense once the party
  levels up.
