# ADR-0018: Persistent player profile in localStorage

- **Date:** 2026-08-04
- **Status:** Accepted

## Context

[ADR-0005](./0005-no-persistence-url-seed.md) forbade every form of local
persistence: a fight's statistics lived in the in-memory `GameState` and
disappeared on reload. That was the right call while a session *was* a fight.

The character sheet changes what a session is. A level, an experience total and
a win/loss record against each boss only mean something if they survive the tab
being closed — a progression that resets on reload is not a progression. The
requirement is explicit: store the profile locally, and give the player a way
to delete it.

## Decision

A single `localStorage` entry, `healing-simulator.profile.v1`, holds the whole
profile: `{ version, level, xp, records }`, where `records` is one
`{ wins, losses }` per `EnemyId`. Nothing else is persisted — a fight in
progress still dies with the tab, and the replayable seed still travels through
the URL.

The split is three layers deep, so purity is not traded away for it:

- `src/profile/playerProfile.ts` — **pure**: `createEmptyProfile`, `grantXp`,
  `applyFightOutcome`, `xpProgress`, `totalRecord`. No storage, no clock.
- `src/profile/profileStorage.ts` — the only impure part: `loadProfile`,
  `saveProfile`, `clearProfile`, plus `sanitizeProfile`. Every entry point
  takes the `Storage` as an argument (defaulting to `window.localStorage`), so
  the tests drive it with a plain object in the `node` environment.
- `App` owns the profile in React state, writes it after each fight, and passes
  `profile.level` into `createGameStore`. The engine still receives a plain
  number and knows nothing about storage.

Everything read back is validated: the level is clamped to `[1, 60]`,
experience is clipped below the current level's requirement, counters are
floored at 0, and anything unparseable falls back to a fresh profile. A save is
data from the user's disk, not a trusted value — an out-of-range level would
otherwise reach the Classic tables and throw mid-fight.

`Options → Delete saved game` removes the key behind a two-step confirmation
and resets the in-memory profile to level 1.

## Alternatives Considered

- **Keep ADR-0005 as-is and hold the profile in memory.** Rejected: the
  progression is the feature, and it would reset on every reload.
- **Encode the profile in the URL, like the seed.** Rejected: a level and a
  record are not something you share, and the URL is already the fight's
  identity — mixing the two makes a shared fight link carry someone else's
  character.
- **IndexedDB.** Rejected: asynchronous, an order of magnitude more code, for
  one object of a few hundred bytes.
- **Trust the stored JSON and skip validation.** Rejected: the cheapest way to
  crash the app is a hand-edited `"level": 900`, and the failure would surface
  far from its cause — inside `getAttributes` during a fight.
- **Store the derived stats (health, mana) alongside the level.** Rejected: it
  breaks the rule that every Classic number is computed, and a save written
  before a formula fix would keep lying forever.

## Consequences

- ✅ Level, experience and per-boss record survive a reload and a closed tab.
- ✅ The engine stays pure and the tests stay DOM-free: storage is injected.
- ✅ A corrupt or edited save degrades to a clamped or fresh profile instead of
  crashing.
- ✅ The player can delete everything, in the app, without opening devtools.
- ⚠️ ADR-0005's "no user data is stored" no longer holds. The data is local,
  never transmitted, and deletable — but the claim itself is now false and the
  README says so.
- ⚠️ Progress is per browser and per device: a different browser is a different
  character, and clearing site data wipes it.
- ⚠️ A future incompatible shape needs a new key (`…profile.v2`); the version
  field is stored but no migration path exists yet.
