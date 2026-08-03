# ADR-0007: Stats dérivées des tables et formules de WoW Classic (niveau 1)

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

La première version utilisait des valeurs inventées : 4000 PV par personnage,
8000 pour le tank, 10 000 de mana, des soins de 800 à 2000. Cohérentes entre
elles, mais sans rapport avec WoW. La demande est d'utiliser les **vraies stats
de WoW Classic**, tous les personnages au niveau 1.

Deux façons de s'y prendre : recopier à la main des valeurs trouvées ici ou là,
ou reconstruire les personnages comme le fait le serveur — table de base par
classe, attributs par race/classe, puis formules de conversion.

## Decision

Les stats sont **calculées**, jamais recopiées.

`src/config/classicData.ts` contient exclusivement des données sourcées :

- `CLASS_BASE_LEVEL_1` — PV et mana de base par classe, table
  `player_classlevelstats` de la base vanilla MaNGOS Zero (1.12) ;
- `RACE_CLASS_ATTRIBUTES_LEVEL_1` — force / agilité / endurance / intelligence /
  esprit par race et classe, table `player_levelstats` ;
- les deux formules officielles, reprises du code serveur
  (`StatSystem.cpp`) :

```
bonus PV   = min(end, 20) × 1 + max(0, end − 20) × 10
bonus mana = min(int, 20) × 1 + max(0, int − 20) × 15
```

`gameConfig.ts` en dérive le groupe : un nain guerrier a 90 PV, un prêtre humain
51 PV et 160 de mana, etc. Aucun PV n'est écrit en dur dans le moteur, les
composants ou les tests — ceux-ci lisent `PARTY_TEMPLATE`.

Un test de non-régression vérifie une valeur connue publiquement : un guerrier
humain de niveau 1 a bien 60 PV.

La distinction sourcé / dérivé / approximé / conçu est tenue à jour dans
[`docs/classic-stats.md`](../classic-stats.md).

## Alternatives Considered

- **Recopier des valeurs depuis un wiki** — rejeté : impossible de vérifier une
  incohérence, et rien ne permet de passer au niveau 2 ensuite.
- **Garder des PV « ronds » et prétendre qu'ils sont Classic** — rejeté :
  malhonnête, et l'échelle (des milliers de PV) trahit immédiatement le contraire.
- **Charger les DBC du client** — rejeté : ces fichiers ne sont pas
  redistribuables, et le jeu doit rester un site statique sans dépendance.
- **Conserver la règle « le tank a deux fois les PV des autres »** — abandonnée
  au profit des vraies valeurs. Le rapport obtenu (90 contre 46) vaut 1,96 : la
  règle initiale est *retrouvée* plutôt qu'imposée, parce que le tank est un
  nain guerrier (endurance 25, la plus haute au niveau 1).

## Consequences

- ✅ Chaque nombre est traçable jusqu'à une table serveur ou une ligne de code
  d'émulateur.
- ✅ Monter le groupe au niveau 10 ou 60 demandera d'étendre deux tables, pas de
  réécrire la balance : les fichiers SQL sources contiennent déjà tous les
  niveaux.
- ✅ Les tests portent sur les formules, pas sur des constantes recopiées.
- ⚠️ L'échelle change radicalement (46 à 90 PV au lieu de 4000) : toute la
  timeline de dégâts a dû être recalibrée (voir ADR-0010).
- ⚠️ Les PV varient beaucoup d'un membre à l'autre à cause du palier à 20 points
  d'endurance. C'est fidèle, mais déroutant si l'on s'attend à des PV uniformes.
- ⚠️ Les tables ne couvrent aujourd'hui que le niveau 1 et les combinaisons
  race/classe du groupe : demander autre chose lève une erreur explicite plutôt
  que de renvoyer une valeur fausse.
