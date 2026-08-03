# Documentation — Healing Simulator

| Document | Contenu |
| --- | --- |
| [architecture.md](./architecture.md) | découpage des couches, flux de données, stratégie de rendu |
| [simulation.md](./simulation.md) | contrat du moteur : pas fixe, ordre des événements, invariants |
| [classic-stats.md](./classic-stats.md) | stats WoW Classic niveau 1 : sources, formules, et ce qui est sourcé / dérivé / conçu |
| [balance.md](./balance.md) | toutes les valeurs de balance et leur emplacement dans le code |
| [testing.md](./testing.md) | organisation de la suite Vitest et couverture attendue |
| [deployment.md](./deployment.md) | image Docker, Nginx, manifestes Kubernetes, sondes |
| [runbook.md](./runbook.md) | diagnostic des pannes courantes (dev, build, conteneur, cluster) |
| [adr/](./adr/README.md) | décisions d'architecture (ADR) |

## Règles de contribution rapides

1. **Les données Classic vivent dans `src/config/classicData.ts`** (sourcé
   uniquement) et **les constantes de jeu dans `src/config/gameConfig.ts`**, qui
   les dérive. Aucune valeur numérique de gameplay ailleurs — et surtout aucun
   PV ni coût de sort recopié à la main.
2. **Le moteur reste pur.** Aucun `Date.now()`, `performance.now()`,
   `Math.random()`, DOM ou API React sous `src/simulation/`.
3. **Toute modification du moteur s'accompagne d'un test** dans `tests/`.
4. `npm test && npm run build` doit passer avant tout commit.
5. Une décision structurante donne lieu à un ADR (voir [adr/](./adr/README.md)).
6. **Toute valeur présentée comme « Classic » doit être sourcée** dans
   [classic-stats.md](./classic-stats.md), avec son lien. Une valeur inventée se
   déclare comme telle dans la section « Conçu ».
