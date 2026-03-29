import * as fs from "fs";
import * as path from "path";
import { NODEX_PLUGIN_UI_MONACO_URI } from "../shared/nodex-plugin-ui-monaco-uri";

/**
 * Locate `packages/nodex-plugin-ui` from repo cwd (Forge dev) or relative to
 * compiled main output.
 */
export function resolveNodexPluginUiRoot(): string | null {
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
