# ADR-0008: Sorts réels du prêtre et verrouillage par niveau d'apprentissage

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

Les quatre sorts d'origine (Renew, Flash Heal, Greater Heal, Group Heal) étaient
inventés. En passant aux stats Classic, ils devaient devenir de vrais sorts de
prêtre vanilla.

Un problème apparaît immédiatement : **au niveau 1, un prêtre ne connaît que
Lesser Heal**. Renew s'apprend au niveau 8, Heal au 16, Flash Heal au 20,
Prayer of Healing au 30. Une barre de quatre sorts « tous niveau 1 » n'existe
pas dans le jeu. Et les coûts le confirment : Prayer of Healing coûte 410 de
mana, soit 2,5 fois le pool d'un prêtre de niveau 1.

## Decision

La barre affiche les **cinq familles de soin du prêtre vanilla**, au rang 1,
avec leurs vraies valeurs :

| Sort | Niveau | Mana | Incantation | Effet |
| --- | --- | --- | --- | --- |
| Lesser Heal | 1 | 30 | 1,5 s | 46 – 56 |
| Renew | 8 | 30 | instantané | 5 ticks de 9, toutes les 3 s |
| Heal | 16 | 155 | 3,0 s | 295 – 341 |
| Flash Heal | 20 | 125 | 1,5 s | 193 – 237 |
| Prayer of Healing | 30 | 410 | 3,0 s | 312 – 333 au groupe |

Le niveau du soigneur est porté par le `GameState` (`playerLevel`, initialisé
depuis `PLAYER_LEVEL = 1`). `checkCast` refuse tout sort dont
`requiredLevel > playerLevel`, avec le motif `level` et le message
« Niveau insuffisant ». Les boutons verrouillés restent visibles, en pointillés,
et affichent « Niv. 8 », « Niv. 16 », etc.

**Au niveau 1, la partie se joue donc avec un seul sort.** C'est un choix
assumé : c'est le vrai kit d'un prêtre de niveau 1, et cela transforme la partie
en exercice de triage — un Lesser Heal toutes les 1,5 s ne peut pas suivre deux
cibles basses en même temps.

Le soin est tiré uniformément dans la fourchette du sort (46 – 56), comme en
jeu, au lieu de l'ancien « base ± 10 % ».

## Alternatives Considered

- **Garder quatre sorts inventés à l'échelle du niveau 1** — rejeté : c'était
  précisément ce qu'on remplaçait ; les sorts auraient été aussi arbitraires
  qu'avant, juste avec des nombres plus petits.
- **Afficher les cinq sorts sans condition de niveau** — rejeté : contredit
  « tous niveau 1 », et Prayer of Healing serait de toute façon inutilisable
  (410 de mana pour un pool de 160). Flash Heal (193 – 237) soignerait quatre
  fois les PV maximum d'un DPS : le jeu n'aurait plus d'enjeu.
- **Ne montrer que Lesser Heal et masquer les autres** — rejeté : les boutons
  verrouillés informent (« ce sort arrive au niveau 8 ») et rendent la
  progression lisible.
- **Prendre le kit d'un prêtre de niveau 16-20** pour avoir quatre sorts
  utilisables — rejeté ici, mais c'est exactement ce que produira
  `PLAYER_LEVEL = 20` le jour venu : rien d'autre à changer.

## Consequences

- ✅ Chaque sort correspond à un sort réel, avec son identifiant Blizzard,
  vérifiable en base.
- ✅ Monter `PLAYER_LEVEL` débloque les sorts automatiquement, sans toucher au
  moteur ni à l'interface.
- ✅ Le niveau vivant dans le `GameState`, les tests peuvent simuler un prêtre de
  niveau 20 sans modifier de constante globale.
- ⚠️ Au niveau 1, quatre boutons sur cinq sont inertes : c'est fidèle, mais cela
  peut se lire comme une interface incomplète au premier coup d'œil.
- ⚠️ La barre passe de quatre à cinq boutons (trois par ligne sur téléphone,
  deux sur la seconde) ; la contrainte de 72 × 72 px reste respectée.
- ⚠️ Les montants des rangs supérieurs (Heal, Flash Heal, Prayer of Healing)
  sont hors d'échelle pour des PV de niveau 1 : ils ne prendront leur sens
  qu'avec la montée en niveau du groupe.
