# Documentation — Healing Simulator

| Document | Contents |
| --- | --- |
| [architecture.md](./architecture.md) | layering, data flow, rendering strategy |
| [simulation.md](./simulation.md) | engine contract: fixed timestep, event order, invariants |
| [classic-stats.md](./classic-stats.md) | WoW Classic level 1 stats: sources, formulas, and what is sourced / derived / designed |
| [balance.md](./balance.md) | every balance value and where it lives in the code |
| [testing.md](./testing.md) | how the Vitest suite is organised and what it must cover |
| [deployment.md](./deployment.md) | Docker image, Nginx, Kubernetes manifests, probes |
| [runbook.md](./runbook.md) | troubleshooting (dev, build, container, cluster) |
| [adr/](./adr/README.md) | architecture decision records |

The rules below are also packaged as Claude Code skills under
[`.claude/skills/`](../.claude/skills), so an agent working in this repository
picks up the relevant one automatically:

| Skill | Covers |
| --- | --- |
| `pure-engine` | the `src/simulation/` contract: purity, fixed step, event order, seeded randomness |
| `classic-data` | sourcing any value claimed to be from WoW Classic, and the sourced / derived / approximated / designed split |
| `render-budget` | the store / snapshot / `onFrame` split, `React.memo`, and the mobile layout rules |
| `test-protocol` | Vitest conventions, the `tests/helpers.ts` toolkit, failure-branch coverage |
| `new-adr` | recording an architecture decision |
| `pr-review-workflow` | reproduce, fix, reply with evidence, resolve, re-request |

## Contribution rules in short

1. **Classic data lives in `src/config/classicData.ts`** (sourced values only)
   and **game constants in `src/config/gameConfig.ts`**, which derives them. No
   gameplay number anywhere else — and above all no health value or spell cost
   copied by hand.
2. **The engine stays pure.** No `Date.now()`, `performance.now()`,
   `Math.random()`, DOM or React API under `src/simulation/`.
3. **Every engine change comes with a test** in `tests/`.
4. `npm test && npm run build` must pass before any commit.
5. A structural decision gets an ADR (see [adr/](./adr/README.md)).
6. **Any value presented as "Classic" must be sourced** in
   [classic-stats.md](./classic-stats.md), with its link. An invented value is
   declared as such in the "Designed" section.
7. The whole project — UI, code comments, tests and docs — is written in
   English.
