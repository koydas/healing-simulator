# ADR-0005: Aucune persistance — seed rejouable par paramètre d'URL

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

Le cahier des charges interdit tout backend, toute base de données et toute
persistance locale. Or deux besoins subsistent : rejouer une partie précise
(débogage, comparaison de stratégies) et communiquer une situation à quelqu'un
d'autre.

## Decision

Aucun `localStorage`, `sessionStorage`, cookie ni IndexedDB n'est utilisé. Les
statistiques d'une partie vivent uniquement dans le `GameState` en mémoire et
disparaissent au rechargement.

La rejouabilité passe par l'URL : `?seed=1337` fixe la seed de départ. Sans
paramètre, la seed provient de `Date.now()` — **le seul usage de l'horloge
réelle en dehors de la boucle de jeu**, et il a lieu au montage, jamais dans le
moteur. La seed courante est affichée sur l'écran de fin.

`readInitialSeed()` dans `App.tsx` est la seule fonction qui lit l'URL ; le
moteur ne connaît que le nombre qu'on lui passe.

## Alternatives Considered

- **`localStorage` pour un meilleur score** — rejeté : interdit par le cahier
  des charges.
- **Seed fixe pour tout le monde** — rejeté : toutes les parties seraient
  identiques, la rejouabilité tuerait l'intérêt.
- **Export / import d'un journal d'actions** — rejeté pour cette version :
  complexité disproportionnée, alors que « seed + mêmes actions » suffit déjà à
  reproduire une partie.

## Consequences

- ✅ Aucune donnée utilisateur n'est stockée : rien à purger, aucune question de
  confidentialité, aucun bandeau de consentement.
- ✅ Le déploiement est un pur site statique, sans état côté serveur.
- ✅ Une partie intéressante se partage par simple copie d'URL.
- ⚠️ Rien n'est conservé entre deux sessions : pas d'historique, pas de record
  personnel.
- ⚠️ Un rechargement accidentel perd la partie en cours.
