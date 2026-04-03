# Headless Nodex HTTP API only (no Electron UI in this image).
# Native module: better-sqlite3 is rebuilt for Linux inside the image.

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Transient npm registry failures during image build (common on CI).
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY package.json package-lock.json ./

# postinstall runs electron-rebuild — skip (no Electron in container), then compile sqlite for Node.
RUN npm ci --ignore-scripts \
    && npm rebuild better-sqlite3

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Build bundled marketplace artifacts into dist/plugins (marketplace-index.json + .nodexplugin zips)
RUN npm run build:plugins

# Plugin-authoring guides for Documentation (seeded into workspace SQLite on API startup).
# Placed after build:plugins so editing markdown does not invalidate the heavy plugin build layer.
COPY docs/bundled-plugin-authoring ./docs/bundled-plugin-authoring

ENV NODE_ENV=production
# Listen on all interfaces so `docker run -p` / Compose port mappings work.
ENV HOST=0.0.0.0
ENV PORT=3847

EXPOSE 3847

CMD ["npx", "tsx", "src/nodex-api-server/server.ts"]
