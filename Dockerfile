# syntax=docker/dockerfile:1

# ─── Build : site statique Astro via Bun ──────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

# Dépendances d'abord (couche de cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Sources puis build (SITE = origine canonique de prod, cf astro.config.mjs)
COPY . .
RUN bun run build

# Rejoue public/_redirects (format Cloudflare) en config nginx
RUN bun run scripts/redirects-to-nginx.ts

# ─── Runtime : nginx sert dist/ ───────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx-redirects.conf /etc/nginx/redirects.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
