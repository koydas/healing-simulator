# Déploiement

## Image Docker

`Dockerfile` en deux étapes :

1. **build** — `node:22-alpine`, `npm ci`, suite de tests puis `npm run build`
   (qui inclut `tsc --noEmit`). L'image échoue donc si les tests ou le typecheck
   échouent.
2. **runtime** — `nginxinc/nginx-unprivileged:1.29-alpine`, qui tourne en
   **uid 101** et écoute sur un port non privilégié. Seuls `dist/` et la
   configuration Nginx sont copiés : aucune dépendance Node dans l'image finale.

```bash
docker build -t healing-simulator:1.0.0 .
docker run --rm -p 8080:8080 healing-simulator:1.0.0
curl -i http://localhost:8080/health      # 200 OK
curl -i http://localhost:8080/une/route   # 200 + index.html (fallback SPA)
```

Le `HEALTHCHECK` de l'image interroge `/health` toutes les 30 s.

## Configuration Nginx

`nginx/default.conf` :

- écoute `8080` (IPv4 et IPv6) ;
- `location = /health` → `200 "OK"`, sans log ni accès disque ;
- `location /assets/` → cache immuable un an (les noms de fichiers sont hashés
  par Vite) ;
- `location /` → `try_files $uri $uri/ /index.html` : **fallback SPA** ;
- `index.html` en `no-store` pour qu'un déploiement soit vu immédiatement ;
- en-têtes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `server_tokens off`, compression gzip.

## Système de fichiers en lecture seule

Le Deployment active `readOnlyRootFilesystem: true`. Nginx a besoin de trois
chemins inscriptibles, fournis par des `emptyDir` :

| Chemin | Usage |
| --- | --- |
| `/tmp` | corps de requête temporaires |
| `/var/cache/nginx` | caches proxy / fastcgi |
| `/var/run` | fichier PID |

## Manifestes Kubernetes

| Fichier | Contenu |
| --- | --- |
| `k8s/deployment.yaml` | 2 réplicas, contexte non-root (uid/gid 101), capabilities `drop: ALL`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, sondes startup / readiness / liveness sur `/health`, requests & limits |
| `k8s/service.yaml` | `ClusterIP`, port 80 → port nommé `http` (8080) |
| `k8s/ingress.yaml` | hôte `healing-simulator.local`, `pathType: Prefix`, `ingressClassName: nginx` |

```bash
kubectl apply -f k8s/
kubectl rollout status deployment/healing-simulator
kubectl port-forward svc/healing-simulator 8080:80
```

### À adapter avant application

1. `k8s/deployment.yaml` → `image:` (registre et tag réels) ;
2. `k8s/ingress.yaml` → `host:` et `ingressClassName:` du cluster ;
3. le namespace, si vous n'utilisez pas `default` (`kubectl apply -n <ns> -f k8s/`).

### Sondes

Les trois sondes visent `/health` sur le port nommé `http` :

- `startupProbe` : toutes les 2 s, 15 échecs tolérés (30 s pour démarrer) ;
- `readinessProbe` : toutes les 5 s — retire le pod du Service s'il ne répond plus ;
- `livenessProbe` : toutes les 10 s — redémarre le conteneur bloqué.

## Sous-chemin d'Ingress

Le build utilise `base: './'` (chemins relatifs), l'application fonctionne donc
aussi bien à la racine du domaine que derrière un préfixe de chemin, sans
recompilation.

## Aucune dépendance externe

L'application ne charge ni police, ni script, ni image distante : tout est
embarqué dans l'image. Elle fonctionne dans un cluster totalement isolé du
réseau public.
