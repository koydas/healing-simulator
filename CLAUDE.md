# CLAUDE.md — healing-simulator

A mobile web game simulating a party healer, built on WoW Classic 1.12 level 1
stats: **pure deterministic engine → external store → React**, no backend, no
persistence, no UI dependency.

Read `docs/README.md` first; `docs/architecture.md` explains the layering and
`docs/classic-stats.md` explains where every game number comes from.

## Ground rules

1. **The engine stays pure.** No `Date.now()`, `performance.now()`,
   `Math.random()`, DOM or React API under `src/simulation/`.
2. **Classic data is sourced, never remembered.** Raw values live in
   `src/config/classicData.ts` with their source; everything else is derived in
   `src/config/gameConfig.ts`.
3. **No gameplay number outside `src/config/`.**
4. **Every engine change ships with a test.** `npm test && npm run build` must
   pass before committing.
5. **The whole project is written in English** — UI, comments, tests, docs.

## Skills

@.claude/skills/pure-engine/SKILL.md
@.claude/skills/classic-data/SKILL.md
@.claude/skills/render-budget/SKILL.md
@.claude/skills/test-protocol/SKILL.md
@.claude/skills/new-adr/SKILL.md
@.claude/skills/pr-review-workflow/SKILL.md
