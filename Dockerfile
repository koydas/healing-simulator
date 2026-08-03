# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the static application
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Dependency layer (Docker cache): depends only on the npm manifests.
COPY package.json package-lock.json ./
RUN npm ci

# Asset prefix baked into index.html. The default `/` suits a deployment at the
# domain root. Serving under a sub-path needs the image itself rebuilt —
# `docker build --build-arg BASE_PATH=/sim/ .` — because the build happens here:
# `dist/` is in .dockerignore, so a `dist` produced on the host never reaches
# the image. See docs/deployment.md.
ARG BASE_PATH=/

# Sources, then build (typecheck is part of `npm run build`).
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY tests ./tests
RUN npm test && npm run build -- --base="${BASE_PATH}"

# ---------------------------------------------------------------------------
# Stage 2 — serve the static files with Nginx, non-root on port 8080
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# The nginx-unprivileged image already runs as uid 101 on an unprivileged port.
USER 101

COPY --chown=101:101 nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
