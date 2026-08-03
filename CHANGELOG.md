# Changelog

All notable changes to this project are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed

- **Pinch-to-zoom works again.** The viewport meta carried `maximum-scale=1.0`
  and `user-scalable=no`, which disables pinch zoom on browsers that honour it
  (Android Chrome; iOS Safari has ignored it since iOS 10). The smallest text in
  the interface is 9px, so a low-vision player had no way to enlarge health
  numbers, spell costs or refusal messages — WCAG 1.4.4. Both directives are
  gone. The gameplay reason for locking zoom, accidental double-tap zoom during
  fast casting, is already covered by `touch-action: manipulation` on `body` and
  `button`: measured at 390 × 844, 320 × 568 and 667 × 375, a fast double tap on
  a spell button leaves `visualViewport.scale` at 1, while a pinch now reaches
  2.5 (it stayed pinned at 1.0 before).

- **Deep paths no longer serve a blank page.** The build used `base: './'`, so
  `index.html` referenced `./assets/…`; a page delivered by the SPA fallback for
  a path such as `/some/route` resolved that to `/some/assets/…`, which matches
  no `location /assets/`, so the catch-all returned `index.html` and the browser
  refused the HTML as a module script. Measured in Chromium at 390 × 844: `/`
  rendered five party frames, `/some/route` rendered none, with a single
  MIME-type line in the console. The base is now `/` (ADR-0011), and both URLs
  render identically. Serving under a sub-path now requires **both**
  `--base=/<prefix>/` and an Ingress that strips the prefix — `docs/deployment.md`
  has the measured matrix, which also corrects an earlier claim that
  `--base=/sim/` survives an Ingress forwarding the prefix intact (it does not).

- **A dead healer can no longer heal.** When Elowen died from an AoE or a spike
  while the tank was still holding, the fight stayed active and the controls
  kept accepting casts: mana was spent, healing landed, and an in-flight cast
  completed after its caster's death — inflating survival time and the end-of-
  fight statistics. `checkCast` now refuses with `You are dead`, and the
  healer's own death interrupts the running cast. HoTs applied while she was
  alive keep ticking, as in game.
- **Healing rolls are uniform over the inclusive integer range.** Rounding a
  continuous sample gave each endpoint half the weight of an interior value
  (Lesser Heal landed on 46 or 56 about 5% of the time against 10% for 47-55).
  The draw now picks uniformly among the `max - min + 1` outcomes.
- **The party list scrolls on short viewports.** `.app__main` used
  `overflow: hidden`, and the page itself cannot scroll: on a 320 × 568 phone
  204 px of the party were clipped (279 px in landscape), leaving the lower
  members drawn outside the visible area and impossible to tap — so they could
  not be selected for healing. The region is now `overflow-y: auto`.
- **Combat messages stay visible on short viewports.** Making the party
  scrollable pushed the message strip below the fold on small phones and in
  landscape, so a refused cast ("Not enough mana", "Level too low") rendered
  off-screen and the button looked dead. `MessageFeed` now sits between the
  scrolling party and the controls; verified visible at 320 × 568, 667 × 375
  and 390 × 844.
- **Nginx no longer drops its security headers.** `add_header` is inherited
  only when the child level declares none, so the `Cache-Control` in each
  `location` was suppressing `X-Content-Type-Options`, `X-Frame-Options` and
  `Referrer-Policy` for every application response. The three headers are now
  repeated in all four locations, with a comment explaining why.
- **Sub-path deployment is documented accurately.** `base: './'` was described
  as working "behind a path prefix" without qualification. It only does when
  the Ingress strips the prefix; an Ingress forwarding `/sim/` makes the
  browser fetch `/sim/assets/…`, which the SPA catch-all answers with
  `index.html`. `docs/deployment.md` now lists the three setups and the two
  supported fixes.
- **`engines.node` matches the locked toolchain.** The range advertised
  `>=20`, which accepts Node 20.0-20.18 and 22.0-22.11, while Vite 7.3.6
  requires `^20.19.0 || >=22.12.0`: installing on those versions succeeded with
  a warning, then failed at dev-server or build time. The manifest and the
  README now state the real range.

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
- **Six Claude Code skills** under `.claude/skills/` plus a root `CLAUDE.md`,
  encoding the rules an agent needs when working here: `pure-engine`,
  `classic-data`, `render-budget`, `test-protocol`, `new-adr` and
  `pr-review-workflow`. They capture the invariants that review has actually
  caught us breaking — a dead caster still acting, a non-uniform roll, a
  clipped party on short viewports, an oversold deployment claim.
- `tests/classicStats.test.ts`: 14 tests over the vanilla formulas, the derived
  party health, the spell values and the healing roll distribution (99 tests
  in total).

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
