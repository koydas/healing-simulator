# Stats WoW Classic — niveau 1

Toutes les valeurs de personnage, de sort et de régénération du jeu viennent de
**WoW Classic (patch 1.12)**, au **niveau 1**. Ce document dit d'où vient chaque
nombre, comment il est calculé, et — tout aussi important — **ce qui n'est pas
sourcé**.

Les données brutes vivent dans [`src/config/classicData.ts`](../src/config/classicData.ts).
Les valeurs dérivées sont calculées dans [`src/config/gameConfig.ts`](../src/config/gameConfig.ts) :
aucun PV ni coût de sort n'est écrit à la main ailleurs.

## Sources

| Donnée | Source | Nature |
| --- | --- | --- |
| PV et mana de base par classe (niveau 1) | table `player_classlevelstats` de la base vanilla [MaNGOS Zero](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_classlevelstats.sql) | serveur 1.12 |
| Attributs par race et classe (niveau 1) | table `player_levelstats`, [même base](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/player_levelstats.sql) | serveur 1.12 |
| Formule endurance → PV | `Player::GetHealthBonusFromStamina`, [mangoszero/server `StatSystem.cpp`](https://github.com/mangoszero/server/blob/master/src/game/Object/StatSystem.cpp) | code serveur |
| Formule intelligence → mana | `Player::GetManaBonusFromIntellect`, même fichier | code serveur |
| Sorts de soin du prêtre (rang 1) | [wowclassicdb](https://wowclassicdb.com/spell/2050) pour les montants, [EZDownRank](https://github.com/mrbuds/EZDownRank/blob/master/EZDownRank.lua) pour coûts / temps d'incantation / niveaux | base de données + addon |
| Créatures de niveau 1 | table `creature_template`, [même base vanilla](https://github.com/mangoszero/database/blob/master/World/Setup/FullDB/creature_template.sql) | serveur 1.12 |
| Régénération d'esprit | formule prêtre communément documentée (voir « Approximations ») | **approximation** |

## Formules

```
PV   = PV de base de la classe + bonus d'endurance
       bonus d'endurance   = min(end, 20) × 1 + max(0, end − 20) × 10

Mana = mana de base de la classe + bonus d'intelligence
       bonus d'intelligence = min(int, 20) × 1 + max(0, int − 20) × 15
```

Le palier à 20 points explique les écarts de PV importants entre personnages :
un point d'endurance au-dessus de 20 vaut dix fois un point en dessous.

Contrôle : un guerrier humain de niveau 1 a 22 en endurance, soit
`20 + (20 × 1) + (2 × 10) = 60` PV — la valeur observée en jeu. C'est le test
`tests/classicStats.test.ts` qui vérifie ce point.

### Bases par classe au niveau 1

| Classe | PV de base | Mana de base |
| --- | --- | --- |
| Guerrier | 20 | — (rage) |
| Paladin | 28 | 59 |
| Chasseur | 26 | 63 |
| Voleur | 25 | — (énergie) |
| Prêtre | 31 | 110 |
| Mage | 31 | 100 |

## Le groupe

Cinq personnages Alliance de niveau 1. Les PV ne sont pas écrits dans le code :
ils sont recalculés au démarrage à partir des attributs.

| Membre | Race / classe | End. | Int. | Esprit | PV | Mana |
| --- | --- | --- | --- | --- | --- | --- |
| Thorgrim (tank) | Nain guerrier | 25 | 19 | 19 | **90** | — |
| Elowen (soigneur) | Humain prêtre | 20 | 22 | 24 | **51** | **160** |
| Kaelan (DPS) | Humain voleur | 21 | 20 | 20 | **55** | — |
| Fizzwick (DPS) | Gnome mage | 19 | 26 | 22 | **50** | 210 |
| Sylandra (DPS) | Elfe de la nuit chasseur | 20 | 20 | 21 | **46** | 83 |

Seule la mana du prêtre est simulée : c'est la ressource du joueur.

Le tank a 1,96 fois les PV du chasseur — la règle « le tank a deux fois les PV
des autres » de la spécification initiale n'est plus imposée, elle **émerge**
du choix nain guerrier (endurance 25, la plus haute du jeu au niveau 1).

## Mana et régénération

| Valeur | Niveau 1 | Origine |
| --- | --- | --- |
| Pool du prêtre | 160 | 110 (base prêtre) + 50 (intelligence 22) |
| Palier de régénération | toutes les 2 s | vanilla |
| Mana par palier | 18,5 | esprit 24 → `24 / 4 + 12,5` |
| Règle des cinq secondes | 5 s | vanilla |

En vanilla, la régénération liée à l'esprit est **totalement suspendue pendant
les 5 secondes qui suivent une dépense de mana** (sans le talent Méditation).
Un prêtre qui enchaîne les sorts ne régénère donc rien du tout : la fenêtre de
respiration fait partie du jeu.

Conséquence chiffrée au niveau 1 : 160 de mana = 5 Lesser Heal d'affilée, puis
il faut arrêter de lancer pendant 5 s pour redémarrer les paliers, à raison de
9,25 mana par seconde. Le débit de soin *soutenable* tourne autour de 15 PV/s,
alors que le débit *instantané* atteint 34 PV/s.

## Sorts du prêtre (rang 1)

| Sort | Niveau | Mana | Incantation | Effet | ID |
| --- | --- | --- | --- | --- | --- |
| Lesser Heal | **1** | 30 | 1,5 s | 46 – 56 | 2050 |
| Renew | 8 | 30 | instantané | 45 sur 15 s (5 ticks de 9, toutes les 3 s) | 139 |
| Heal | 16 | 155 | 3,0 s | 295 – 341 | 2054 |
| Flash Heal | 20 | 125 | 1,5 s | 193 – 237 | 2061 |
| Prayer of Healing | 30 | 410 | 3,0 s | 312 – 333 sur le groupe | 596 |

Le soin est **tiré uniformément dans la fourchette** du sort, comme en jeu — il
n'y a plus de « base ± 10 % ».

**Au niveau 1, un prêtre ne connaît que Lesser Heal.** Les quatre autres sorts
sont affichés verrouillés, avec leur niveau d'apprentissage. Voir
[ADR-0008](./adr/0008-classic-spellbook-level-gating.md) pour la discussion.

Remarque d'échelle : Prayer of Healing coûte 410 de mana, soit 2,5 fois le pool
d'un prêtre niveau 1. Ce n'est pas une incohérence — c'est un sort de niveau 30,
lancé avec un pool bien plus grand.

## Le boss

Le boss est de niveau 1 lui aussi. Relevé sur les 597 créatures de niveau 1
« réelles » de `creature_template` (déclencheurs et formes de métamorphose
exclus) :

| Mesure | Valeur |
| --- | --- |
| Dégâts de mêlée, médiane | 2 |
| Dégâts de mêlée, troisième quartile | 9 – 10 |
| PV, médiane | 64 |
| Vitesse d'attaque | 2000 ms (identique pour toutes) |

Facteur élite mesuré sur la même base, en comparant rang 0 et rang 1 à niveau
égal :

| Niveau | Dégâts normaux → élite | PV normaux → élite |
| --- | --- | --- |
| 20 | 27,5 → 34 (×1,24) | ×1,58 |
| 30 | 47,5 → 147,5 (×3,11) | ×1,79 |
| 40 | 69,5 → 227,5 (×3,27) | ×2,07 |
| 60 | 188 → 544,5 (×2,90) | ×3,11 |

Aucune créature de niveau 1 n'est un vrai boss dans le jeu (les entrées de
rang 3 au niveau 1 sont des formes de métamorphose). Le profil du boss est donc
**construit** à partir de ces mesures — voir la section suivante.

## Sourcé, dérivé, ou conçu

C'est la section à lire avant de citer un chiffre de ce projet.

### Sourcé — valeur exacte de Classic

- PV et mana de base par classe, attributs par race/classe ;
- formules endurance → PV et intelligence → mana ;
- coût, temps d'incantation, niveau requis et montant de soin des cinq sorts ;
- global cooldown de 1,5 s ;
- palier de régénération de 2 s et règle des cinq secondes ;
- vitesse d'attaque des créatures de niveau 1 (2000 ms).

### Dérivé — calculé à partir des sources

- les PV et la mana de chaque membre du groupe ;
- le soin par tick de Renew (45 / 5 ticks = 9) ;
- la mana par palier du prêtre (à partir de son esprit).

### Approximé — signalé comme tel

- **Le coefficient de régénération d'esprit.** La vraie valeur vit dans le DBC
  `gtRegenMPPerSpt`, qui dépend de la classe *et* du niveau et n'est pas
  publiquement exploitable. On applique la formule prêtre communément
  documentée (`esprit / 4 + 12,5` par palier de 2 s), qui décrit le niveau 60.
  Au niveau 1, la valeur réelle est probablement un peu plus basse.

### Conçu — game design, pas Classic

- **Dégâts de mêlée du boss : 8 par coup.** Encadré par les mesures (médiane 2
  × facteur élite 3 = 6 ; haut de distribution 10 × 1,2 = 12), mais choisi.
- **AoE : 6 par membre toutes les 12 s** et **spike : 18 sur un non-tank toutes
  les 6 à 10 s.** Aucune créature de niveau 1 n'a ces capacités ; les montants
  sont calibrés sur les PV de niveau 1 (un spike retire environ un tiers des PV
  d'un DPS).
- **Rampe ×1,15 toutes les 30 s.** Mécanique du mode de jeu.
- **Conditions de wipe** (mort du tank ou trois morts).
- **Composition du groupe** et noms des personnages.

## Équilibre obtenu

Vérifié en simulant un soigneur automatique qui enchaîne Lesser Heal sur le
membre le plus bas en PV (huit seeds) :

| Scénario | Survie |
| --- | --- |
| Aucun soin | 22 s |
| Soigneur automatique naïf | 48 s à 97 s |

La pression initiale est d'environ 8,8 PV/s (mêlée 4,0 + AoE 2,5 + spike 2,2)
contre 15 PV/s soutenables : la partie est tenable au départ, puis la rampe
finit par dépasser le débit du soigneur. Avec un seul sort disponible, la
difficulté vient surtout du **triage** — un Lesser Heal toutes les 1,5 s ne peut
pas suivre deux cibles basses en même temps.

## Monter de niveau plus tard

Le niveau est un champ du `GameState` (`playerLevel`) et une constante de
configuration (`PLAYER_LEVEL`). Aujourd'hui il vaut 1 partout.

Pour ouvrir d'autres niveaux, il faut :

1. étendre `CLASS_BASE_LEVEL_1` et `RACE_CLASS_ATTRIBUTES_LEVEL_1` en tables
   indexées par niveau (les deux fichiers SQL sources contiennent tous les
   niveaux jusqu'à 60) ;
2. ajouter les rangs supérieurs des sorts dans `PRIEST_HEALS_RANK_1` ;
3. faire varier `PLAYER_LEVEL` — le verrouillage des sorts suit déjà tout seul.

Rien d'autre dans le moteur ne dépend du niveau : la simulation ne connaît que
des PV, de la mana et des montants.

## Références

- [ADR-0007](./adr/0007-classic-derived-stats.md) — stats dérivées des tables Classic
- [ADR-0008](./adr/0008-classic-spellbook-level-gating.md) — sorts réels et verrouillage par niveau
- [ADR-0009](./adr/0009-vanilla-mana-regen-five-second-rule.md) — régénération vanilla
- [ADR-0010](./adr/0010-level-1-boss-profile.md) — profil du boss de niveau 1
- [balance.md](./balance.md) — récapitulatif des constantes
