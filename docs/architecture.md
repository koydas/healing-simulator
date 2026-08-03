# Architecture

## Couches

```
┌───────────────────────────────────────────────────────────────┐
│ components/  — rendu, entrées tactiles                        │  React
│ hooks/       — useGameLoop (rAF), useGameStore (abonnements)  │
├───────────────────────────────────────────────────────────────┤
│ store/gameStore.ts — source de vérité mutable + snapshots     │  Pont
├───────────────────────────────────────────────────────────────┤
│ simulation/  — moteur pur : stepSimulation, actions, effets   │  Moteur
│ config/gameConfig    — constantes de balance (dérivées)       │
│ config/classicData   — données WoW Classic 1.12 + formules    │  Données
└───────────────────────────────────────────────────────────────┘
```

La dépendance est **strictement descendante** : `simulation/` n'importe jamais
`store/`, `hooks/` ou `components/`. Le moteur est donc utilisable — et testé —
sans React ni DOM.

`classicData.ts` est la couche la plus basse : elle ne dépend de rien et ne
contient que des valeurs sourcées et les formules officielles du jeu.
`gameConfig.ts` en dérive toutes les constantes de balance
(voir [classic-stats.md](./classic-stats.md)).

## Modules du moteur

| Fichier | Rôle |
| --- | --- |
| `types.ts` | formes de données du `GameState` (aucune logique) |
| `random.ts` | générateur mulberry32 pur : `nextRandom`, `nextRange`, `nextInt` |
| `initialState.ts` | `createInitialState(seed)` et `cloneState` |
| `effects.ts` | application des soins, dégâts, HoT et effets de sorts |
| `feedback.ts` | ajout et purge des feedbacks de combat |
| `simulation.ts` | `stepSimulation(state, dtMs)` — un pas de simulation |
| `actions.ts` | actions joueur pures : cast, cible, annulation, pause, relance |
| `selectors.ts` | lectures dérivées : ratios, progression, statistiques finales |

## Flux d'une frame

```
requestAnimationFrame(t)
  └─ useGameLoop : delta = t - tPrécédent
       ├─ delta > 1000 ms  → jeté (pas de rattrapage)
       ├─ accumulateur += delta, plafonné à 500 ms
       ├─ tant que accumulateur ≥ 100 ms :
       │     store.advance(100) → stepSimulation → nouveau GameState
       │        └─ recalcul des snapshots ; notification SI un snapshot a changé
       └─ store.emitFrame() → callbacks « frame » (barres mana / cast / GCD)
```

## Stratégie de rendu

Le point sensible est la contrainte « pas de rendu complet toutes les 100 ms ».
Trois mécanismes s'y emploient :

1. **Source de vérité hors React.** Le `GameState` vit dans le store, détenu par
   un `useRef` dans `App`. `App` ne se re-rend jamais pendant une partie.
2. **Snapshots mémoïsés par composant.** Après chaque pas, le store reconstruit
   des projections légères (`MemberSnapshot`, `HeaderSnapshot`,
   `ControlsSnapshot`, messages, résumé). Si le contenu est inchangé, la
   **référence précédente est conservée**. Les composants s'abonnent via
   `useSyncExternalStore` : React compare la référence et ne re-rend que ce qui
   a réellement changé. Une frame de groupe ne se re-rend donc que lorsque ses
   HP, son état de vie, son Renew, sa sélection ou son feedback changent.
3. **Valeurs continues hors React.** La mana, la progression du cast et celle du
   GCD changent à chaque pas : elles sont écrites directement dans des
   **variables CSS** (`--mana-fill`, `--cast-progress`, `--gcd-progress`) et un
   `textContent` via refs DOM, dans les callbacks `onFrame`. Aucun rendu React
   n'est déclenché.

`React.memo` est appliqué à tous les composants abonnés (`PartyFrame`,
`PartyList`, `SpellButton`, `CastBar`, `ManaBar`, `Header`, `Controls`,
`GameOver`, `MessageFeed`), et les callbacks passés en props sont stabilisés par
`useCallback`.

## Nettoyage

- `useGameLoop` annule son `requestAnimationFrame` et retire son listener
  `visibilitychange` au démontage.
- `useFrame` renvoie la fonction de désabonnement du store depuis son `useEffect`.
- Les feedbacks expirés sont purgés à chaque pas et la liste est plafonnée à
  `FEEDBACK.maxEntries` : aucune accumulation mémoire possible.

## Ce que l'application ne fait pas

- aucun appel réseau, aucun asset distant, aucun CDN ;
- aucune persistance (`localStorage`, `sessionStorage`, cookies, IndexedDB) ;
- aucun timer réel (`setInterval` / `setTimeout`) dans la logique métier.
