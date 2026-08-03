# ADR-0005: No persistence — replayable seed through a URL parameter

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

The brief forbids any backend, any database and any local persistence. Yet two
needs remain: replaying a specific fight (debugging, comparing strategies) and
sharing a situation with someone else.

## Decision

No `localStorage`, `sessionStorage`, cookie or IndexedDB is used. A fight's
statistics live only in the in-memory `GameState` and disappear on reload.

Replayability goes through the URL: `?seed=1337` fixes the starting seed.
Without the parameter the seed comes from `Date.now()` — **the only use of the
real clock outside the game loop**, and it happens on mount, never inside the
engine. The current seed is displayed on the end screen.

`readInitialSeed()` in `App.tsx` reads the URL; the engine only ever sees the
number it is handed. Since the enemy selection screen (ADR-0016),
`readInitialEnemyId()` reads `?enemy=` the same way, and `Fight` writes both
`seed` and `enemy` back into the URL on mount — the seed alone stopped
identifying a fight uniquely once more than one enemy existed to pick from.

## Alternatives Considered

- **`localStorage` for a high score** — rejected: forbidden by the brief.
- **A fixed seed for everyone** — rejected: every fight would be identical and
  replayability would kill the interest.
- **Exporting / importing an action log** — rejected for this version:
  disproportionate complexity when "seed + same actions" already reproduces a
  fight.

## Consequences

- ✅ No user data is stored: nothing to purge, no privacy question, no consent
  banner.
- ✅ Deployment is a pure static site with no server-side state.
- ✅ An interesting fight is shared by copying the URL.
- ⚠️ Nothing survives between sessions: no history, no personal best.
- ⚠️ An accidental reload loses the fight in progress.
