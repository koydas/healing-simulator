# Healing Simulator

Simulateur web **mobile-first** de healer de groupe inspiré de WoW.
L'objectif n'est pas de tuer le boss : il s'agit de **maintenir le groupe en vie
le plus longtemps possible** face à une pression de dégâts qui augmente toutes
les 30 secondes.

- React + TypeScript + Vite, **CSS natif** ;
- **aucun backend**, aucune base de données, aucune persistance locale ;
- **aucune dépendance UI ou moteur de jeu** externe ;
- aucun CDN, aucun asset distant : tout est servi par le conteneur ;
- moteur de simulation **pur et déterministe**, testé sans DOM.

## Démarrage rapide

```bash
npm install
npm run dev          # http://localhost:5173
```

| Commande | Effet |
| --- | --- |
| `npm run dev` | serveur de développement Vite (HMR) |
| `npm run build` | typecheck (`tsc --noEmit`) puis build de production dans `dist/` |
| `npm run preview` | sert `dist/` localement (http://localhost:4173) |
| `npm test` | suite Vitest (moteur pur, environnement `node`) |
| `npm run test:watch` | Vitest en mode watch |
| `npm run typecheck` | typecheck seul |

Node.js **20+** est requis (Vite 7).

## Comment on joue

1. **Toucher une frame** sélectionne la cible (modèle *target-then-cast*).
2. **Toucher un sort** le lance sur la cible sélectionnée.
3. `Group Heal` ne nécessite aucune cible.
4. Le bouton `Cancel` interrompt le cast en cours — la mana et le GCD restent
   consommés.

| Sort | Cast | Mana | Effet |
| --- | --- | --- | --- |
| Renew | instantané | 300 | HoT de 150, 5 ticks espacés de 2 s (ne stacke pas) |
| Flash Heal | 1,5 s | 500 | 800 mono-cible ±10 % |
| Greater Heal | 2,5 s | 700 | 2000 mono-cible ±10 % |
| Group Heal | 3 s | 1200 | 600 fixes sur chaque membre vivant |

Tout lancement accepté déclenche un GCD de 1,5 s. La partie se termine quand le
tank meurt ou quand trois membres sont morts.

Une partie est **rejouable à l'identique** : `?seed=1337` dans l'URL fixe la
seed du générateur pseudo-aléatoire (la seed de la partie en cours est affichée
sur l'écran de fin).

## Structure

```
src/
  config/gameConfig.ts     toutes les constantes de balance
  simulation/              moteur pur (aucun React, aucun DOM)
    types.ts random.ts initialState.ts effects.ts
    feedback.ts simulation.ts actions.ts selectors.ts
  store/gameStore.ts       pont moteur ↔ React (snapshots mémoïsés)
  hooks/                   useGameLoop.ts (rAF), useGameStore.ts (abonnements)
  components/              PartyFrame, PartyList, SpellButton, CastBar,
                           ManaBar, CombatFeedback, GameOver, Header, Controls
  App.tsx main.tsx styles.css
tests/                     suite Vitest du moteur
docs/                      architecture, moteur, balance, tests, déploiement, ADR
k8s/                       Deployment, Service, Ingress
nginx/default.conf         configuration du serveur statique
```

Documentation détaillée : [`docs/README.md`](./docs/README.md).

## Conteneur

Image multi-stage : build Node puis service par **Nginx non-root sur le port
8080**, avec fallback SPA vers `index.html` et endpoint `/health` renvoyant
`200 OK`.

```bash
docker build -t healing-simulator:1.0.0 .
docker run --rm -p 8080:8080 healing-simulator:1.0.0
# http://localhost:8080         → application
# http://localhost:8080/health  → OK
```

Le conteneur fonctionne avec un système de fichiers racine en lecture seule à
condition de monter `/tmp`, `/var/cache/nginx` et `/var/run` (c'est ce que fait
le manifeste Deployment).

## Déploiement Kubernetes

```bash
# 1. Construire et pousser l'image dans le registre du cluster
docker build -t <registry>/healing-simulator:1.0.0 .
docker push <registry>/healing-simulator:1.0.0

# 2. Adapter l'image et l'hôte
#    - k8s/deployment.yaml : spec.template.spec.containers[0].image
#    - k8s/ingress.yaml    : spec.rules[0].host et spec.ingressClassName

# 3. Appliquer
kubectl apply -f k8s/

# 4. Vérifier
kubectl rollout status deployment/healing-simulator
kubectl port-forward svc/healing-simulator 8080:80
curl -i http://localhost:8080/health
```

Les trois sondes (`startupProbe`, `readinessProbe`, `livenessProbe`) interrogent
`/health` sur le port `8080`.

## Licence

MIT — voir [`LICENSE`](./LICENSE).
