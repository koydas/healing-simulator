# ADR-0005: No persistence — replayable seed through a URL parameter

- **Date:** 2026-08-02
- **Status:** Accepted

> Update (ADR-0018): the "no `localStorage`" half of this decision no longer
> holds. The player profile — level, experience and the record against each
> boss — is stored under `healing-simulator.profile.v1` and can be deleted from
> the options menu. Everything else below still applies: a fight in progress is
> not saved, its statistics die with the tab, and the seed remains the only way
> to replay one.

> Update (ADR-0019): once the party's stats came from `playerLevel`, `?seed=`
> and `?enemy=` stopped fully identifying a fight — the same URL opened from a
> level 1 and a level 60 profile built a different party, with different
> health, mana and spellbook, and could resolve to a different outcome.
> `?level=` now pins it the same way, read by `readInitialLevel()` and written
> by `syncFightUrl` alongside the other two; absent, it falls back to the
> current profile's level exactly as before. Caught by Codex review on #9.

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
