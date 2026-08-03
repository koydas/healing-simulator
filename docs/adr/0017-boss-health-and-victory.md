# ADR-0017: The boss has a health bar, and the fight can now be won

- **Date:** 2026-08-03
- **Status:** Accepted

## Context

Until now the game had no win condition. ADR-0010 designed the boss purely as
a damage source, and said so explicitly: "holdable at first, doomed in the
long run" — the ramp always eventually overtakes the healer, and the fight
could only ever end in a wipe. That was a deliberate choice at the time (no
level 1 creature is a real boss, so there was nothing to make killable), but
it means the player has nothing to work *towards* — only something to delay.

Requested change: show the boss's health bar during the fight, implying the
boss can actually be brought down.

## Decision

The tank and the three DPS (not the healer — healing is the whole point of
the game) chip away at the boss automatically, every second, for a designed
per-member amount (`PARTY_DAMAGE.perMemberAmount = 3`, `src/config/gameConfig.ts`).
A dead contributor's share is simply not dealt — the survivors do not pick up
the slack. This is entirely designed, same bucket as the boss's own damage
numbers (ADR-0010): no per-class attack is simulated, no weapon damage is
sourced from Classic, because none of that granularity is needed to make the
health bar mean something.

Each enemy gets its own `hpMax` (`EncounterProfile.hpMax`,
`src/simulation/types.ts`), copied into `GameState.bossHp` at fight creation
exactly like the existing damage fields (ADR-0016). `stepSimulation` gained
two steps at the end of its resolution order (`docs/simulation.md`):

9. **party damage on the boss** — `applyPartyDamage`, a timer-driven step
   identical in shape to `applyTankDamage`;
10. **victory check** — `checkVictory`, a no-op once step 8 (wipe check)
    has already ended the fight this tick, so a mutual kill (the boss and the
    tank dying the same instant) resolves as a wipe, not a victory.

`GameState` gained an `outcome: 'wipe' | 'victory' | null` field alongside
`status`, so `status === 'over'` still means exactly what it always has (both
`checkWipe` and `checkVictory` set it), while `outcome` tells the UI and
`computeStatsSummary` which one happened. `GameOver` reads it to switch its
title, its accent colour, and the "Survived" vs. "Boss defeated in" wording.

The health bar itself lives in `Header`, below the existing name/timer/pause
row (`.header__bossbar`), sourced from `HeaderSnapshot.bossHp` /
`.bossHpMax` — no new subscription needed, since `Header` already re-renders
once a second for the timer label (`render-budget`: the bar changes on the
same 1000 ms cadence as `PARTY_DAMAGE.intervalMs`, well below "most 100 ms
steps," so it rides the existing snapshot instead of a `useFrame` CSS-variable
channel).

Calibration (naive healer, twelve fixed seeds, same method as ADR-0010 and
ADR-0016) aimed for real tension rather than a guaranteed outcome either way:

| Enemy | `hpMax` | Wins | Wipes |
| --- | --- | --- | --- |
| Gorvath | 600 | 7 | 5 |
| Skarn | 550 | 7 | 5 |
| Threx | 460 | 6 | 6 |

The first values tried (780 / 780 / 660, sized so a *fully-alive* party would
kill the boss around the existing naive-survival window) produced **zero**
wins across all three enemies and all twelve seeds: once a DPS dies, the
party's own output drops, which stretches the time-to-kill, which gives the
ramp more time to kill someone else — a death spiral that made victory
unreachable under naive play. Lowering `hpMax` until wins and wipes both
showed up in roughly even numbers was the only way to find a value that
was not simply "always wins" or "always wipes" — see Alternatives.

## Alternatives Considered

- **A cosmetic bar with no real mechanic** (tied to elapsed time or the ramp,
  not to any actual damage) — rejected: it would be lying to the player about
  what the bar means, and contradicts the specific request for a health bar
  "during combat."
- **Per-class simulated damage** (weapon damage, attack speed per DPS,
  sourced from Classic like the party's health) — rejected as premature: nothing
  in the current engine reads individual attack power, and building that out
  just to produce one aggregate number would be a lot of `classic-data`
  sourcing work for a value nobody can see broken down per member anyway. The
  single `PARTY_DAMAGE` constant is honestly labelled Designed, same as the
  boss's own AoE and spike amounts.
- **Size `hpMax` for a guaranteed win under full uptime** (the first attempt,
  780/780/660) — rejected after measuring: it produced zero wins in twelve
  seeds under naive play, because a death spiral (dead DPS → less boss damage
  → longer fight → more time for the ramp to kill someone else) pushes the
  real kill time far past the "everyone survives" estimate. A health bar that
  can never reach zero is worse than no health bar.
- **Dead members' share redistributed to survivors** (so three living DPS
  always deal a fixed total) — rejected: it would erase the stakes of a DPS
  dying, which is exactly the tension this feature is meant to add.

## Consequences

- ✅ The fight can now be won, not just survived — the boss's health bar gives
  the player something to read progress from, in addition to their own party's.
- ✅ Calibrated with the same simulate-and-measure method as ADR-0010 and
  ADR-0016, landing on a real mixed outcome (roughly 50–60% wins) rather than
  a guaranteed one.
- ✅ `status` keeps its existing meaning everywhere it was already checked
  (`checkCast`, `Header`, `GameOver`); `outcome` is purely additive.
- ✅ No new subscription cost: the boss bar rides the header snapshot, which
  already changes once a second.
- ⚠️ ADR-0010's "doomed in the long run" and "holdable at first" no longer
  describe every possible outcome of that profile — see the update note added
  there.
- ⚠️ A fourth number to calibrate per enemy (`hpMax`), on top of the three
  damage fields ADR-0016 already introduced. Adding a fifth enemy means
  re-running the same win/wipe sweep, not just picking numbers that look
  plausible.
- ⚠️ The death-spiral dynamic (fewer DPS alive → slower kill → more time for
  the ramp to finish the party) is not explained anywhere in the UI. A player
  who loses a DPS mid-fight will feel both problems compound without being
  told why.
