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
>
> That fix opened a second problem, caught by the same review one round later:
> pinning `?level=` lets a fight be played at a level different from the
> profile that opens it — a level 59 profile replaying an easy `?level=1` link
> could otherwise bank the full level-59 reward for a trivial fight, and a
> level 1 profile replaying `?level=60` could claim a win its character never
> earned. `App.handleFightEnd` now compares the level the fight actually ran at
> (`state.playerLevel`, passed through the store's `onFightEnd`) against the
> live profile's level and skips the reward and the record entirely on a
> mismatch; the end screen says so instead of silently doing nothing.

> Update (ADR-0020): editable class reopened the exact same problem `?level=`
> already fixed once. Class now sizes the healer's health and mana too
> (`partyTemplateAtLevel`), so `?seed=&enemy=&level=` alone stopped fully
> identifying a fight the moment class became a variable — the same link
> opened on a browser whose saved profile plays a different class built a
> different party and could resolve to a different outcome. `?class=` now
> pins it the same way `?level=` does: read by `readInitialClassId()`, written
> by `syncFightUrl` alongside the other three, falling back to the current
> profile's class exactly as before. The credit-refusal comparison in
> `App.handleFightEnd` gained the matching half: a class mismatch skips the
> reward and the record exactly like a level mismatch already did, and
> `onFightEnd`'s new fourth argument reports the class the fight actually
> built (from `state.party`, not an echo of what it was asked to build) for
> the same reason its level argument already read from `state`. Caught by
> Codex review on #18 — see
> [ADR-0020](./0020-editable-character-identity.md).

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
