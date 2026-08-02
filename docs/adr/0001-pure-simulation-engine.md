# ADR-0001: Moteur de simulation pur, isolé de React

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

Le jeu est une simulation temps réel : dégâts périodiques, HoT, casts,
régénération, morts, wipe. Mélanger cette logique avec des `useState` et des
`useEffect` rend le comportement dépendant de l'ordre de rendu de React, très
difficile à tester, et impossible à rejouer à l'identique.

## Decision

Toute la logique de jeu vit sous `src/simulation/` et n'importe **rien** de
React, du DOM ou de l'horloge réelle. La fonction centrale est :

```ts
stepSimulation(state: GameState, dtMs: number): GameState
```

Elle clone l'état d'entrée (`cloneState`), travaille sur ce brouillon et renvoie
un nouvel état. Les actions du joueur (`castSpell`, `selectTarget`,
`cancelCast`, `togglePause`) suivent la même signature `(state, payload) => state`.

Le `GameState` est une structure de données sérialisable : party, mana, timers,
seed, feedbacks, statistiques.

Interdits sous `src/simulation/` : `Date.now()`, `performance.now()`,
`Math.random()`, `setTimeout`, accès DOM, imports React.

## Alternatives Considered

- **Logique dans les composants React** — rejeté : non testable sans DOM,
  non déterministe, et le moindre re-rendu risque de dupliquer des effets.
- **Classe `Game` mutable** — rejeté : plus simple à écrire, mais on perd la
  comparaison d'états (« l'état est-il identique après une pause ? ») et les
  tests doivent reconstruire l'objet à chaque scénario.
- **Bibliothèque ECS externe** — rejeté : dépendance de moteur de jeu interdite
  par le cahier des charges, et surdimensionnée pour 5 entités.

## Consequences

- ✅ Le moteur est testable sans DOM ni mock de temps : `tests/` tourne en
  environnement `node`.
- ✅ Un état peut être fabriqué de toutes pièces dans un test (`patchState`),
  ce qui évite de simuler des minutes de jeu pour atteindre une situation.
- ✅ Comparer deux états suffit à prouver l'absence de progression (pause,
  wipe) : `expect(after).toBe(before)`.
- ⚠️ Chaque pas alloue un clone de l'état. À 10 pas/s pour 5 membres, le coût
  est négligeable, mais ce ne serait pas le cas pour un raid de 40 joueurs.
- ⚠️ Les développeurs doivent penser « immuable » : muter `state.party[0].hp`
  directement dans un composant casserait le contrat silencieusement.
