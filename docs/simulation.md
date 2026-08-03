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
`gcdRemainingMs` et `msSinceLastCastStart` (le compteur de la règle des cinq
secondes).

## Déterminisme

L'état du générateur pseudo-aléatoire (`state.seed`) fait partie du `GameState`.
Le hasard n'est consommé qu'à trois endroits, toujours dans le même ordre :

| Ordre dans le pas | Usage |
| --- | --- |
| complétion d'un soin | tirage dans la fourchette du sort, ex. 46 – 56 (`rollHealAmount`) |
| spike, d'abord | choix de la cible parmi les non-tanks vivants |
| spike, ensuite | intervalle du prochain spike, uniforme dans [6 s, 10 s) |

Un tirage supplémentaire a lieu une seule fois dans `createInitialState`, pour
planifier le **premier** spike.

Conséquence : *même seed + même séquence d'actions ⇒ même partie*, quel que soit
le découpage temporel. C'est vérifié par `tests/determinism.test.ts`.

## Timeline de dégâts

| Événement | Montant | Intervalle | Premier impact |
| --- | --- | --- | --- |
| Mêlée sur le tank | 8 | 2 s (cadence vanilla) | 2 s |
| AoE | 6 par membre vivant | 12 s | 12 s |
| Spike | 18 sur un non-tank vivant | uniforme [6 s, 10 s) | tiré à la création |

Ces montants sont à l'échelle du niveau 1 (le tank a 90 PV). Leur origine —
mesurée ou conçue — est détaillée dans [classic-stats.md](./classic-stats.md).

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
| 5 | sort non appris à ce niveau | `Niveau insuffisant` |
| 6 | aucune cible (sorts ciblés) | `Cible requise` |
| 7 | cible morte | `Cible morte` |
| 8 | mana insuffisante | `Mana insuffisante` |

Un refus ne dépense **aucune** mana et ne déclenche **aucun** GCD ; il produit
seulement un message.

Un lancement accepté dépense la mana immédiatement, déclenche un GCD de 1,5 s et
remet `msSinceLastCastStart` à zéro. Les sorts instantanés (Renew) appliquent
leur effet sur-le-champ et comptent à la fois comme *commencé* et *complété*.

Un cast est annulé dans trois cas seulement : bouton `Cancel`, mort de sa cible,
fin de partie. Une annulation conserve la mana et le GCD, n'applique aucun soin
et incrémente `castsCancelled`.

## Mana — modèle vanilla

- pool : 160 pour un prêtre humain de niveau 1, plein au départ ;
- la régénération tombe **par paliers de 2 s** (`timers.manaTickMs`), pas en
  continu ;
- un palier ne crédite la mana que si `msSinceLastCastStart >= 5000` :
  c'est la **règle des cinq secondes**, qui suspend totalement la régénération
  après chaque dépense ;
- montant par palier : 18,5 (esprit 24) ;
- la mana est bornée à `[0, manaMax]`.

Voir [ADR-0009](./adr/0009-vanilla-mana-regen-five-second-rule.md).

## Niveau et disponibilité des sorts

Le `GameState` porte `playerLevel` (1 par défaut). Un sort dont
`requiredLevel > playerLevel` est refusé avec le motif `level`. Au niveau 1,
seul Lesser Heal est disponible ; les autres boutons sont visibles mais
verrouillés. Voir [ADR-0008](./adr/0008-classic-spellbook-level-gating.md).

## Renew

- 5 ticks de 9 (45 au total), espacés de **3 s**, **aucun tick immédiat** ;
- ne stacke jamais : réappliquer remplace l'effet, remet les ticks à 5 et le
  délai à 3 s ;
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
| aucun sort lancé sous son niveau requis | `checkCast` (motif `level`) |
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
