import * as fs from "fs";
import * as path from "path";
import { NODEX_PLUGIN_UI_MONACO_URI } from "../shared/nodex-plugin-ui-monaco-uri";

/**
 * Resolve `node_modules/@nodex/plugin-ui` by path only (no `createRequire(__filename)` —
 * webpack main bundle replaces `__filename` with a non-absolute string and breaks createRequire).
 */
function tryResolveNodexPluginUiFromNodeModules(): string | null {
  const roots = new Set<string>();
  roots.add(path.resolve(process.cwd()));
  if (path.isAbsolute(__dirname)) {
    roots.add(path.resolve(__dirname, "..", ".."));
    roots.add(path.resolve(__dirname, "..", "..", ".."));
  }
  for (const root of roots) {
    const dir = path.join(root, "node_modules", "@nodex", "plugin-ui");
    const pkgJson = path.join(dir, "package.json");
    const entry = path.join(dir, "src", "index.ts");
    if (fs.existsSync(pkgJson) && fs.existsSync(entry)) {
      return dir;
    }
  }
  return null;
}

/**
 * Locate `@nodex/plugin-ui`: installed package, then monorepo `packages/nodex-plugin-ui`.
 */
export function resolveNodexPluginUiRoot(): string | null {
  const fromNm = tryResolveNodexPluginUiFromNodeModules();
  if (fromNm) {
    return fromNm;
  }
  const candidates = [
    path.join(process.cwd(), "packages", "nodex-plugin-ui"),
    path.resolve(__dirname, "..", "..", "packages", "nodex-plugin-ui"),
    path.resolve(__dirname, "..", "..", "..", "packages", "nodex-plugin-ui"),
  ];
  for (const c of candidates) {
    const pkg = path.join(c, "package.json");
    if (fs.existsSync(pkg)) {
      return path.resolve(c);
    }
  }
  return null;
}

/** Entry file bundled into plugin UI (esbuild / Rollup). */
export function resolveNodexPluginUiEntry(): string | null {
  const root = resolveNodexPluginUiRoot();
  if (!root) {
    return null;
  }
  const src = path.join(root, "src", "index.ts");
  return fs.existsSync(src) ? src : null;
}

/** URI + file content for Monaco extraLib (must match `paths` in PluginIDE). */
export function resolveNodexPluginUiMonacoLib(): {
  fileName: string;
  content: string;
} | null {
  const entry = resolveNodexPluginUiEntry();
  if (!entry) {
    return null;
  }
  try {
    const content = fs.readFileSync(entry, "utf8");
    return { fileName: NODEX_PLUGIN_UI_MONACO_URI, content };
  } catch {
    return null;
  }
}

export function nodexPluginUiMonacoPathSpecifier(): string {
  return NODEX_PLUGIN_UI_MONACO_URI;
}
