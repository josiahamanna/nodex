import "ses";
import * as React from "react";
import {
  definePlugin,
  type PluginModuleDefinition,
} from "../../../../packages/nodex-plugin-ui/src/index";
import type { PluginHostCapabilities } from "../../../shared/plugin-host-capabilities";

declare global {
  // eslint-disable-next-line no-var
  var Compartment: new (options?: Record<string, unknown>) => {
    evaluate: (src: string) => unknown;
  };
}

export type EvaluateCompiledPluginOptions = {
  /** CommonJS from {@link compilePluginSource} with `format: "cjs"`. */
  cjsCode: string;
  capabilities: PluginHostCapabilities;
};

/**
 * Run trusted CJS plugin bundle inside a SES Compartment (after lockdown).
 * Endowments: `definePlugin`, `React`, `nodex`, mediated `fetch`, `console`, `module`, `exports`.
 */
export function evaluateCompiledPluginInCompartment(
  opts: EvaluateCompiledPluginOptions,
): PluginModuleDefinition {
  const CompartmentCtor = globalThis.Compartment;
  if (typeof CompartmentCtor !== "function") {
    throw new Error("globalThis.Compartment missing; import ses before evaluating plugins.");
  }

  const exportsObj: { default?: PluginModuleDefinition } = {};
  const moduleObj = { exports: exportsObj as Record<string, unknown> };

  const compartment = new CompartmentCtor({
    name: "nodex-plugin-cjs",
    globals: {
      React,
      definePlugin,
      nodex: opts.capabilities.nodex,
      fetch: opts.capabilities.fetch,
      console: {
        log: (...args: unknown[]) => console.log("[plugin]", ...args),
        warn: (...args: unknown[]) => console.warn("[plugin]", ...args),
        error: (...args: unknown[]) => console.error("[plugin]", ...args),
      },
      module: moduleObj,
      exports: exportsObj,
    },
    __options__: true,
  });

  compartment.evaluate(opts.cjsCode);
  const plugin =
    exportsObj.default ??
    (moduleObj.exports as { default?: PluginModuleDefinition }).default;
  if (!plugin || typeof plugin !== "object" || typeof plugin.id !== "string") {
    throw new Error("Plugin bundle must set exports.default = definePlugin({ id, ... })");
  }
  return plugin;
}
