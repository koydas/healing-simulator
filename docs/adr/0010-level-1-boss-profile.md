# ADR-0010: Profil du boss de niveau 1 — part sourcée, part conçue

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

Le boss doit lui aussi être de niveau 1. Or les PV du groupe viennent de tomber
de 4000 à une cinquantaine : les 400 dégâts par coup de la première version
tueraient n'importe qui instantanément.

Deux difficultés :

1. Aucune créature de niveau 1 n'est un vrai boss dans WoW Classic. Les entrées
   de rang « boss » au niveau 1 de `creature_template` sont des formes de
   métamorphose et des déclencheurs, pas des adversaires.
2. Une créature de niveau 1 ordinaire frappe pour 2 à 10 toutes les 2 s, soit
   1 à 5 dégâts par seconde. Face à un Lesser Heal qui rend 51 PV toutes les
   1,5 s, il n'y a aucun combat : le soigneur gagne indéfiniment, et la rampe
   ×1,15 mettrait onze minutes à changer quoi que ce soit.

Il faut donc construire un adversaire, mais le construire **à partir des
données** plutôt qu'au hasard.

## Decision

Le boss est un **élite de niveau 1**, dont chaque valeur est soit mesurée, soit
explicitement conçue et justifiée.

Mesures faites sur la base vanilla (597 créatures de niveau 1 réelles, filtrées
des déclencheurs et des formes) :

| Mesure | Valeur |
| --- | --- |
| Dégâts de mêlée, médiane | 2 |
| Dégâts de mêlée, 3ᵉ quartile | 9 – 10 |
| Vitesse d'attaque | 2000 ms |
| Facteur élite sur les dégâts | ×1,24 (niv. 20) à ×3,1 (niv. 30-60) |

Profil retenu :

- **Mêlée : 8 dégâts toutes les 2 s.** Le montant est encadré par les mesures
  (médiane 2 × 3 = 6 ; haut de distribution 10 × 1,2 = 12) et posé au milieu de
  cette fourchette. La cadence, elle, est **sourcée** : toutes les créatures de
  niveau 1 ont `MeleeBaseAttackTime = 2000`. Elle remplace le 1,5 s de la
  spécification initiale.
- **AoE : 6 dégâts sur chaque membre vivant toutes les 12 s** — conçu.
- **Spike : 18 dégâts sur un non-tank vivant toutes les 6 à 10 s** — conçu,
  calibré pour retirer environ un tiers des PV d'un DPS de niveau 1.
- **Rampe : ×1,15 toutes les 30 s** — inchangée, c'est la mécanique du mode.

Résultat mesuré par simulation (soigneur automatique, huit seeds) : 22 s de
survie sans aucun soin, 48 à 97 s avec un soigneur naïf. La pression initiale
est de 8,8 PV/s contre environ 15 PV/s soutenables — tenable au départ, perdu
d'avance à terme.

## Alternatives Considered

- **Copier littéralement une créature de niveau 1** (2 dégâts / 2 s) — rejeté :
  fidèle mais injouable, le soigneur ne peut pas perdre.
- **Appliquer le facteur élite ×3 au haut de la distribution** (30 dégâts par
  coup) — rejeté : le tank meurt en trois coups, il n'y a plus de partie.
- **Conserver la cadence de 1,5 s de la spécification initiale** — rejeté après
  mesure : la cadence vanilla de 2 s est sourcée, et elle allonge la survie sans
  soin de 16 s à 22 s, ce qui laisse au joueur le temps d'agir.
- **Augmenter les PV du groupe pour compenser** — rejeté : cela reviendrait à
  abandonner la fidélité des stats obtenue en ADR-0007.

## Consequences

- ✅ Le combat reste un combat, à une échelle de niveau 1 crédible.
- ✅ La part conçue est explicitement séparée de la part sourcée, dans
  [`docs/classic-stats.md`](../classic-stats.md) comme dans les commentaires de
  `gameConfig.ts`.
- ✅ Les mesures sont reproductibles : les tables sources sont publiques et le
  filtrage est décrit.
- ⚠️ Trois valeurs sur quatre (AoE, spike, rampe) restent du game design. Le
  boss n'est pas « une créature de WoW Classic », c'est un adversaire calibré
  pour l'échelle du niveau 1.
- ⚠️ La cadence de mêlée a changé (1,5 s → 2 s) : les tests qui la vérifiaient
  ont été mis à jour, et lisent désormais `TANK_DAMAGE.intervalMs` au lieu d'un
  littéral.
