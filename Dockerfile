# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Étape 1 — build de l'application statique
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Couche de dépendances (cache Docker) : ne dépend que des manifestes npm.
COPY package.json package-lock.json ./
RUN npm ci

# Sources puis build (typecheck inclus dans `npm run build`).
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY tests ./tests
RUN npm test && npm run build

# ---------------------------------------------------------------------------
# Étape 2 — service des fichiers statiques par Nginx, en non-root sur 8080
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# L'image nginx-unprivileged tourne déjà en uid 101 et écoute en non-privilégié.
USER 101

COPY --chown=101:101 nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
