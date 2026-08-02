# Documentation — Healing Simulator

| Document | Contenu |
| --- | --- |
| [architecture.md](./architecture.md) | découpage des couches, flux de données, stratégie de rendu |
| [simulation.md](./simulation.md) | contrat du moteur : pas fixe, ordre des événements, invariants |
| [balance.md](./balance.md) | toutes les valeurs de balance et leur emplacement dans le code |
| [testing.md](./testing.md) | organisation de la suite Vitest et couverture attendue |
| [deployment.md](./deployment.md) | image Docker, Nginx, manifestes Kubernetes, sondes |
| [runbook.md](./runbook.md) | diagnostic des pannes courantes (dev, build, conteneur, cluster) |
| [adr/](./adr/README.md) | décisions d'architecture (ADR) |

## Règles de contribution rapides

1. **Toute constante de balance vit dans `src/config/gameConfig.ts`.** Aucune
   valeur numérique de gameplay ne doit apparaître ailleurs.
2. **Le moteur reste pur.** Aucun `Date.now()`, `performance.now()`,
   `Math.random()`, DOM ou API React sous `src/simulation/`.
3. **Toute modification du moteur s'accompagne d'un test** dans `tests/`.
4. `npm test && npm run build` doit passer avant tout commit.
5. Une décision structurante donne lieu à un ADR (voir [adr/](./adr/README.md)).
