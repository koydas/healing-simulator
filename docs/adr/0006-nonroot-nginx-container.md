# ADR-0006: Non-root Nginx container on port 8080 with an SPA fallback

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

The application is a static site to be deployed on Kubernetes. Three
constraints apply: run without root privileges, listen on an unprivileged port
(8080), and expose HTTP health probes. Two functional needs come on top: the SPA
fallback to `index.html` and the complete absence of remote assets.

## Decision

Multi-stage `Dockerfile`:

1. `node:22-alpine` — `npm ci`, **the test suite**, then `npm run build`
   (typecheck included). The image does not build if a test fails.
2. `nginxinc/nginx-unprivileged:1.29-alpine` — an image that natively runs as
   uid 101 and listens on an unprivileged port. Only `dist/` and
   `nginx/default.conf` are copied into it, with `--chown=101:101`.

`nginx/default.conf` provides:

- `listen 8080` (IPv4 + IPv6);
- `location = /health` → `200 "OK"` with no logging and no disk access;
- `try_files $uri $uri/ /index.html` for the SPA fallback;
- an immutable cache on `/assets/` (Vite content-hashes the names), `no-store`
  on `index.html`;
- security headers and `server_tokens off`.

The Deployment adds `readOnlyRootFilesystem: true`, `capabilities: drop: ALL`,
`allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, and mounts
three `emptyDir` volumes (`/tmp`, `/var/cache/nginx`, `/var/run`) — the only
paths Nginx needs to write to. All three probes (startup, readiness, liveness)
hit `/health`.

## Alternatives Considered

- **The official `nginx:alpine`** — rejected: it runs as root and listens on
  port 80; you would have to rewrite the PID, cache and log paths and fix
  permissions by hand. `nginx-unprivileged` does all of that natively.
- **A Node server (`serve`, `express`)** — rejected: it ships a full Node
  runtime in the final image, for a much larger attack surface and footprint
  than a static server.
- **Serving `/health` from a static file** — rejected: a `return 200` touches no
  disk and stays green even if the volume is unavailable, which is the expected
  behaviour of a liveness probe.
- **`caddy`** — set aside: an excellent technical choice, but Nginx was
  explicitly requested.

## Consequences

- ✅ The container satisfies the "restricted" Pod Security Standards.
- ✅ A final image of a few dozen megabytes, with no Node or npm.
- ✅ Deep routes and reloads work (SPA fallback).
- ✅ Tests run inside the build chain: a regression blocks the image.
- ⚠️ The read-only filesystem requires mounting three volumes; forgetting them
  makes Nginx fail to start.
- ⚠️ Building the image re-runs `npm ci` and the test suite: it is slower than
  copying a prebuilt `dist/`. That is an accepted trade-off in favour of
  reproducibility.
