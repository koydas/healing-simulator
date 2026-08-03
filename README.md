# Healing Simulator

A **mobile-first** web game that simulates a party healer, inspired by WoW.
The goal is not to kill the boss: it is to **keep the group alive as long as
possible** against damage pressure that ramps up every 30 seconds.

- **WoW Classic 1.12, level 1 stats**: health, mana, spells and regeneration are
  computed with the game's own tables and formulas, not invented;
- React + TypeScript + Vite, **plain CSS**;
- **no backend**, no database, no local persistence;
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

**Since the party is level 1, only Lesser Heal is available**: the other buttons
show their training level. That is the real kit of a level 1 priest — the fight
is an exercise in triage.

The party: Thorgrim (dwarf warrior, 90 HP), Elowen (human priest, 51 HP and
160 mana), Kaelan (human rogue, 55 HP), Fizzwick (gnome mage, 50 HP) and
Sylandra (night elf hunter, 46 HP).

Mana follows the vanilla model: a 18.5 tick every 2 s, **suspended for 5 seconds
after every expenditure** (the five-second rule).

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
  store/gameStore.ts       engine ↔ React bridge (memoised snapshots)
  hooks/                   useGameLoop.ts (rAF), useGameStore.ts (subscriptions)
  components/              PartyFrame, PartyList, SpellButton, CastBar,
                           ManaBar, CombatFeedback, GameOver, Header, Controls
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
