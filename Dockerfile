# syntax=docker/dockerfile:1.7
#
# One container: the PDF renderer (Fastify + headless Chrome) AND the web app, served from the same origin
# (no CORS, no second host). Build:   docker build -t hexadata-spec-editor .
# Run:                                docker run --rm -p 8080:8080 hexadata-spec-editor
#
# Node 26 is required (Vite 8, rolldown, Puppeteer 25 need >= 22.12; the repo pins 26 in .node-version).

ARG NODE_VERSION=26

# ---------------------------------------------------------------- dependencies (all workspaces)
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
# Manifests first, so this layer is cached until a dependency changes.
COPY package.json package-lock.json .puppeteerrc.cjs ./
COPY vendor ./vendor
COPY packages/core/package.json packages/core/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY apps/pdf-server/package.json apps/pdf-server/package.json
COPY apps/web/package.json apps/web/package.json
# The renderer's browser is installed in the runtime stage, not here.
RUN --mount=type=cache,target=/root/.npm PUPPETEER_SKIP_DOWNLOAD=1 npm ci

# ---------------------------------------------------------------- build web + server bundles
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
# Same-origin API: the web app calls /v1/render on the host that served it.
ENV VITE_API_BASE_URL=
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    SERVE_WEB=1 \
    WEB_DIST=/app/apps/web/dist \
    CHROME_NO_SANDBOX=1 \
    LOG_LEVEL=info
WORKDIR /app

# Shared libraries chrome-headless-shell needs, plus tini (reaps zombie Chrome processes) and a base font.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tini ca-certificates fonts-liberation unzip \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 \
      libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
      libxfixes3 libxkbcommon0 libxrandr2 \
 && rm -rf /var/lib/apt/lists/*

# Production dependencies of the PDF server only (the workspace packages are bundled into dist/main.js).
COPY package.json package-lock.json .puppeteerrc.cjs ./
COPY vendor ./vendor
COPY packages/core/package.json packages/core/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY apps/pdf-server/package.json apps/pdf-server/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm PUPPETEER_SKIP_DOWNLOAD=1 npm ci --omit=dev -w @hexadata/spec-pdf-server \
 && npx puppeteer browsers install chrome-headless-shell

COPY --from=build /app/apps/pdf-server/dist ./apps/pdf-server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Run as an unprivileged user.
RUN groupadd --system app && useradd --system --gid app --home-dir /app app \
 && chown -R app:app /app/.cache
USER app

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/pdf-server/dist/main.js"]
