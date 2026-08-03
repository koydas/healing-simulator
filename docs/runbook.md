# Runbook

Diagnostic des problèmes courants, du poste de développement au cluster.

## Développement

### `npm run dev` démarre mais la page est blanche

1. Ouvrir la console du navigateur : une exception dans `main.tsx` (élément
   `#root` absent) ou dans un composant arrête le rendu.
2. Vérifier que `index.html` contient bien `<div id="root">`.
3. `npm run typecheck` pour écarter une erreur de types masquée par le HMR.

### Le jeu semble « sauter » après un changement d'onglet

C'est le comportement attendu : au-delà de `LONG_STALL_MS` (1 s), le temps
écoulé est **jeté**, il n'y a aucun rattrapage. Le timer ne progresse pas
pendant que l'onglet est en arrière-plan.

### Le jeu avance trop lentement sur un appareil lent

Le rattrapage est plafonné à `MAX_CATCHUP_MS` (500 ms, soit 5 pas par frame).
Si l'appareil ne tient pas 2 frames/s, la simulation prend du retard par
construction — c'est un choix de conception (voir ADR-0002), pas un bug.

### Un test échoue après un changement de balance

Plusieurs tests s'appuient sur les valeurs nominales de niveau 1 (mêlée 8, AoE 6,
spike 18, PV 90 / 51 / 55 / 50 / 46). Mettre à jour le test, `docs/balance.md`
et, si la valeur se présente comme issue de Classic, `docs/classic-stats.md`.

### « Les PV ne correspondent pas à ce que j'attendais »

Les PV ne sont pas écrits dans le code : ils sont recalculés à partir de la race,
de la classe et des formules vanilla (`src/config/classicData.ts`). Le palier à
20 points d'endurance explique les écarts — au-delà de 20, chaque point vaut
10 PV au lieu de 1. Voir [classic-stats.md](./classic-stats.md).

### Une combinaison race/classe lève une erreur

`getAttributes` ne connaît que les combinaisons présentes dans
`RACE_CLASS_ATTRIBUTES_LEVEL_1`. Ajouter la ligne correspondante depuis la table
`player_levelstats` de la base vanilla plutôt que d'improviser des attributs.

### Un test de durée échoue d'un pas

`advance(state, ms)` arrondit `ms / 100` : utiliser des multiples de 100 ms.
Attention aussi aux effets de bord de seuil — un événement planifié à 2000 ms
survient pendant le pas qui **atteint** 2000 ms.

## Build

### `npm run build` échoue sur `tsc --noEmit`

Le script enchaîne typecheck puis build : corriger les erreurs TypeScript
d'abord. `tsconfig.json` active `strict`, `noUnusedLocals` et
`noUnusedParameters` — un import inutilisé suffit à faire échouer le build.

### `Property 'at' does not exist on type`

`lib` doit contenir `ES2022` dans `tsconfig.json`.

## Conteneur

### Le build Docker échoue à l'étape `npm ci`

`package-lock.json` doit être commité et synchronisé avec `package.json`.
Relancer `npm install` localement et committer le lock modifié.

### Le build Docker échoue à l'étape de test

C'est volontaire : l'image ne se construit pas si la suite échoue. Reproduire
avec `npm test` en local.

### `403 Forbidden` ou `Permission denied` au démarrage de Nginx

L'image `nginx-unprivileged` tourne en uid 101. Vérifier que les fichiers copiés
le sont avec `--chown=101:101` (c'est le cas dans le `Dockerfile` fourni).

### `nginx: [emerg] ... Read-only file system`

Un chemin inscriptible manque. Monter `/tmp`, `/var/cache/nginx` et `/var/run`
en `emptyDir` (voir `k8s/deployment.yaml`).

## Kubernetes

### Le pod reste en `CrashLoopBackOff`

```bash
kubectl logs deployment/healing-simulator
kubectl describe pod -l app.kubernetes.io/name=healing-simulator
```

Causes fréquentes : image absente du registre du cluster, volumes inscriptibles
manquants, `runAsUser` incompatible avec une PodSecurityPolicy locale.

### La `startupProbe` échoue

```bash
kubectl port-forward deployment/healing-simulator 8080:8080
curl -i http://localhost:8080/health
```

Si la commande répond `200 OK` en direct, le problème vient du port de la sonde
(doit être le port nommé `http`, soit 8080) et non de l'application.

### 404 sur un rechargement d'une route profonde

Le fallback SPA est assuré par `try_files ... /index.html`. Si un Ingress
réécrit les chemins (`rewrite-target`), vérifier que la réécriture ne casse pas
la résolution des assets sous `/assets/`.

### Les assets ne se mettent pas à jour après un déploiement

Les noms de fichiers sont hashés par Vite et `index.html` est servi en
`no-store` : un rechargement suffit. Si un cache intermédiaire (CDN d'entreprise,
proxy) conserve `index.html`, purger ce cache — l'application elle-même n'en
utilise aucun.

## Gameplay

### « La partie se termine trop vite »

Sans aucun soin, le wipe survient autour de 22 s (le tank a 90 PV et encaisse
8 dégâts toutes les 2 s). Avec un jeu correct, la survie
dépasse largement la minute ; la rampe ×1,15 toutes les 30 s finit
mathématiquement par dépasser le débit de soin — c'est le principe du mode.

### « Le sort ne part pas »

Le message affiché sous le groupe donne toujours le motif exact : `GCD actif`,
`Cast déjà en cours`, `Niveau insuffisant`, `Mana insuffisante`, `Cible requise`,
`Cible morte`, `Jeu en pause` ou `Partie terminée`.

### « Quatre boutons sur cinq sont grisés »

C'est voulu. Au niveau 1, un prêtre de WoW Classic ne connaît que Lesser Heal ;
Renew s'apprend au niveau 8, Heal au 16, Flash Heal au 20 et Prayer of Healing
au 30. Les boutons verrouillés affichent leur niveau requis. Pour jouer avec
tout le livre de sorts, monter `PLAYER_LEVEL` dans
`src/config/gameConfig.ts` — en gardant à l'esprit que les tables de stats ne
couvrent aujourd'hui que le niveau 1
(voir [classic-stats.md](./classic-stats.md#monter-de-niveau-plus-tard)).

### « La mana ne remonte pas »

La règle des cinq secondes de vanilla est appliquée : après une dépense de mana,
la régénération liée à l'esprit est totalement suspendue pendant 5 secondes.
Les paliers tombent ensuite toutes les 2 secondes, pour 18,5 points.

### Rejouer exactement la même partie

Ajouter `?seed=<valeur>` à l'URL. La seed de la partie en cours est affichée en
bas de l'écran de fin.
