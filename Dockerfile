# Headless Nodex HTTP API only (no Electron UI in this image).

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Transient npm registry failures during image build (common on CI).
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY package.json package-lock.json ./

# Skip postinstall (electron-rebuild); headless API has no Electron native addons required at runtime.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Build bundled marketplace artifacts into dist/plugins (marketplace-index.json + .nodexplugin zips)
RUN npm run build:plugins

# Plugin-authoring guides for Documentation (seeded into workspace JSON on API startup).
# Placed after build:plugins so editing markdown does not invalidate the heavy plugin build layer.
COPY docs/bundled-plugin-authoring ./docs/bundled-plugin-authoring

ENV NODE_ENV=production
# Listen on all interfaces so `docker run -p` / Compose port mappings work.
ENV HOST=0.0.0.0
ENV PORT=3847

EXPOSE 3847

CMD ["npx", "tsx", "src/nodex-api-server/server.ts"]
