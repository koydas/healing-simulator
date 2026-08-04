# Healing Simulator

A **mobile-first** web game that simulates a party healer, inspired by WoW.
The goal is not to kill the boss: it is to **keep the group alive as long as
possible** against damage pressure that ramps up every 30 seconds.

- **WoW Classic 1.12 stats, levels 1 to 60**: health, mana, spells, experience
  and regeneration are computed with the game's own tables and formulas, not
  invented;
- a **character sheet** on the home screen, with an experience bar, the record
  against each boss, and progression saved in the browser;
- React + TypeScript + Vite, **plain CSS**;
- **no backend**, no database, no account — the only thing stored is your own
  profile, in `localStorage`, deletable from the options menu;
- **no UI or game-engine dependency**;
- no CDN, no remote asset: everything is served by the container;
- a **pure, deterministic** simulation engine, tested without a DOM.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | typecheck (`tsc --noEmit`) then production build into `dist/` |
| `npm run preview` | serves `dist/` locally (http://localhost:4173) |
| `npm test` | Vitest suite (pure engine, `node` environment) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | typecheck only |

Node.js **20.19+** or **22.12+** is required — the range declared by the
locked Vite 7 release.

## How to play

1. **Tap a frame** to select the target (target-then-cast model).
2. **Tap a spell** to cast it on the selected target.
3. `Prayer of Healing` needs no target (from level 30 onwards).
4. The `Cancel` button interrupts the running cast — mana and the GCD stay
   spent.

The five vanilla priest healing families, at rank 1:

| Spell | Level | Cast | Mana | Effect |
| --- | --- | --- | --- | --- |
| Lesser Heal | **1** | 1.5 s | 30 | 46 – 56 |
| Renew | 8 | instant | 30 | 5 ticks of 9, every 3 s (never stacks) |
| Heal | 16 | 3 s | 155 | 295 – 341 |
| Flash Heal | 20 | 1.5 s | 125 | 193 – 237 |
| Prayer of Healing | 30 | 3 s | 410 | 312 – 333 on the party |

**A level 1 party only has Lesser Heal**: the other buttons show their training
level until the character reaches it. That is the real kit of a level 1
priest — the fight is an exercise in triage.

The party at level 1: Thorgrim (dwarf warrior, 90 HP), Elowen (human priest,
51 HP and 160 mana), Kaelan (human rogue, 55 HP), Fizzwick (gnome mage, 50 HP)
and Sylandra (night elf hunter, 46 HP). They all level with you, by the Classic
tables — at 60 that is 2639 HP on the tank and 2956 mana on the priest.

Mana follows the vanilla model: a 18.5 tick every 2 s at level 1 (45.25 at 60),
**suspended for 5 seconds after every expenditure** (the five-second rule).

## Progression

Killing a boss grants experience; a wipe grants none. The thresholds are the
game's own — 400 experience for level 2, 4,084,700 for the whole climb to 60 —
and a victory is worth 34% of the current level, so three wins is a level at
any point of the curve. Levelling unlocks the real priest kit: Renew at 8, Heal
at 16, Flash Heal at 20, Prayer of Healing at 30.

Level, experience and the win/loss record against each boss are stored in this
browser only (`healing-simulator.profile.v1`) and can be erased from
**Options → Delete saved game**.

> The three encounters are still the level 1 designs, and the spellbook is
> still rank 1 only, so fights get easier as you level — scaling both is the
> next piece of work. See
> [ADR-0019](./docs/adr/0019-levelling-to-60-and-boss-experience.md).

Every accepted cast triggers a 1.5 s global cooldown. The fight ends when the
tank dies or when three members are dead. Elowen can die too: from that point
casting is refused and you watch the party fall.

A fight is **exactly replayable**: `?seed=1337` in the URL fixes the seed of the
pseudo-random generator (the current seed is shown on the end screen).

## Layout

```
src/
  config/classicData.ts    sourced WoW Classic 1.12 data + formulas
  config/gameConfig.ts     balance constants, derived from the Classic data
  simulation/              pure engine (no React, no DOM)
    types.ts random.ts initialState.ts effects.ts
    feedback.ts simulation.ts actions.ts selectors.ts
  profile/                 playerProfile.ts (pure level / XP / records),
                           profileStorage.ts (localStorage, validated)
  store/gameStore.ts       engine ↔ React bridge (memoised snapshots)
  hooks/                   useGameLoop.ts (rAF), useGameStore.ts (subscriptions)
  components/              PartyFrame, PartyList, SpellButton, CastBar,
                           ManaBar, CombatFeedback, GameOver, Header, Controls,
                           HomeScreen, CharacterSheet, BossRecords, EnemySelect,
                           OptionsMenu
  App.tsx main.tsx styles.css
tests/                     Vitest engine suite
docs/                      architecture, engine, Classic stats, balance, tests,
                           deployment, runbook, ADRs
k8s/                       Deployment, Service, Ingress
nginx/default.conf         static server configuration
```

Detailed documentation: [`docs/README.md`](./docs/README.md).

## Container

Multi-stage image: Node build, then served by **non-root Nginx on port 8080**,
with an SPA fallback to `index.html` and a `/health` endpoint returning
`200 OK`.

```bash
docker build -t healing-simulator:1.0.0 .
docker run --rm -p 8080:8080 healing-simulator:1.0.0
# http://localhost:8080         → application
# http://localhost:8080/health  → OK
```

The container runs with a read-only root filesystem as long as `/tmp`,
`/var/cache/nginx` and `/var/run` are mounted (which the Deployment manifest
does).

## Kubernetes deployment

```bash
# 1. Build and push the image to the cluster registry
docker build -t <registry>/healing-simulator:1.0.0 .
docker push <registry>/healing-simulator:1.0.0

# 2. Adjust the image, the host, and the pinned LoadBalancer IP
#    - k8s/deployment.yaml: spec.template.spec.containers[0].image
#    - k8s/ingress.yaml:    spec.rules[0].host and spec.ingressClassName
#    - k8s/service.yaml:    metallb.io/loadBalancerIPs annotation is specific
#                           to this homelab's MetalLB pool -- replace it with
#                           a free address in yours, or drop it and the
#                           LoadBalancer type back to ClusterIP for
#                           Ingress-only access (see docs/deployment.md)

# 3. Apply
kubectl apply -f k8s/

# 4. Verify
kubectl rollout status deployment/healing-simulator
kubectl port-forward svc/healing-simulator 8080:80
curl -i http://localhost:8080/health
```

All three probes (`startupProbe`, `readinessProbe`, `livenessProbe`) hit
`/health` on port `8080`.

## Licence

MIT — see [`LICENSE`](./LICENSE).
