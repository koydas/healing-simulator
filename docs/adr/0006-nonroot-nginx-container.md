# ADR-0006: Conteneur Nginx non-root sur le port 8080 avec fallback SPA

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

L'application est un site statique à déployer dans Kubernetes. Trois contraintes
s'imposent : exécution sans privilèges root, écoute sur un port non privilégié
(8080), et sondes de santé HTTP. S'y ajoutent deux besoins fonctionnels : le
fallback SPA vers `index.html` et l'absence totale d'asset distant.

## Decision

`Dockerfile` multi-stage :

1. `node:22-alpine` — `npm ci`, **suite de tests**, puis `npm run build`
   (typecheck inclus). L'image ne se construit pas si un test échoue.
2. `nginxinc/nginx-unprivileged:1.29-alpine` — image qui tourne nativement en
   uid 101 et écoute sur un port non privilégié. Seuls `dist/` et
   `nginx/default.conf` y sont copiés, avec `--chown=101:101`.

`nginx/default.conf` fournit :

- `listen 8080` (IPv4 + IPv6) ;
- `location = /health` → `200 "OK"` sans log ni accès disque ;
- `try_files $uri $uri/ /index.html` pour le fallback SPA ;
- cache immuable sur `/assets/` (noms hashés par Vite), `no-store` sur
  `index.html` ;
- en-têtes de sécurité et `server_tokens off`.

Le Deployment ajoute `readOnlyRootFilesystem: true`, `capabilities: drop: ALL`,
`allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, et monte
trois `emptyDir` (`/tmp`, `/var/cache/nginx`, `/var/run`) — les seuls chemins
dont Nginx a besoin en écriture. Les trois sondes (startup, readiness, liveness)
interrogent `/health`.

## Alternatives Considered

- **`nginx:alpine` officielle** — rejeté : tourne en root et écoute sur 80 ; il
  faudrait réécrire les chemins de PID, de cache et de log, et ajuster les
  permissions à la main. `nginx-unprivileged` fait cela nativement.
- **Serveur Node (`serve`, `express`)** — rejeté : embarque un runtime Node
  complet dans l'image finale, pour une surface d'attaque et une empreinte bien
  supérieures à celles d'un serveur statique.
- **Endpoint `/health` servi par un fichier statique** — rejeté : un `return 200`
  ne touche pas le disque et reste vert même si le volume est indisponible, ce
  qui est le comportement attendu d'une sonde de vivacité.
- **`caddy`** — écarté : excellent choix technique, mais Nginx est explicitement
  demandé.

## Consequences

- ✅ Le conteneur satisfait les Pod Security Standards « restricted ».
- ✅ Image finale de quelques dizaines de mégaoctets, sans Node ni npm.
- ✅ Les routes profondes et les rechargements fonctionnent (fallback SPA).
- ✅ Les tests tournent dans la chaîne de build : une régression bloque l'image.
- ⚠️ Le système de fichiers en lecture seule impose de monter trois volumes ;
  les oublier fait échouer le démarrage de Nginx.
- ⚠️ Le build de l'image relance `npm ci` et la suite de tests : il est plus
  lent qu'une simple copie de `dist/`. C'est un compromis assumé en faveur de la
  reproductibilité.
