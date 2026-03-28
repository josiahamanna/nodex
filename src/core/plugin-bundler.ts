import * as fs from "fs";
import * as path from "path";
import * as esbuild from "esbuild";
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import esbuildPlugin from "rollup-plugin-esbuild";
import type { PluginManifest } from "./plugin-loader";
import type { Plugin as EsbuildPlugin } from "esbuild";

export interface BundleOptions {
  minify?: boolean;
  sourcemap?: boolean;
  /** Where to write `main.bundle.js` / `ui.bundle.js` (default: `<pluginPath>/dist`) */
  distDir?: string;
  /** Emit progress lines for logging / IPC */
  onProgress?: (message: string) => void;
}

export interface BundleResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  /** Relative paths from plugin root (or staging root) for manifest */
  mainBundle?: string;
  uiBundle?: string;
}

const REACT_EXTERNALS = ["react", "react-dom", "react-dom/client"] as const;

/** Dev-only: bundle UI for iframe; `react` maps to `window.Nodex.React` at runtime. */
function nodexReactShimPlugins(): EsbuildPlugin {
  return {
    name: "nodex-react-shims",
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({
        path: "virtual:nodex-react",
        namespace: "nodex-shim",
      }));
      build.onResolve({ filter: /^react-dom\/client$/ }, () => ({
        path: "virtual:nodex-rdc",
        namespace: "nodex-shim",
      }));
      build.onLoad({ filter: /.*/, namespace: "nodex-shim" }, (args) => {
        if (args.path === "virtual:nodex-react") {
          return {
            loader: "js",
            contents: `
              const R = typeof window !== "undefined" && window.Nodex && window.Nodex.React
                ? window.Nodex.React
                : {};
              module.exports = R;
              module.exports.default = R;
            `,
          };
        }
        if (args.path === "virtual:nodex-rdc") {
          return {
            loader: "js",
            contents: `
              const RD = typeof window !== "undefined" && window.Nodex && window.Nodex.ReactDOM
                ? window.Nodex.ReactDOM
                : {};
              module.exports = {
                createRoot: function (c) {
                  return RD.createRoot.call(RD, c);
                },
              };
            `,
          };
        }
        return null;
      });
    },
  };
}

function readManifest(pluginPath: string): PluginManifest {
  const raw = fs.readFileSync(
    path.join(pluginPath, "manifest.json"),
    "utf8",
  );
  return JSON.parse(raw) as PluginManifest;
}

export class PluginBundler {
  /**
   * Synchronous UI bundle for development iframe (no Rollup). React comes from Nodex bridge.
   */
  bundleUiForDevIframe(pluginPath: string, uiRelative: string, minify = false): string {
    const uiEntry = path.join(pluginPath, uiRelative);
    if (!fs.existsSync(uiEntry)) {
      throw new Error(`UI entry not found: ${uiRelative}`);
    }

    const result = esbuild.buildSync({
      absWorkingDir: pluginPath,
      entryPoints: [uiEntry],
      bundle: true,
      platform: "browser",
      format: "iife",
      write: false,
      minify,
      jsx: "transform",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      plugins: [nodexReactShimPlugins()],
      logLevel: "silent",
    });

    if (!result.outputFiles?.length) {
      throw new Error("UI bundle produced no output");
    }

    return result.outputFiles[0].text;
  }

  /**
   * Bundle plugin backend (esbuild) and optional UI (Rollup + esbuild transform).
   * React / ReactDOM are external and expected as `Nodex.React` / `Nodex.ReactDOM` in the iframe.
   */
  async bundle(pluginPath: string, options: BundleOptions = {}): Promise<BundleResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const minify = options.minify !== false;
    const sourcemap = options.sourcemap !== false;
    const distDir = options.distDir ?? path.join(pluginPath, "dist");
    const progress = options.onProgress ?? (() => {});

    let manifest: PluginManifest;
    try {
      manifest = readManifest(pluginPath);
    } catch (e) {
      return {
        success: false,
        errors: [
          e instanceof Error ? e.message : "Failed to read manifest.json",
        ],
        warnings,
      };
    }

    fs.mkdirSync(distDir, { recursive: true });

    const mainEntry = path.join(pluginPath, manifest.main);
    if (!fs.existsSync(mainEntry)) {
      return {
        success: false,
        errors: [`Backend entry not found: ${manifest.main}`],
        warnings,
      };
    }

    const mainOut = path.join(distDir, "main.bundle.js");
    const bundleRoot = path.dirname(distDir);
    progress("Bundling backend (esbuild)…");

    try {
      await esbuild.build({
        absWorkingDir: pluginPath,
        entryPoints: [mainEntry],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: mainOut,
        minify,
        sourcemap,
        logLevel: "silent",
        external: ["electron"],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`esbuild (main): ${msg}`);
      return { success: false, errors, warnings };
    }

    const mainRelative = path
      .relative(bundleRoot, mainOut)
      .split(path.sep)
      .join("/");
    let uiRelative: string | undefined;

    if (manifest.ui) {
      const uiEntry = path.join(pluginPath, manifest.ui);
      if (!fs.existsSync(uiEntry)) {
        return {
          success: false,
          errors: [`UI entry not found: ${manifest.ui}`],
          warnings,
        };
      }

      const uiOut = path.join(distDir, "ui.bundle.js");
      progress("Bundling frontend (Rollup)…");

      try {
        const bundle = await rollup({
          input: uiEntry,
          external: [...REACT_EXTERNALS],
          plugins: [
            nodeResolve({
              extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
              preferBuiltins: false,
            }),
            commonjs(),
            esbuildPlugin({
              include: /\.[jt]sx?$/,
              minify,
              sourceMap: sourcemap,
              jsx: "transform",
              jsxFactory: "React.createElement",
              jsxFragment: "React.Fragment",
              target: "es2020",
            }),
          ],
          onwarn: (w) => {
            warnings.push(
              `${w.code ?? "warn"}: ${w.message}${w.loc ? ` (${w.loc.file})` : ""}`,
            );
          },
        });

        await bundle.write({
          file: uiOut,
          format: "iife",
          sourcemap,
          globals: {
            react: "Nodex.React",
            "react-dom": "Nodex.ReactDOM",
            "react-dom/client": "Nodex.ReactDOM",
          },
        });
        await bundle.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`rollup (ui): ${msg}`);
        return { success: false, errors, warnings };
      }

      uiRelative = path.relative(bundleRoot, uiOut).split(path.sep).join("/");
    }

    progress("Bundle complete.");
    return {
      success: true,
      errors,
      warnings,
      mainBundle: mainRelative,
      uiBundle: uiRelative,
    };
  }
}

export const pluginBundler = new PluginBundler();
