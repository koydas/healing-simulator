# Balance

Toutes les valeurs ci-dessous vivent dans **`src/config/gameConfig.ts`**. Aucune
autre couche ne contient de constante de gameplay : modifier la balance ne doit
jamais demander de toucher au moteur ni aux composants.

## Boucle

| Constante | Valeur | Rôle |
| --- | --- | --- |
| `TICK_MS` | 100 | pas de simulation fixe |
| `MAX_CATCHUP_MS` | 500 | rattrapage maximum par frame (5 pas) |
| `LONG_STALL_MS` | 1000 | au-delà, le temps écoulé est jeté |
| `DEFAULT_SEED` | 1337 | seed utilisée si `?seed=` est invalide |

## Groupe

| Constante | Valeur |
| --- | --- |
| `BASE_HP` | 4000 |
| `TANK_HP_MULTIPLIER` | 2 (tank : 8000 HP) |
| `PARTY_TEMPLATE` | tank, healer, dps1, dps2, dps3 |

Le healer est contrôlé par le joueur mais reste une cible de soins comme les
autres.

## Mana

| Constante | Valeur |
| --- | --- |
| `MANA.max` / `MANA.initial` | 10 000 |
| `MANA.regenPerSecond` | 100 |
| `MANA.enhancedRegenPerSecond` | 200 |
| `MANA.enhancedRegenDelayMs` | 2000 |
| `GCD_MS` | 1500 |

## Sorts (`SPELLS`)

| id | Nom | Cast | Mana | Effet | Variation |
| --- | --- | --- | --- | --- | --- |
| `renew` | Renew | instantané | 300 | HoT 150 × 5 ticks / 2 s | — |
| `flash` | Flash Heal | 1500 ms | 500 | 800 mono-cible | ±10 % |
| `greater` | Greater Heal | 2500 ms | 700 | 2000 mono-cible | ±10 % |
| `group` | Group Heal | 3000 ms | 1200 | 600 par membre vivant | — |

Aucun cooldown individuel, aucune haste, aucune file d'attente de sorts.

## Timeline

| Constante | Valeur |
| --- | --- |
| `TANK_DAMAGE` | 400 toutes les 1500 ms, premier impact à 1500 ms |
| `AOE_DAMAGE` | 500 toutes les 12 000 ms, première AoE à 12 000 ms |
| `SPIKE_DAMAGE` | 1200, intervalle uniforme [6000, 10 000) ms |
| `RAMP` | ×1,15 toutes les 30 000 ms |
| `WIPE.maxDeaths` | 3 |

## Ordres de grandeur

- Pression sur le tank au départ : 400 / 1,5 s ≈ **267 DPS**, soit un Greater
  Heal toutes les ~7,5 s rien que pour lui.
- Pression AoE : 500 × 5 / 12 s ≈ **208 DPS** répartis.
- Spike : 1200 toutes les 8 s en moyenne ≈ **150 DPS** sur un non-tank.
- Sans aucun soin, le groupe tombe autour de **30 s** (vérifié par
  `tests/wipe.test.ts`).
- Débit maximum du healer en Greater Heal : 800 HPS pour 280 mana/s, soit un
  pool épuisé en ~55 s de cast continu — la gestion de la mana est le vrai
  levier de survie.

## Feedback

| Constante | Valeur |
| --- | --- |
| `FEEDBACK.lifetimeMs` | 1200 ms (nombres flottants) |
| `FEEDBACK.messageLifetimeMs` | 1600 ms (messages, morts) |
| `FEEDBACK.maxEntries` | 40 (plafond anti-fuite) |

## Régler la difficulté

- **Plus facile** : baisser `RAMP.factor` (1,10), augmenter `BASE_HP`, ou
  augmenter `MANA.regenPerSecond`.
- **Plus dur** : baisser `SPIKE_DAMAGE.minIntervalMs`, monter `TANK_DAMAGE.amount`,
  ou raccourcir `RAMP.intervalMs`.

Après tout changement de balance, relancer `npm test` : plusieurs tests
s'appuient sur les valeurs nominales (400, 500, 1200, 4000/8000 HP).
