# ADR Index

Architecture Decision Records du Healing Simulator.

## Records

- [ADR-0001: Moteur de simulation pur, isolé de React](./0001-pure-simulation-engine.md)
- [ADR-0002: Boucle à pas fixe de 100 ms avec accumulateur borné](./0002-fixed-timestep-loop.md)
- [ADR-0003: Générateur pseudo-aléatoire déterministe transporté dans le state](./0003-deterministic-prng-in-state.md)
- [ADR-0004: Store externe et snapshots mémoïsés pour isoler les rendus React](./0004-external-store-memoized-snapshots.md)
- [ADR-0005: Aucune persistance — seed rejouable par paramètre d'URL](./0005-no-persistence-url-seed.md)
- [ADR-0006: Conteneur Nginx non-root sur le port 8080 avec fallback SPA](./0006-nonroot-nginx-container.md)

## Format

Chaque ADR suit la structure : Contexte, Décision, Alternatives considérées,
Conséquences (✅ bénéfices / ⚠️ contreparties).
