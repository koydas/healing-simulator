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
| `tests/helpers.ts` | utilitaires : `advance`, `patchMember`, `patchState`, `isolateTimers`, `unlockAllSpells` |
| `tests/classicStats.test.ts` | formules vanilla, PV et mana du groupe, valeurs des sorts de rang 1 |
| `tests/random.test.ts` | pureté du PRNG, bornes de `nextRange` / `nextInt`, normalisation de seed |
| `tests/determinism.test.ts` | rejouabilité seed + actions, non-mutation, découpage temporel |
| `tests/damage.test.ts` | dégâts tank, AoE, sélection et replanification des spikes, rampe |
| `tests/spells.test.ts` | disponibilité par niveau, coût, GCD, refus, résolution des casts, Renew, annulation, règle des cinq secondes |
| `tests/healing.test.ts` | soin effectif vs overheal, clamp `hpMax`, cibles mortes, HPS / efficacité |
| `tests/wipe.test.ts` | conditions de wipe, gel après wipe, pause, invariants sur partie complète |
| `tests/selectors.test.ts` | ratios, progressions cast / GCD, feedbacks, formatage de durée |

## Techniques utilisées

- **`isolateTimers(state)`** repousse la timeline (tank / AoE / spike) très loin
  pour observer un comportement isolé — par exemple le soin d'un sort sans que
  des dégâts viennent brouiller les HP.
- **`patchState` / `patchMember`** fabriquent une situation précise (membre à
  10 PV, timer à 100 ms, `elapsedMs` à 29 900 ms) sans avoir à jouer des minutes
  de simulation. C'est possible parce que le `GameState` est une simple
  structure de données.
- **`unlockAllSpells(state)`** monte `playerLevel` à 60 et fournit la mana
  nécessaire : c'est ainsi qu'on teste Renew, Heal, Flash Heal et Prayer of
  Healing alors que la partie se joue au niveau 1.
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
  pendant la pause ;
- s'y ajoutent, depuis le passage aux stats Classic : les formules
  endurance → PV et intelligence → mana, les PV dérivés du groupe, la
  disponibilité des sorts selon le niveau, et la règle des cinq secondes.

## Valeurs de référence

Les tests s'appuient sur les stats de niveau 1 : tank 90 PV, soigneur 51 PV et
160 de mana, DPS 55 / 50 / 46 PV ; mêlée 8, AoE 6, spike 18. Les timings sont
lus depuis la configuration (`TANK_DAMAGE.intervalMs`, `MANA.tickMs`, …) plutôt
qu'écrits en littéral — un changement de balance ne casse donc que les
assertions de valeur, pas celles de cadence.

## Vérification manuelle du rendu

La couche React n'est pas couverte par des tests automatisés. Pour la vérifier :

```bash
npm run build && npm run preview
```

Points à contrôler : sélection d'une frame, refus affiché lors d'un clic sur un
sort indisponible, barre de cast et bouton `Cancel`, progression du GCD sur les
quatre boutons, écran de fin puis « Nouvelle partie ».
