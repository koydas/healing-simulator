# ADR-0009: Vanilla mana regeneration — 2 s ticks and the five-second rule

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

The first version regenerated 100 mana per second, raised to 200 after two
seconds without a cast — a mechanic invented to reward pauses.

WoW Classic works differently, and more interestingly:

1. mana lands in **2-second ticks**, not continuously;
2. the spirit-based part is **fully suspended for the 5 seconds following a mana
   expenditure** — the "five-second rule" (5SR). Without the Meditation talent,
   a priest who chains casts regenerates strictly nothing.

Moving to Classic stats without adopting that mechanic would have left the
game's central resource wide of the mark.

## Decision

Regeneration follows the vanilla model:

- one tick every `MANA.tickMs` = 2000 ms, driven by a `GameState` timer
  (`timers.manaTickMs`) that keeps running continuously;
- on each tick, mana is only credited when `msSinceLastCastStart >= 5000`;
- the amount per tick is derived from the priest's spirit:
  `spirit / 4 + 12.5`, i.e. **18.5** for a level 1 human priest (spirit 24).

`msSinceLastCastStart` is reset on every accepted cast — since mana is spent at
cast start, that counter is exactly the 5SR trigger.

The old notion of "enhanced regeneration" disappears, replaced by "regeneration
active / suspended".

The spirit coefficient is the **only approximated value** in the project: the
real table (`gtRegenMPPerSpt` in the client DBC files) depends on class and
level and is not publicly usable. The formula we use describes level 60; it is
flagged as an approximation in [`docs/classic-stats.md`](../classic-stats.md).

## Alternatives Considered

- **Keeping continuous 100/200 per second regeneration** — rejected:
  inconsistent with the request, and at level 1 scale it would refill the pool
  (160) twice per second.
- **Continuous regeneration at 9.25 mana/s** (the same average throughput,
  smoothed) — rejected: simpler, but it loses the texture. With ticks, stopping
  for 5.2 s or 6.1 s does not give the same result, which is exactly the tension
  of vanilla mana management.
- **Modelling the Meditation talent too** (15% regeneration kept during the
  5SR) — set aside: it is a talent, and a level 1 priest has no talent points.
- **Reconstructing `gtRegenMPPerSpt` from measurements** — set aside for now:
  disproportionate, and the level 60 formula already yields a playable balance.

## Consequences

- ✅ The game's central resource behaves like Classic: five Lesser Heals in a
  row, then a mandatory quiet window.
- ✅ The five-second rule creates a real decision at every moment — cast now, or
  let the tick land.
- ✅ The behaviour is testable tick by tick (`tests/spells.test.ts`).
- ⚠️ The spirit coefficient is approximated; real level 1 regeneration is
  probably a little lower, which would make the game harder.
- ⚠️ Since the tick lands every 2 s regardless of what the player does, a cast
  just after a tick "loses" less than one just before: that is the game's
  behaviour, not a defect.
