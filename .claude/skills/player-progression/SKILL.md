---
name: player-progression
description: Rules for the player profile — level, experience, per-boss record — and the localStorage it lives in: what may be stored, why every load is sanitised, where experience is granted, and how the pure profile module stays testable without a DOM. Use this skill whenever you touch src/profile/, the saved game, the experience reward or the level cap, whenever you add something the player keeps between fights (a counter, a best time, an unlocked option), and whenever a change makes you consider writing to localStorage.
---

# player-progression

## When to Apply

Anything the player keeps between fights: the level, the experience inside it,
the win/loss record per boss, and the `localStorage` entry holding them. Also
any change to what a victory pays, to the level cap, or to where a finished
fight is turned into progression.

This is the only part of the project that persists anything, and the only one
that reads data it did not produce. Both facts have already shaped the design:
the save is a file on someone else's disk, and the progression math has to stay
as testable as the engine.

## Expected Behavior

### Three layers, and the line between them

```
src/profile/playerProfile.ts    pure: createEmptyProfile, grantXp,
                                applyFightOutcome, xpProgress, totalRecord
src/profile/profileStorage.ts   impure: load / save / clear / sanitizeProfile
App.tsx                         owns the profile, persists it, hands the level
                                to createGameStore
```

`playerProfile.ts` obeys the same contract as the engine: no `localStorage`, no
clock, no DOM, and every function returns a new profile rather than mutating
its argument (`cloneProfile` first, exactly like `cloneState`). If a rule needs
a stored value to decide something, it takes it as a parameter.

`profileStorage.ts` is the only file allowed to touch `window.localStorage`, and
every entry point takes the storage as an argument:

```ts
export function loadProfile(storage = defaultProfileStorage()): PlayerProfile
```

That argument is what keeps the tests in the `node` environment — they pass a
plain object with `getItem` / `setItem` / `removeItem`. **Do not mock a global
to test persistence**, and do not reach for `jsdom`.

Self-check before committing:

```bash
grep -rn "localStorage\|sessionStorage" src | grep -v "^src/profile/profileStorage.ts"
```

Only `App.tsx` importing the profile helpers should show up — never a direct
storage call.

### Store the identity, never the derived stats

The save holds `{ version, level, xp, records }` and nothing else. Health,
mana, regeneration and the spell list are recomputed from the Classic tables at
load time (`playerCharacterAtLevel`, `partyTemplateAtLevel`).

Storing a derived value looks harmless and rots silently: a save written before
a formula fix would keep handing back the old health forever, and the
`classic-data` rule ("never hard-code a value the formulas can compute") would
be broken through the back door.

### Everything read back is hostile input

`loadProfile` never trusts what it parses. `sanitizeProfile` clamps the level
to `[1, MAX_LEVEL]`, clips experience below the current level's requirement,
floors every counter at 0, and falls back to a fresh profile on anything
unparseable.

This is not paranoia about cheating — the player can edit their own save, and
that is their business. It is about **where the failure lands**: an
out-of-range level reaches `getAttributes`, which throws by design, and the
crash would surface in the middle of a fight, far from the corrupt byte that
caused it.

So a new field in `PlayerProfile` means four edits, not one:

1. `createEmptyProfile` — its zero value;
2. `cloneProfile` — so it survives a `grantXp`;
3. `sanitizeProfile` — its validation, or an old save yields `undefined`;
4. a test in `tests/profile.test.ts` covering the corrupt case.

Changing the *shape* incompatibly means a new key (`…profile.v2`), not a silent
migration of the old one.

### Experience: sourced thresholds, designed reward

The two halves are deliberately different in nature, and the distinction has to
survive every retune:

- **`XP_TO_NEXT_LEVEL` is sourced** (`player_xp_for_level`, MaNGOS Zero) and
  belongs in `classicData.ts`. `xpToNextLevel(level)` returns `null` at the cap
  and throws outside `[1, 60]`.
- **`BOSS_XP.victoryShare` is designed** and belongs in `gameConfig.ts`, with
  the reasoning next to it. Vanilla's own kill formula — `2 × (5 × level + 45)`
  for a same-level elite — pays 100 experience at level 1 against a 400-point
  level, and would take about 8,000 boss kills to reach 60. That number is why
  the reward is a share of the level instead; keep it in the comment, it is the
  answer to "why not just use the real formula?".

A change to the reward updates the **Designed** list in
`docs/classic-stats.md`. A change to the thresholds means you found a better
source — say which, in `classicData.ts` and in the same document.

`grantXp` subtracts and repeats, so a reward larger than one level carries over
instead of being clipped; at the cap the surplus is dropped. Both cases have
tests, keep them.

### Experience is granted once, at the end of a fight

The chain is:

```
stepSimulation → status becomes 'over'
  → gameStore.setState detects the transition
    → onFightEnd(outcome, enemyId, playerLevel)
      → App.handleFightEnd: playerLevel === profile.level ?
          → applyFightOutcome → saveProfile → setProfile
          : refused — see below
```

The store is the right place to detect it because it sees every state
transition exactly once. **Do not move that detection into a `useEffect` on the
summary snapshot** — it re-fires on re-render, and the player gets paid twice
for one boss.

The level applies from the *next* fight: `GameState.playerLevel` is fixed when
the fight is created, and nothing levels a character mid-fight. Keep it that
way — a health pool changing under a running simulation breaks the invariants
in `docs/simulation.md`.

### A fight is only ever credited to the profile it was fought at

`onFightEnd`'s third argument is `state.playerLevel` — the level the party was
actually built and fought with — not an echo of whatever `App` asked for. A
`?level=` replay URL (ADR-0005) can pin that to something other than the
current saved profile, and `handleFightEnd` compares the two before touching
anything:

```ts
if (fightLevel !== profileRef.current.level) {
  setReward(null);
  setLevelMismatch(true);
  return; // no applyFightOutcome, no saveProfile
}
```

Skipping this check is a real exploit, not just a display glitch: a level 59
profile replaying a shared `?level=1` link would win trivially and still bank
the full level-59 reward, and a level 1 profile replaying `?level=60` would
claim a win its own character never earned. The fight still plays out and its
statistics still show on the end screen — only the profile update and the
win/loss record are refused, and the screen says so (`levelMismatch`) instead
of silently granting nothing, which would look like a bug.

### The balance consequence stays visible

Levelling makes the fight easier: the encounters are still the level 1 designs
(`ENEMY_LEVEL`), and the spellbook is still rank 1 only, so health pools grow
about 30× between level 1 and 60 while healing does not move.
`tests/gameStore.test.ts` asserts that a level 60 party wins with no healing —
that test is documentation, do not delete it to make a suite look better.

If you set out to fix the balance: **spell ranks first, boss scaling second.**
Scaling the bosses against a rank 1 spellbook makes every fight unwinnable
rather than easy, which is worse than the current state.

## Constraints

- Never import `profileStorage` from `src/simulation/` or `src/config/`; the
  dependency runs the other way, and the engine only ever receives a number.
- Never persist a fight in progress. ADR-0005 still holds for everything except
  the profile: a reload starts a new fight, and the seed is what replays one.
- Never trust the stored JSON, and never let a storage failure be fatal —
  private mode, a full quota and a disabled storage all have to degrade to
  "plays fine, saves nothing".
- Do not add a second storage key without an ADR: one entry, one shape,
  versioned by name.
- Do not put the profile in a Context that the fight screen consumes; it
  changes once per fight, so it travels as props (see `render-budget`).

## References

- `docs/adr/0018-persistent-player-profile-localstorage.md` — why persistence
  exists at all, and what it costs
- `docs/adr/0019-levelling-to-60-and-boss-experience.md` — the sourced/designed
  split of experience, and the alternatives that lost
- `docs/classic-stats.md` — the experience table, the reward, and the four
  buckets
- `src/profile/playerProfile.ts` — the pure rules
- `src/profile/profileStorage.ts` — validation and the storage boundary
- `tests/profile.test.ts` — the failure branches worth keeping
