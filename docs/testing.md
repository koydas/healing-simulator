# Tests

```bash
npm test          # exécution unique
npm run test:watch
```

Runner : **Vitest**, environnement `node` (`vite.config.ts` → `test.environment`).
Les tests portent exclusivement sur le **moteur pur** : aucun DOM, aucun rendu
React, aucun mock de temps n'est nécessaire — `stepSimulation` prend le delta en
paramètre.

## Organisation

| Fichier | Couverture |
| --- | --- |
| `tests/helpers.ts` | utilitaires : `advance`, `patchMember`, `patchState`, `isolateTimers` |
| `tests/random.test.ts` | pureté du PRNG, bornes de `nextRange` / `nextInt`, normalisation de seed |
| `tests/determinism.test.ts` | rejouabilité seed + actions, non-mutation, découpage temporel |
| `tests/damage.test.ts` | dégâts tank, AoE, sélection et replanification des spikes, rampe |
| `tests/spells.test.ts` | coût, GCD, refus, résolution des casts, Renew, annulation, régénération |
| `tests/healing.test.ts` | soin effectif vs overheal, clamp `hpMax`, cibles mortes, HPS / efficacité |
| `tests/wipe.test.ts` | conditions de wipe, gel après wipe, pause, invariants sur partie complète |
| `tests/selectors.test.ts` | ratios, progressions cast / GCD, feedbacks, formatage de durée |

## Techniques utilisées

- **`isolateTimers(state)`** repousse la timeline (tank / AoE / spike) très loin
  pour observer un comportement isolé — par exemple le soin d'un sort sans que
  des dégâts viennent brouiller les HP.
- **`patchState` / `patchMember`** fabriquent une situation précise (membre à
  100 HP, timer à 100 ms, `elapsedMs` à 29 900 ms) sans avoir à jouer des
  minutes de simulation. C'est possible parce que le `GameState` est une simple
  structure de données.
- **`advance(state, ms)`** découpe en pas de `TICK_MS` : attention, les durées
  passées doivent être des multiples de 100 ms (sinon elles sont arrondies).

## Exigences

- toute nouvelle fonction exportée du moteur est testée sur **ses branches
  d'échec**, pas seulement sur son cas nominal ;
- ne jamais réduire le nombre de tests d'un fichier existant ;
- les tests de la liste ci-dessous sont obligatoires (demande initiale) et
  doivent le rester : déterminisme, dégâts tank, AoE, sélection des spikes,
  rampe, application et renouvellement de Renew, interruption de cast, dépense
  de mana, calcul de l'overheal, conditions de wipe, absence de progression
  pendant la pause.

## Vérification manuelle du rendu

La couche React n'est pas couverte par des tests automatisés. Pour la vérifier :

```bash
npm run build && npm run preview
```

Points à contrôler : sélection d'une frame, refus affiché lors d'un clic sur un
sort indisponible, barre de cast et bouton `Cancel`, progression du GCD sur les
quatre boutons, écran de fin puis « Nouvelle partie ».
