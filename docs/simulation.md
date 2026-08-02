# Moteur de simulation

## Contrat

```ts
stepSimulation(state: GameState, dtMs: number): GameState
```

- **Pure** : l'état d'entrée n'est jamais muté ; un nouvel état est renvoyé.
  Le moteur travaille sur un clone profond (`cloneState`).
- **Sans horloge** : aucun `Date.now()`, `performance.now()`, `Math.random()`,
  accès DOM ni API React sous `src/simulation/`. L'horloge réelle n'est lue que
  dans `src/hooks/useGameLoop.ts`.
- **Pas fixe** : la boucle appelle toujours `stepSimulation(state, 100)`.
  Tous les intervalles de la timeline sont des multiples de 100 ms, la
  résolution est donc exacte.
- **Inerte hors partie active** : si `status !== 'active'`, la fonction renvoie
  **la même référence** d'état. Pause et wipe gèlent donc complètement le jeu.

## Ordre de résolution

Quand plusieurs événements tombent au même instant, ils sont résolus dans cet
ordre — c'est la partie du contrat qui rend le jeu prévisible :

1. complétion des casts ;
2. ticks de HoT ;
3. régénération de mana ;
4. dégâts tank ;
5. dégâts AoE ;
6. spike ;
7. résolution des morts ;
8. vérification du wipe.

La purge des feedbacks expirés a lieu après l'étape 8.

Avant l'étape 1, le pas met à jour : `elapsedMs`, `damageMultiplier`,
`gcdRemainingMs` et `msSinceLastCastStart`.

## Déterminisme

L'état du générateur pseudo-aléatoire (`state.seed`) fait partie du `GameState`.
Le hasard n'est consommé qu'à trois endroits, toujours dans le même ordre :

| Ordre dans le pas | Usage |
| --- | --- |
| complétion d'un soin direct | variation ±10 % (`rollHealAmount`) |
| spike, d'abord | choix de la cible parmi les non-tanks vivants |
| spike, ensuite | intervalle du prochain spike, uniforme dans [6 s, 10 s) |

Un tirage supplémentaire a lieu une seule fois dans `createInitialState`, pour
planifier le **premier** spike.

Conséquence : *même seed + même séquence d'actions ⇒ même partie*, quel que soit
le découpage temporel. C'est vérifié par `tests/determinism.test.ts`.

## Timeline de dégâts

| Événement | Montant | Intervalle | Premier impact |
| --- | --- | --- | --- |
| Dégâts tank | 400 | 1,5 s | 1,5 s |
| AoE | 500 par membre vivant | 12 s | 12 s |
| Spike | 1200 sur un non-tank vivant | uniforme [6 s, 10 s) | tiré à la création |

La rampe multiplie **cumulativement** tous les dégâts par 1,15 toutes les 30 s :

```
multiplicateur = 1.15 ^ floor(elapsedMs / 30000)

0 – 29,999 s   ×1,0000
30 – 59,999 s  ×1,1500
60 – 89,999 s  ×1,3225
```

Le montant final est arrondi à l'entier le plus proche (`Math.round`) puis
appliqué. Un spike qui ne trouve aucune cible valide n'inflige rien mais
replanifie quand même le suivant.

## Règles de cast

`checkCast(state, spellId)` refuse dans cet ordre — le premier motif rencontré
est celui affiché :

| Ordre | Motif | Message |
| --- | --- | --- |
| 1 | partie terminée | `Partie terminée` |
| 2 | partie en pause | `Jeu en pause` |
| 3 | cast déjà en cours | `Cast déjà en cours` |
| 4 | GCD actif | `GCD actif` |
| 5 | aucune cible (sorts ciblés) | `Cible requise` |
| 6 | cible morte | `Cible morte` |
| 7 | mana insuffisante | `Mana insuffisante` |

Un refus ne dépense **aucune** mana et ne déclenche **aucun** GCD ; il produit
seulement un message.

Un lancement accepté dépense la mana immédiatement, déclenche un GCD de 1,5 s et
remet `msSinceLastCastStart` à zéro. Les sorts instantanés (Renew) appliquent
leur effet sur-le-champ et comptent à la fois comme *commencé* et *complété*.

Un cast est annulé dans trois cas seulement : bouton `Cancel`, mort de sa cible,
fin de partie. Une annulation conserve la mana et le GCD, n'applique aucun soin
et incrémente `castsCancelled`.

## Mana

- pool : 10 000, plein au départ ;
- régénération normale : 100/s ;
- régénération améliorée : 200/s, active quand **aucun cast n'est en cours** et
  que `msSinceLastCastStart >= 2000` ;
- le pas qui atteint exactement 2000 ms bénéficie déjà du bonus ;
- la mana est bornée à `[0, manaMax]`.

## Renew

- 5 ticks de 150, espacés de 2 s, **aucun tick immédiat** ;
- ne stacke jamais : réappliquer remplace l'effet, remet les ticks à 5 et le
  délai à 2 s ;
- disparaît à la mort du porteur.

## Fin de partie

Le wipe survient quand le tank meurt **ou** quand trois membres sont morts. À ce
moment le moteur passe `status` à `over` et annule le cast en cours. Aucun
événement ne peut plus se produire : `stepSimulation` renvoie l'état inchangé.

## Invariants garantis

| Invariant | Où il est tenu |
| --- | --- |
| `0 <= hp <= hpMax` | `applyHealTo` / `applyDamageTo` (clamps) |
| `0 <= mana <= manaMax` | `regenerateMana`, `castSpell` |
| aucun soin sur une cible morte | `applyHealTo`, `applySpellEffect` |
| aucune dépense si le lancement est refusé | `castSpell` (branche de refus) |
| aucun remboursement après interruption | `cancelActiveCast` |
| Renew ne stacke jamais | `applyHot` (remplacement par `spellId`) |
| aucune progression pendant la pause | garde d'entrée de `stepSimulation` |
| même seed + mêmes actions = même partie | seed dans le state |
| aucun timer réel dans la logique métier | aucune API temps dans `simulation/` |
| aucun événement après le wipe | garde d'entrée de `stepSimulation` |
| aucune fuite mémoire des feedbacks | `pruneFeedback` + plafond `maxEntries` |

## Statistiques

`GameStats` accumule : soin brut, soin effectif, overheal, mana dépensée, dégâts
encaissés (HP réellement perdus), casts commencés et complétés par sort, casts
annulés, morts (identifiants, dans l'ordre).

`computeStatsSummary` en dérive :

```
HPS            = soin effectif / durée en secondes
Overheal %     = overheal / soin brut × 100
Efficacité     = soin effectif / mana dépensée
```

Les trois valeurs valent 0 quand leur dénominateur est nul.
