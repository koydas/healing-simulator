# Changelog

Toutes les évolutions notables de ce projet sont consignées ici, au format
[Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Unreleased]

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
