# CLAUDE.md — healing-simulator

A mobile web game simulating a party healer, built on WoW Classic 1.12 stats
from level 1 to 60: **pure deterministic engine → external store → React**, no
backend, no UI dependency. The only thing persisted is the player's profile —
level, experience, record — in `localStorage` (ADR-0018).

Read `docs/README.md` first; `docs/architecture.md` explains the layering and
`docs/classic-stats.md` explains where every game number comes from.

## Ground rules

1. **The engine stays pure.** No `Date.now()`, `performance.now()`,
   `Math.random()`, DOM or React API under `src/simulation/`.
2. **Classic data is sourced, never remembered.** Raw values live in
   `src/config/classicData.ts` with their source; everything else is derived in
   `src/config/gameConfig.ts`.
3. **No gameplay number outside `src/config/`.**
4. **Only `src/profile/profileStorage.ts` touches storage**, it stores the
   character's identity (level, experience, records) and never a derived stat,
   and it validates everything it reads back.
5. **Every engine change ships with a test.** `npm test && npm run build` must
   pass before committing.
6. **The whole project is written in English** — UI, comments, tests, docs.

## Skills

@.claude/skills/pure-engine/SKILL.md
@.claude/skills/classic-data/SKILL.md
@.claude/skills/player-progression/SKILL.md
@.claude/skills/render-budget/SKILL.md
@.claude/skills/test-protocol/SKILL.md
@.claude/skills/new-adr/SKILL.md
@.claude/skills/pr-review-workflow/SKILL.md
