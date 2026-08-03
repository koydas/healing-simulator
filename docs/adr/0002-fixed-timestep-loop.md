# ADR-0002: Fixed 100 ms timestep loop with a bounded accumulator

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

`requestAnimationFrame` delivers a variable delta (16 ms on a 60 Hz screen, 8 ms
at 120 Hz, several seconds after coming back from the background). Advancing the
simulation by that delta would make the game irreproducible: two devices would
not see the same fight from the same seed, and a tab left in the background
would come back with several minutes of "catch-up" applied at once, killing the
party instantly.

## Decision

The simulation only ever advances in fixed `TICK_MS = 100` steps.
`useGameLoop` accumulates real time and slices it:

```
delta = now - lastTimestamp
if delta > LONG_STALL_MS (1000)  → delta = 0, accumulator = 0   (no catch-up)
accumulator = min(accumulator + delta, MAX_CATCHUP_MS = 500)
while accumulator >= 100 and steps < 5:  store.advance(100)
```

A `visibilitychange` listener resets the clock and the accumulator as soon as
the tab goes to the background, so we do not rely on the 1 s threshold alone.

Every timeline interval (1500, 12,000, 30,000 ms) is a multiple of 100 ms:
event resolution is therefore exact, with no drift.

## Alternatives Considered

- **Variable step (`stepSimulation(state, delta)`)** — rejected: determinism is
  lost and damage rounding would depend on the display refresh rate.
- **`setInterval(100)`** — rejected: browser drift, aggressive background
  throttling (down to 1 Hz), and the brief forbids real timers in the business
  logic.
- **Full catch-up after returning to the tab** — explicitly rejected: the player
  would lose the fight without being able to act.

## Consequences

- ✅ Same seed + same actions ⇒ same fight, whatever the hardware.
- ✅ A backgrounded tab freezes the fight instead of losing it.
- ✅ Tests call `stepSimulation(state, 100)` directly, with no
  `requestAnimationFrame` mock.
- ⚠️ Event granularity is 100 ms: a 1.55 s cast would resolve at 1.6 s. Every
  balance value must stay a multiple of 100 ms.
- ⚠️ On a device unable to hold 2 frames per second, the simulation falls
  permanently behind (catch-up cap). That is preferable to a damage spike.
