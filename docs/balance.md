# Balance

Deux fichiers, deux rôles :

- **`src/config/classicData.ts`** — données brutes de WoW Classic 1.12 et
  formules officielles. On n'y écrit que du sourcé (voir
  [classic-stats.md](./classic-stats.md)).
- **`src/config/gameConfig.ts`** — constantes du jeu. Les stats de personnage y
  sont *calculées* à partir du fichier précédent ; seul le profil du boss et la
  cadence des événements y sont posés à la main.

Aucune autre couche ne contient de nombre de gameplay.

## Boucle

| Constante | Valeur | Rôle |
| --- | --- | --- |
| `TICK_MS` | 100 | pas de simulation fixe |
| `MAX_CATCHUP_MS` | 500 | rattrapage maximum par frame (5 pas) |
| `LONG_STALL_MS` | 1000 | au-delà, le temps écoulé est jeté |
| `DEFAULT_SEED` | 1337 | seed utilisée si `?seed=` est invalide |
| `PLAYER_LEVEL` | 1 | niveau du groupe et du boss |

## Groupe — dérivé des formules vanilla

`PARTY_TEMPLATE` calcule les PV et la mana à partir de la race, de la classe et
des attributs de niveau 1. Ces valeurs ne sont écrites nulle part en dur.

| Membre | Race / classe | PV | Mana |
| --- | --- | --- | --- |
| Thorgrim (tank) | Nain guerrier | 90 | — |
| Elowen (soigneur) | Humain prêtre | 51 | 160 |
| Kaelan (DPS) | Humain voleur | 55 | — |
| Fizzwick (DPS) | Gnome mage | 50 | 210 |
| Sylandra (DPS) | Elfe de la nuit chasseur | 46 | 83 |

Changer un membre de race ou de classe suffit à recalculer ses PV : c'est
`PARTY_SLOTS` qu'on édite, jamais un nombre.

## Mana du soigneur

| Constante | Valeur | Origine |
| --- | --- | --- |
| `MANA.max` | 160 | 110 (base prêtre) + 50 (intelligence 22) |
| `MANA.tickMs` | 2000 | palier de régénération vanilla |
| `MANA.perTick` | 18,5 | esprit 24 → `24 / 4 + 12,5` |
| `MANA.fiveSecondRuleMs` | 5000 | règle des cinq secondes |
| `GCD_MS` | 1500 | global cooldown vanilla |

## Sorts — rang 1, verrouillés par niveau

| Sort | Niveau | Mana | Incantation | Effet |
| --- | --- | --- | --- | --- |
| Lesser Heal | **1** | 30 | 1,5 s | 46 – 56 |
| Renew | 8 | 30 | instantané | 9 par tick × 5, toutes les 3 s |
| Heal | 16 | 155 | 3,0 s | 295 – 341 |
| Flash Heal | 20 | 125 | 1,5 s | 193 – 237 |
| Prayer of Healing | 30 | 410 | 3,0 s | 312 – 333 au groupe |

Au niveau 1, seul Lesser Heal est lançable ; les autres apparaissent verrouillés
avec leur niveau requis (ADR-0008). Aucun cooldown individuel, aucune haste,
aucune file d'attente.

## Timeline du boss

| Constante | Valeur | Nature |
| --- | --- | --- |
| `TANK_DAMAGE` | 8 toutes les 2000 ms | montant conçu, cadence sourcée |
| `AOE_DAMAGE` | 6 par membre toutes les 12 000 ms | conçu |
| `SPIKE_DAMAGE` | 18, intervalle uniforme [6000, 10 000) ms | conçu |
| `RAMP` | ×1,15 toutes les 30 000 ms | conçu |
| `WIPE.maxDeaths` | 3 | conçu |

Justification des montants : [classic-stats.md](./classic-stats.md#le-boss) et
[ADR-0010](./adr/0010-level-1-boss-profile.md).

## Ordres de grandeur

- Pression sur le tank : 8 / 2 s = **4,0 PV/s** ; il tombe en 22 s sans soin.
- AoE : 6 × 5 / 12 s ≈ **2,5 PV/s** répartis.
- Spike : 18 toutes les 8 s en moyenne ≈ **2,2 PV/s** sur un non-tank, soit un
  tiers de ses PV d'un coup.
- Débit de soin **instantané** : 51 PV toutes les 1,5 s ≈ 34 PV/s.
- Débit de soin **soutenable** : limité par la mana à ≈ 15 PV/s (9,25 mana/s
  hors règle des cinq secondes, 1,7 PV par point de mana).
- Survie mesurée : 22 s sans aucun soin, 48 à 97 s avec un soigneur automatique
  naïf.

La rampe fait passer la pression au-dessus du soin soutenable après quelques
paliers : la défaite est inévitable, seule sa date change.

## Feedback

| Constante | Valeur |
| --- | --- |
| `FEEDBACK.lifetimeMs` | 1200 ms (nombres flottants) |
| `FEEDBACK.messageLifetimeMs` | 1600 ms (messages, morts) |
| `FEEDBACK.maxEntries` | 40 (plafond anti-fuite) |

## Régler la difficulté

Ne touchez pas aux valeurs sourcées : la marge de réglage est du côté du boss.

- **Plus facile** : baisser `TANK_DAMAGE.amount` ou `SPIKE_DAMAGE.amount`,
  allonger `RAMP.intervalMs`.
- **Plus dur** : monter `SPIKE_DAMAGE.amount`, raccourcir
  `SPIKE_DAMAGE.minIntervalMs`, ou baisser `RAMP.intervalMs`.
- **Changer d'échelle** : monter `PLAYER_LEVEL` — cela débloque des sorts, mais
  les tables de stats ne couvrent aujourd'hui que le niveau 1 (voir
  [classic-stats.md](./classic-stats.md#monter-de-niveau-plus-tard)).

Après tout changement, relancer `npm test` : plusieurs tests s'appuient sur les
valeurs nominales (90 / 51 / 55 / 50 / 46 PV, 8 / 6 / 18 dégâts).
