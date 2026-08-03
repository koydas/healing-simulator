# ADR-0009: Régénération de mana vanilla — paliers de 2 s et règle des cinq secondes

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

La première version régénérait 100 de mana par seconde, portés à 200 après deux
secondes sans lancement — une mécanique inventée pour récompenser les pauses.

WoW Classic fonctionne autrement, et de façon plus intéressante :

1. la mana tombe par **paliers de 2 secondes**, pas en continu ;
2. la part liée à l'esprit est **totalement suspendue pendant les 5 secondes qui
   suivent une dépense de mana** — c'est la « règle des cinq secondes » (5SR).
   Sans le talent Méditation, un prêtre qui enchaîne les sorts ne régénère
   strictement rien.

Passer aux stats Classic sans reprendre cette mécanique aurait laissé la
ressource centrale du jeu à côté de la plaque.

## Decision

La régénération suit le modèle vanilla :

- un palier toutes les `MANA.tickMs` = 2000 ms, porté par un timer du
  `GameState` (`timers.manaTickMs`) qui tourne en continu ;
- à chaque palier, la mana n'est créditée que si
  `msSinceLastCastStart >= 5000` ;
- le montant par palier est dérivé de l'esprit du prêtre :
  `esprit / 4 + 12,5`, soit **18,5** pour un prêtre humain de niveau 1
  (esprit 24).

`msSinceLastCastStart` est remis à zéro à chaque lancement accepté — la mana
étant dépensée au lancement, ce compteur est exactement le déclencheur du 5SR.

L'ancienne notion de « régénération améliorée » disparaît, remplacée par
« régénération active / suspendue ».

Le coefficient d'esprit est la **seule valeur approchée** du projet : la vraie
table (`gtRegenMPPerSpt` dans les DBC du client) dépend de la classe et du
niveau et n'est pas exploitable publiquement. La formule retenue décrit le
niveau 60 ; elle est signalée comme approximation dans
[`docs/classic-stats.md`](../classic-stats.md).

## Alternatives Considered

- **Garder la régénération continue 100/200 par seconde** — rejeté : incohérent
  avec la demande, et à l'échelle du niveau 1 cela reviendrait à remplir le pool
  (160) deux fois par seconde.
- **Régénération continue à 9,25 mana/s** (le même débit moyen, mais lissé) —
  rejeté : plus simple, mais on perd le grain de jeu. Avec les paliers, arrêter
  de lancer 5,2 s ou 6,1 s ne donne pas le même résultat, ce qui est exactement
  la tension de la gestion de mana en vanilla.
- **Modéliser aussi le talent Méditation** (15 % de régénération conservée
  pendant le 5SR) — écarté : c'est un talent, et un prêtre de niveau 1 n'a aucun
  point de talent.
- **Reconstituer `gtRegenMPPerSpt` à partir de mesures** — écarté pour
  l'instant : disproportionné, et la formule niveau 60 donne déjà un équilibre
  jouable.

## Consequences

- ✅ La ressource centrale du jeu se comporte comme en Classic : cinq Lesser
  Heal d'affilée, puis une fenêtre de silence obligatoire.
- ✅ La règle des cinq secondes crée une décision réelle à chaque instant —
  lancer maintenant, ou laisser le palier tomber.
- ✅ Le comportement est testable au palier près (`tests/spells.test.ts`).
- ⚠️ Le coefficient d'esprit est approché ; la régénération réelle au niveau 1
  est probablement un peu plus faible, ce qui rendrait le jeu plus dur.
- ⚠️ Le palier tombant toutes les 2 s indépendamment des actions, un lancement
  juste après un palier « perd » moins qu'un lancement juste avant : c'est le
  comportement du jeu, pas un défaut.
