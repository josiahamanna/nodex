# Plugin runtime: production vs development

This summarizes where plugins live on disk and how the host resolves them. It answers the same questions as the plugins startup spec for contributors.

## Production

- **Bundled core plugins:** Read-only trees shipped with the app (Forge `extraResource` / `Resources/core`). Loaded first by `resolveBundledCorePluginsDir` in main and registered as `bundledCoreRoots` in `PluginLoader`.
- **User-installed runtime:** Prefer `userData/plugins/bin/<pluginId>/` with `manifest.json` and `*.bundle.js` (see `resolvePluginRuntimePath` in `plugin-loader.ts`). This is the normal path for packaged plugins.
- **Optional import:** Zips can be imported into `bin/` via existing import flows (`importFromZip` and related IPC).

## Development

- **Seeded sources:** On first run, sample plugins are copied to `userData/plugins/sources/<name>/` from repo `plugins/<name>/` (see `seed-user-plugins.ts`).
- **External dev roots:** Picking a parent directory in the Plugin IDE registers immediate child folders that contain both `.nodexplugin` and `manifest.json`. Entries are stored in `userData/plugins/ide-external-plugins.json`. Resolution order for a workspace is **sources → external entry → legacy**, via `tryResolvePluginWorkspacePath`.
- **Dependency cache:** `~/.nodex/plugin-cache/<pluginName>/` holds npm installs used when running plugin tooling (`plugin-cache-manager.ts`).
- **Local bundle output:** `bundlePluginLocal` / IDE “Bundle” writes `dist/*.bundle.js` under the plugin workspace; production manifest points at those bundle entry files.

## `.nodexplugin` marker

- Empty file or JSON object is valid. Optional `{ "id": "custom-id" }` overrides the folder name when registering an external root (must not collide with an existing `sources/` id).
