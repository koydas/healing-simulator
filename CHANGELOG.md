# Changelog

Toutes les évolutions notables de ce projet sont consignées ici, au format
[Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Unreleased]

### Changed

- **Toutes les stats de personnage viennent désormais de WoW Classic 1.12, au
  niveau 1** (ADR-0007). Les PV et la mana sont calculés par les formules du jeu
  (`min(stat, 20) × 1 + surplus × 10` pour l'endurance, `× 15` pour
  l'intelligence) à partir des tables `player_classlevelstats` et
  `player_levelstats` : Thorgrim (nain guerrier) 90 PV, Elowen (humain prêtre)
  51 PV et 160 de mana, Kaelan 55 PV, Fizzwick 50 PV, Sylandra 46 PV.
- **Les sorts sont les cinq familles de soin du prêtre vanilla, au rang 1**, avec
  leurs vraies valeurs et leur niveau d'apprentissage (ADR-0008) : Lesser Heal
  (niv. 1), Renew (8), Heal (16), Flash Heal (20), Prayer of Healing (30). Le
  soin est tiré dans la fourchette du sort au lieu d'un « base ± 10 % ».
- **Au niveau 1, seul Lesser Heal est lançable** : les autres boutons sont
  affichés verrouillés avec leur niveau requis, et un lancement refusé indique
  « Niveau insuffisant ».
- **La régénération de mana suit le modèle vanilla** (ADR-0009) : un palier de
  18,5 toutes les 2 secondes, totalement suspendu pendant les 5 secondes qui
  suivent une dépense (règle des cinq secondes). L'ancienne régénération
  continue 100/200 par seconde disparaît.
- **Le boss est un élite de niveau 1** (ADR-0010) : mêlée de 8 toutes les 2 s
  (cadence sourcée dans `creature_template`), AoE de 6 toutes les 12 s, spike de
  18 toutes les 6 à 10 s. Survie mesurée : 22 s sans soin, 48 à 97 s avec un
  soigneur automatique.
- Renew tick désormais toutes les 3 secondes (5 ticks de 9, 45 au total), comme
  en Classic.
- Les frames affichent la race et la classe de chaque personnage, l'en-tête
  affiche le niveau du boss.

### Added

- `src/config/classicData.ts` : données WoW Classic sourcées (tables de base,
  attributs par race/classe, formules officielles, sorts, mesures sur les
  créatures de niveau 1) — aucune valeur de gameplay n'y est inventée.
- `playerLevel` dans le `GameState` : le verrouillage des sorts suit le niveau,
  ce qui prépare la montée en niveau.
- `docs/classic-stats.md` : sources, formules, tableaux, et la séparation
  explicite entre valeurs **sourcées**, **dérivées**, **approximées** et
  **conçues**.
- ADR-0007 à ADR-0010 documentant ces quatre décisions.
- `tests/classicStats.test.ts` : 14 tests sur les formules vanilla, les PV
  dérivés du groupe et les valeurs des sorts (92 tests au total).

## [1.0.0] — 2026-08-02

### Added

- Moteur de simulation pur et déterministe : `stepSimulation(state, dtMs)`, sans
  horloge réelle, DOM ni React (ADR-0001).
- Boucle de jeu à pas fixe de 100 ms, accumulateur `requestAnimationFrame`
  plafonné à 500 ms de rattrapage et gel après un passage en arrière-plan
  (ADR-0002).
- Générateur pseudo-aléatoire mulberry32 dont l'état est transporté dans le
  `GameState` ; seed rejouable via `?seed=` (ADR-0003, ADR-0005).
- Groupe de cinq membres (tank à 8000 HP, quatre autres à 4000 HP), morts
  définitives et non ciblables.
- Quatre sorts — Renew, Flash Heal, Greater Heal, Group Heal — avec GCD de 1,5 s,
  ciblage *target-then-cast*, motifs de refus explicites et annulation de cast.
- Timeline de boss : dégâts tank toutes les 1,5 s, AoE toutes les 12 s, spikes
  pseudo-aléatoires et rampe cumulative ×1,15 toutes les 30 s.
- Statistiques de fin de partie : durée de survie, HPS, soin effectif, overheal
  et pourcentage, mana dépensée, efficacité par point de mana, casts commencés /
  complétés par sort, casts annulés, morts.
- Interface mobile-first en CSS natif : frames de 64 px minimum, boutons de
  sorts de 72 × 72 px, barres de cast et de mana, feedback de combat,
  prise en charge de `env(safe-area-inset-*)`.
- Store externe avec snapshots mémoïsés et mise à jour des barres par variables
  CSS : aucun rendu complet de l'application toutes les 100 ms (ADR-0004).
- Suite Vitest de 74 tests sur le moteur pur (déterminisme, dégâts, spikes,
  rampe, Renew, interruptions, mana, overheal, wipe, pause, invariants).
- Conteneurisation : `Dockerfile` multi-stage, Nginx non-root sur le port 8080,
  endpoint `/health`, fallback SPA, `.dockerignore` (ADR-0006).
- Manifestes Kubernetes : `Deployment` (sondes startup / readiness / liveness,
  contexte de sécurité restreint), `Service`, `Ingress`.
- Documentation `docs/` : architecture, moteur, balance, tests, déploiement,
  runbook et six ADR.

[Unreleased]: https://github.com/koydas/healing-simulator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/koydas/healing-simulator/releases/tag/v1.0.0
