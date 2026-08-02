# ADR-0004: Store externe et snapshots mémoïsés pour isoler les rendus React

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

La simulation produit un nouvel état toutes les 100 ms. Placer cet état dans un
`useState` au sommet de l'application déclencherait 10 rendus complets par
seconde : cinq frames de groupe, quatre boutons de sorts, l'en-tête et les
barres seraient reconstruits en permanence, ce que le cahier des charges
interdit explicitement.

## Decision

Le `GameState` vit dans un store créé par `createGameStore(seed)` et détenu par
un `useRef` dans `App`. Le store expose deux canaux distincts :

**1. Snapshots mémoïsés + `useSyncExternalStore`.** Après chaque pas, le store
reconstruit des projections légères (`MemberSnapshot`, `HeaderSnapshot`,
`ControlsSnapshot`, messages, résumé de fin). Une comparaison superficielle
(`snapshotEqual`, avec égalité élément par élément pour les tableaux) permet de
**réutiliser la référence précédente** si le contenu est inchangé. Les
composants s'abonnent à leur propre snapshot ; React compare la référence et ne
re-rend que ce qui a réellement bougé. Le store ne notifie ses abonnés que si au
moins un snapshot a changé.

**2. Callbacks « frame » (`onFrame`).** Les valeurs qui changent à chaque pas —
mana, progression du cast, progression du GCD — sont écrites directement dans
des variables CSS (`--mana-fill`, `--cast-progress`, `--gcd-progress`) et un
`textContent`, via des refs DOM. Aucun rendu React n'est impliqué.

Tous les composants abonnés sont enveloppés dans `React.memo` et reçoivent des
callbacks stabilisés par `useCallback`.

## Alternatives Considered

- **`useState` global dans `App`** — rejeté : rendu complet à 10 Hz.
- **Redux / Zustand / Jotai** — rejeté : dépendance externe non nécessaire ;
  `useSyncExternalStore` fait exactement le travail en standard.
- **`useReducer` + Context** — rejeté : le Context propage la valeur à tous les
  consommateurs, ce qui reproduit le problème du rendu global.
- **Rendu sur `<canvas>`** — rejeté : perte de l'accessibilité et des cibles
  tactiles natives, pour un gain inutile à cette échelle.

## Consequences

- ✅ `App` ne se re-rend jamais pendant une partie ; une frame ne se re-rend que
  quand ses HP, son état de vie, son Renew, sa sélection ou son feedback
  changent.
- ✅ Les barres animées restent fluides sans coût de réconciliation.
- ✅ Aucune dépendance d'état externe : le store fait 250 lignes et reste lisible.
- ⚠️ La mémoïsation est manuelle : ajouter un champ à un snapshot sans penser à
  sa stabilité peut réintroduire des rendus inutiles.
- ⚠️ Les valeurs pilotées par `onFrame` ne sont pas visibles dans les React
  DevTools — il faut inspecter le DOM pour les déboguer.
