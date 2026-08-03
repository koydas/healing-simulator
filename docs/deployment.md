# Deployment

## Docker image

`Dockerfile` in two stages:

1. **build** — `node:22-alpine`, `npm ci`, the test suite, then `npm run build`
   (which includes `tsc --noEmit`). The image therefore fails to build if the
   tests or the typecheck fail.
2. **runtime** — `nginxinc/nginx-unprivileged:1.29-alpine`, which runs as
   **uid 101** and listens on an unprivileged port. Only `dist/` and the Nginx
   configuration are copied over: no Node dependency in the final image.

```bash
docker build -t healing-simulator:1.0.0 .
docker run --rm -p 8080:8080 healing-simulator:1.0.0
curl -i http://localhost:8080/health     # 200 OK
curl -i http://localhost:8080/some/route # 200 + index.html (SPA fallback)
```

The image `HEALTHCHECK` polls `/health` every 30 s.

## Nginx configuration

`nginx/default.conf`:

- listens on `8080` (IPv4 and IPv6);
- `location = /health` → `200 "OK"`, with no logging and no disk access;
- `location /assets/` → immutable one-year cache (Vite content-hashes the file
  names);
- `location /` → `try_files $uri $uri/ /index.html`: the **SPA fallback**;
- `index.html` served `no-store` so a deployment is picked up immediately;
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` headers,
  `server_tokens off`, gzip compression.

The three security headers are declared at server level **and repeated inside
every `location` that declares an `add_header` of its own. That duplication is
required, not sloppiness: nginx inherits `add_header` from the parent level
only when the current level declares none, so a lone `Cache-Control` in a
`location` silently drops every inherited header. Removing the repetition would
serve the whole application without security headers.

## Read-only filesystem

The Deployment sets `readOnlyRootFilesystem: true`. Nginx needs three writable
paths, provided as `emptyDir` volumes:

| Path | Use |
| --- | --- |
| `/tmp` | temporary request bodies |
| `/var/cache/nginx` | proxy / fastcgi caches |
| `/var/run` | PID file |

## Kubernetes manifests

| File | Contents |
| --- | --- |
| `k8s/deployment.yaml` | 2 replicas, non-root context (uid/gid 101), `drop: ALL` capabilities, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, startup / readiness / liveness probes on `/health`, requests & limits |
| `k8s/service.yaml` | `ClusterIP`, port 80 → the named `http` port (8080) |
| `k8s/ingress.yaml` | host `healing-simulator.local`, `pathType: Prefix`, `ingressClassName: nginx` |

```bash
kubectl apply -f k8s/
kubectl rollout status deployment/healing-simulator
kubectl port-forward svc/healing-simulator 8080:80
```

### What to adjust before applying

1. `k8s/deployment.yaml` → `image:` (your real registry and tag);
2. `k8s/ingress.yaml` → the cluster's `host:` and `ingressClassName:`;
3. the namespace, if you are not using `default`
   (`kubectl apply -n <ns> -f k8s/`).

### Probes

All three probes target `/health` on the named `http` port:

- `startupProbe`: every 2 s, 15 failures tolerated (30 s to start);
- `readinessProbe`: every 5 s — removes the pod from the Service when it stops
  answering;
- `livenessProbe`: every 10 s — restarts a stuck container.

## Serving under a sub-path

The build uses `base: '/'` (ADR-0011), so `index.html` references `/assets/…`
absolutely — the same URL whatever page carried it, which is what makes the SPA
fallback boot instead of showing a blank page. The prefix the **browser** is on
therefore has to match the prefix the **container** serves:

| Setup | Build | Browser requests | Works? |
| --- | --- | --- | --- |
| Domain root (`https://host/`) | default | `/assets/…` | ✅ |
| Ingress **strips** `/sim/` (`rewrite-target: /`) | `--base=/sim/` | `/sim/assets/…` → `/assets/…` | ✅ |
| Ingress **strips** `/sim/` | default | `/assets/…` — matches no Ingress rule | ❌ |
| Ingress **forwards** `/sim/` intact | any | container has no `/sim/…` | ❌ |

Measured against servers replicating `nginx/default.conf` and each Ingress
shape:

```
base /      root deploy       /some/route                    -> boots (5 party frames)
base /      stripping /sim/   /assets/index-*.js             -> 404 text/plain
base /sim/  stripping /sim/   /sim/assets/index-*.js         -> 200 text/javascript
base /sim/  forwarding /sim/  /sim/assets/index-*.js         -> 200 text/html   (never boots)
```

The failure mode is always the same and always quiet: the SPA catch-all answers
a JavaScript request with `index.html`, and the browser refuses it with a
MIME-type complaint in the console. Nothing else is logged.

So, to serve under a sub-path: **build for the prefix and strip it at the
Ingress** — `npm run build -- --base=/sim/`, plus
`nginx.ingress.kubernetes.io/rewrite-target: /` with a capture group in the
path. Both halves are required; either one alone lands on a ❌ row above.

An Ingress that forwards the prefix intact is not supported by this container.
Teaching Nginx to map `/<prefix>/assets/…` back onto `/assets/…` with a regex
`location` would work, but it makes the container silently accept any prefix,
which hides a misconfigured Ingress instead of surfacing it.

## No external dependency

The application loads no font, script or remote image: everything is baked into
the image. It runs in a cluster fully isolated from the public internet.
