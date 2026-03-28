# Nodex plugin migration (author guide)

## Manifest

- Required: `name` (lowercase, hyphens), `version` (semver-style), `type` (`backend` | `ui` | `hybrid`), `main` (Node entry), `mode` (`development` | `production`).
- **Hybrid** plugins (Node + React in iframe): set `type` to `hybrid`, point `main` at your activate file (e.g. `index.js`), and `ui` at a `.jsx` / `.tsx` file. Use `api.getUiBootstrap()` in `render()` to inject compiled/bundled UI.
- **Production** packages: `main` and `ui` should reference `dist/*.bundle.js` after bundling inside Nodex.

## Type vs files

Nodex warns if `type` does not match what it infers from files (e.g. `backend` declared but a root `.jsx` exists). Prefer aligning `type` with reality: backend-only → `backend`; UI + main → `hybrid` (or `ui` if you only ship a UI entry per future rules).

## Dependencies

- Declare npm packages in `package.json` or `manifest.dependencies`.
- Dev/source installs use **`~/.nodex/plugin-cache/<manifest.name>/node_modules`** (Plugin Manager: **Install deps**). Bundling resolves modules from that cache.
- Dev zips exclude `node_modules`; recipients run **Install deps** after import.

## Workers (optional)

- `manifest.workers`: array of paths relative to the plugin root (e.g. `["workers/pdf.worker.mjs"]`). The bundler copies or bundles them under `dist/workers/` for production packages.

## JSX

- Development UI uses **esbuild** (not Babel-on-disk) with React provided via the Nodex iframe bridge. Production UI is built with **Rollup** with `react` / `react-dom` external (globals on `Nodex.React` / `Nodex.ReactDOM`).

## React bridge

- Hooks are delegated to the host React in the Electron renderer; the iframe also emits **`nodex-react-bridge`** postMessages for telemetry/sync. Do not rely on `eval` in plugin code loaded by users.
