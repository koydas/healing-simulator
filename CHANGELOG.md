# Changelog

All notable changes to this project are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

- **All character stats now come from WoW Classic 1.12, at level 1**
  (ADR-0007). Health and mana are computed by the game's formulas
  (`min(stat, 20) × 1 + surplus × 10` for stamina, `× 15` for intellect) from
  the `player_classlevelstats` and `player_levelstats` tables: Thorgrim (dwarf
  warrior) 90 HP, Elowen (human priest) 51 HP and 160 mana, Kaelan 55 HP,
  Fizzwick 50 HP, Sylandra 46 HP.
- **Spells are the five vanilla priest healing families, at rank 1**, with
  their real values and training levels (ADR-0008): Lesser Heal (lv. 1), Renew
  (8), Heal (16), Flash Heal (20), Prayer of Healing (30). Healing is rolled
  inside the spell's range instead of a "base ± 10%".
- **At level 1 only Lesser Heal is castable**: the other buttons are shown
  locked with their required level, and a refused cast reports "Level too low".
- **Mana regeneration follows the vanilla model** (ADR-0009): an 18.5 tick every
  2 seconds, fully suspended for the 5 seconds following any expenditure (the
  five-second rule). The old continuous 100/200 per second regeneration is gone.
- **The boss is a level 1 elite** (ADR-0010): 8 melee damage every 2 s (cadence
  sourced from `creature_template`), 6 AoE damage every 12 s, 18 spike damage
  every 6 to 10 s. Measured survival: 22 s with no healing, 48 to 97 s with an
  automated healer.
- Renew now ticks every 3 seconds (5 ticks of 9, 45 total), like in Classic.
- Frames show each character's race and class; the header shows the boss level.
- **The whole project is in English** — game UI, code comments, tests and
  documentation.

### Added

- `src/config/classicData.ts`: sourced WoW Classic data (base tables, race/class
  attributes, official formulas, spells, level 1 creature measurements) — no
  gameplay value is invented in that file.
- `playerLevel` in the `GameState`: spell gating follows the level, which paves
  the way for levelling up.
- `docs/classic-stats.md`: sources, formulas, tables, and an explicit split
  between **sourced**, **derived**, **approximated** and **designed** values.
- ADR-0007 through ADR-0010 documenting those four decisions.
- `tests/classicStats.test.ts`: 14 tests over the vanilla formulas, the derived
  party health and the spell values (92 tests in total).

## [1.0.0] — 2026-08-02

### Added

- Pure, deterministic simulation engine: `stepSimulation(state, dtMs)`, with no
  real clock, DOM or React inside it (ADR-0001).
- Fixed 100 ms timestep game loop, `requestAnimationFrame` accumulator capped at
  500 ms of catch-up, and a freeze after the tab goes to the background
  (ADR-0002).
- Mulberry32 pseudo-random generator whose state lives in the `GameState`; seed
  replayable through `?seed=` (ADR-0003, ADR-0005).
- Five-member party, permanent and untargetable deaths.
- Four healing spells with a 1.5 s global cooldown, target-then-cast targeting,
  explicit refusal reasons and cast cancellation.
- Boss timeline: tank damage, periodic AoE, pseudo-random spikes and a
  cumulative ×1.15 ramp every 30 s.
- End-of-fight statistics: survival time, HPS, effective healing, overhealing
  and its percentage, mana spent, healing per point of mana, casts started /
  completed per spell, casts cancelled, deaths.
- Mobile-first plain-CSS interface: 64 px minimum frames, 72 × 72 px spell
  buttons, cast and mana bars, combat feedback, `env(safe-area-inset-*)`
  support.
- External store with memoised snapshots and CSS-variable bar updates: no full
  re-render of the application every 100 ms (ADR-0004).
- Vitest suite over the pure engine (determinism, damage, spikes, ramp, Renew,
  interruptions, mana, overhealing, wipe, pause, invariants).
- Containerisation: multi-stage `Dockerfile`, non-root Nginx on port 8080,
  `/health` endpoint, SPA fallback, `.dockerignore` (ADR-0006).
- Kubernetes manifests: `Deployment` (startup / readiness / liveness probes,
  restricted security context), `Service`, `Ingress`.
- `docs/`: architecture, engine, balance, testing, deployment, runbook and six
  ADRs.

[Unreleased]: https://github.com/koydas/healing-simulator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/koydas/healing-simulator/releases/tag/v1.0.0
