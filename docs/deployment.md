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

## Ingress sub-path

The build uses `base: './'` (relative paths), so the application works both at
the domain root and behind a path prefix, with no rebuild.

## No external dependency

The application loads no font, script or remote image: everything is baked into
the image. It runs in a cluster fully isolated from the public internet.
