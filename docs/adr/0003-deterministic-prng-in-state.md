# ADR-0003: Générateur pseudo-aléatoire déterministe transporté dans le state

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

Trois mécaniques ont besoin de hasard : le choix de la cible d'un spike, la
variation ±10 % des soins directs, et l'intervalle avant le prochain spike.
`Math.random()` rendrait chaque partie unique mais aussi impossible à rejouer,
à déboguer et à tester — impossible d'écrire « ce spike doit toucher un
non-tank » sans dépendre de la chance.

## Decision

Un générateur **mulberry32** pur est implémenté dans `src/simulation/random.ts` :

```ts
nextRandom(seed: number): { value: number; seed: number }
```

L'état du générateur est un simple entier stocké dans `state.seed` et remplacé à
chaque tirage. Aucune fonction ne conserve d'état caché.

L'ordre de consommation est fixé et documenté :

1. variation d'un soin direct, au moment où le cast se termine ;
2. choix de la cible du spike ;
3. intervalle du prochain spike.

`createInitialState(seed)` effectue un seul tirage, pour planifier le premier
spike, et conserve la seed d'origine dans `initialSeed` (affichée à l'écran de
fin, utilisable via `?seed=`).

## Alternatives Considered

- **`Math.random()`** — rejeté : aucune reproductibilité, tests fragiles.
- **Objet PRNG mutable (`rng.next()`)** — rejeté : le clonage d'état ne
  capturerait plus la position du générateur ; deux états « identiques »
  divergeraient au tirage suivant.
- **Mersenne Twister / bibliothèque externe** — rejeté : dépendance inutile pour
  la qualité statistique requise ; mulberry32 tient en dix lignes et passe
  largement les besoins d'un jeu.

## Consequences

- ✅ Rejouabilité totale : `?seed=1337` produit toujours la même partie à
  actions égales.
- ✅ Les tests peuvent balayer 40 seeds et vérifier une propriété (« le spike ne
  cible jamais le tank », « l'intervalle reste dans [6 s, 10 s) »).
- ✅ Le clone d'état capture le hasard : pause, reprise et comparaison d'états
  restent exacts.
- ⚠️ Ajouter un nouvel usage du hasard **change la séquence** de tous les
  tirages suivants : les parties enregistrées avec une seed donnée ne sont
  comparables qu'à version de moteur constante.
- ⚠️ La seed étant visible et modifiable, un joueur peut rechercher une seed
  favorable. Sans classement en ligne, c'est sans conséquence.
