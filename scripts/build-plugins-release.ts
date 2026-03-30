/**
 * Headless production export for plugins under test-inputs/plugins (same bundle + zip
 * logic as PluginLoaderZipExport.exportProductionPackage, without Electron).
 *
 * Usage: from repo root, after `npm ci`
 *   npx tsx scripts/build-plugins-release.ts
 *
 * Env:
 *   PLUGIN_RELEASE_ROOT — default user-pluggins
 *   PLUGIN_RELEASE_OUT  — default out/make/plugins
 *   PLUGIN_RELEASE_ONLY — optional plugin folder name (under root) OR absolute path
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pluginBundler } from "../src/core/plugin-bundler";
import { packageManager } from "../src/core/package-manager";
import type { PluginManifest } from "../src/core/plugin-loader-types";
import { isSafePluginName } from "../src/shared/validators";

function copyPluginProductionAssets(
  pluginPath: string,
  stagingPath: string,
  manifest: PluginManifest,
): void {
  for (const extra of ["README.md", "LICENSE"]) {
    const from = path.join(pluginPath, extra);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(stagingPath, extra));
    }
  }
  if (manifest.assets?.length) {
    for (const a of manifest.assets) {
      const from = path.join(pluginPath, a);
      if (!fs.existsSync(from)) {
        continue;
      }
      const to = path.join(stagingPath, a);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const st = fs.statSync(from);
      if (st.isDirectory()) {
        fs.cpSync(from, to, { recursive: true });
      } else {
        fs.copyFileSync(from, to);
      }
    }
  }
}

async function exportOneDevPlugin(
  devRoot: string,
  outputDir: string,
): Promise<string> {
  const manifestPath = path.join(devRoot, "manifest.json");
  const manifest: PluginManifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  );

  if (!isSafePluginName(manifest.name)) {
    throw new Error(`Invalid plugin name in manifest: ${manifest.name}`);
  }

  if (manifest.mode === "production") {
    return await packageManager.createProductionPackage({
      pluginPath: devRoot,
      outputPath: outputDir,
      mode: "production",
    });
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "nodex-prod-"));
  try {
    const distStaging = path.join(staging, "dist");
    const result = await pluginBundler.bundle(devRoot, {
      distDir: distStaging,
      minify: true,
      sourcemap: true,
      onProgress: (m) => {
        console.log(`[build-plugins-release] ${manifest.name}: ${m}`);
      },
    });

    if (!result.success) {
      throw new Error(result.errors.join("\n"));
    }

    const prodManifest: PluginManifest = {
      ...manifest,
      mode: "production",
      main: result.mainBundle!,
    };
    if (result.uiBundle) {
      prodManifest.ui = result.uiBundle;
    } else {
      delete prodManifest.ui;
    }
    delete prodManifest.dependencies;
    delete prodManifest.devDependencies;

    fs.writeFileSync(
      path.join(staging, "manifest.json"),
      JSON.stringify(prodManifest, null, 2),
    );

    copyPluginProductionAssets(devRoot, staging, manifest);

    return await packageManager.createProductionPackage({
      pluginPath: staging,
      outputPath: outputDir,
      mode: "production",
    });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function npmInstallIfNeeded(pluginDir: string): void {
  const pkg = path.join(pluginDir, "package.json");
  if (!fs.existsSync(pkg)) {
    return;
  }
  const hasLock =
    fs.existsSync(path.join(pluginDir, "package-lock.json")) ||
    fs.existsSync(path.join(pluginDir, "npm-shrinkwrap.json"));
  const preferCi =
    hasLock &&
    (process.env.FORCE_NPM_CI === "1" ||
      process.env.CI === "true" ||
      process.env.GITHUB_ACTIONS === "true");

  const run = (cmd: string) => {
    console.log(`[build-plugins-release] ${cmd} in ${pluginDir}`);
    execSync(cmd, { cwd: pluginDir, stdio: "inherit", env: process.env });
  };

  if (!preferCi) {
    run("npm install");
    return;
  }

  try {
    run("npm ci");
  } catch (e) {
    console.warn(
      `[build-plugins-release] npm ci failed (lockfile out of sync?). Falling back to npm install for ${pluginDir}.`,
    );
    run("npm install");
  }
}

async function main(): Promise<void> {
  const root = path.resolve(
    process.env.PLUGIN_RELEASE_ROOT ?? "user-pluggins",
  );
  const outDir = path.resolve(
    process.env.PLUGIN_RELEASE_OUT ?? "out/make/plugins",
  );
  const only = (process.env.PLUGIN_RELEASE_ONLY ?? "").trim();

  if (!fs.existsSync(root)) {
    console.warn(`[build-plugins-release] Missing ${root}, skipping plugins.`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  const dirs: string[] = [];
  if (only.length > 0) {
    const candidate = path.isAbsolute(only) ? only : path.join(root, only);
    if (!fs.existsSync(path.join(candidate, "manifest.json"))) {
      throw new Error(
        `[build-plugins-release] PLUGIN_RELEASE_ONLY not found or missing manifest.json: ${candidate}`,
      );
    }
    dirs.push(candidate);
  } else {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    dirs.push(
      ...entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => path.join(root, e.name))
        .filter((d) => fs.existsSync(path.join(d, "manifest.json"))),
    );
  }

  if (dirs.length === 0) {
    console.warn(
      `[build-plugins-release] No plugin folders with manifest.json under ${root}`,
    );
    return;
  }

  for (const pluginDir of dirs) {
    npmInstallIfNeeded(pluginDir);
    const out = await exportOneDevPlugin(pluginDir, outDir);
    console.log(`[build-plugins-release] OK ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
