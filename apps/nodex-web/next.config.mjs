import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticExport = process.env.NODEX_NEXT_STATIC_EXPORT === "1";

const envHeadlessOrigin = process.env.NODEX_HEADLESS_API_ORIGIN?.trim().replace(
  /\/$/,
  "",
);

/**
 * When set, Next proxies /api/v1 and /marketplace/files to the headless API.
 * Root `npm run dev:web` sets NODEX_HEADLESS_API_ORIGIN; in development we
 * default to the same port so `next dev` from apps/nodex-web still rewrites.
 * Docker web image: set NODEX_HEADLESS_API_ORIGIN=http://nodex-api:3847 at build
 * if you hit Next on :3000 without nginx. Prefer nodex-gateway on :8080 with
 * NEXT_PUBLIC_NODEX_API_SAME_ORIGIN=1 (relative /api/v1, no rewrite in Next).
 */
const headlessApiOrigin =
  envHeadlessOrigin ||
  (!staticExport && process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:3847"
    : "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(staticExport ? { output: "export", assetPrefix: "./" } : {}),
  /**
   * Electron and some browsers load `http://127.0.0.1:3000` while dev defaults to `localhost`;
   * without this, Next 16 blocks `/_next/*` dev assets and the app can break or show wrong UI.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@nodex/platform", "rxdb", "dexie"],
  images: { unoptimized: true },
  async rewrites() {
    if (staticExport || !headlessApiOrigin) {
      return [];
    }
    return [
      {
        source: "/api/v1/:path*",
        destination: `${headlessApiOrigin}/api/v1/:path*`,
      },
      {
        source: "/marketplace/files/:path*",
        destination: `${headlessApiOrigin}/marketplace/files/:path*`,
      },
    ];
  },
  experimental: {
    externalDir: true,
  },
  turbopack: {
    resolveAlias: {
      "@nodex/ui-types": "../../src/shared/nodex-preload-public-types.ts",
      "@nodex/platform": "../../packages/nodex-platform/src/index.ts",
      // Next resolves `node` for Client Component SSR; esnode pulls fs/path. Force browser build.
      "broadcast-channel": "../../node_modules/broadcast-channel/dist/esbrowser/index.js",
    },
  },
};

export default nextConfig;
