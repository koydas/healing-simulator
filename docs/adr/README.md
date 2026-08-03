# ADR Index

Architecture Decision Records for the Healing Simulator.

## Records

- [ADR-0001: Pure simulation engine, isolated from React](./0001-pure-simulation-engine.md)
- [ADR-0002: Fixed 100 ms timestep loop with a bounded accumulator](./0002-fixed-timestep-loop.md)
- [ADR-0003: Deterministic pseudo-random generator carried in the state](./0003-deterministic-prng-in-state.md)
- [ADR-0004: External store and memoised snapshots to isolate React renders](./0004-external-store-memoized-snapshots.md)
- [ADR-0005: No persistence — replayable seed through a URL parameter](./0005-no-persistence-url-seed.md)
- [ADR-0006: Non-root Nginx container on port 8080 with an SPA fallback](./0006-nonroot-nginx-container.md)
- [ADR-0007: Stats derived from the WoW Classic tables and formulas (level 1)](./0007-classic-derived-stats.md)
- [ADR-0008: Real priest spell book gated by training level](./0008-classic-spellbook-level-gating.md)
- [ADR-0009: Vanilla mana regeneration — 2 s ticks and the five-second rule](./0009-vanilla-mana-regen-five-second-rule.md)
- [ADR-0010: Level 1 boss profile — what is sourced, what is designed](./0010-level-1-boss-profile.md)
- [ADR-0011: Root-relative asset base](./0011-root-relative-asset-base.md)

## Format

Every ADR follows the same structure: Context, Decision, Alternatives
Considered, Consequences (✅ benefits / ⚠️ trade-offs).
