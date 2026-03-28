import Ajv, { type ValidateFunction } from "ajv";
import * as fs from "fs";
import * as path from "path";
import {
  PluginManifest,
  PluginMode,
  PluginType,
  Permission,
} from "./plugin-loader";
import { MANIFEST_JSON_SCHEMA } from "./manifest-schema";

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function inferPluginTypeFromDisk(
  pluginPath: string,
  manifest: PluginManifest,
): PluginType {
  const mainPath = path.join(pluginPath, manifest.main);
  const mainOk = fs.existsSync(mainPath);

  const uiOk =
    Boolean(manifest.ui) && fs.existsSync(path.join(pluginPath, manifest.ui!));
  const htmlOk =
    Boolean(manifest.html) &&
    fs.existsSync(path.join(pluginPath, manifest.html!));

  let looseJsx = false;
  try {
    const entries = fs.readdirSync(pluginPath, { withFileTypes: true });
    const mainBase = path.basename(manifest.main);
    for (const e of entries) {
      if (!e.isFile()) {
        continue;
      }
      if (/\.(jsx|tsx)$/.test(e.name) && e.name !== mainBase) {
        looseJsx = true;
        break;
      }
    }
  } catch {
    /* ignore */
  }

  const hasFrontendHint = uiOk || htmlOk || looseJsx;
  if (hasFrontendHint && mainOk) {
    return "hybrid";
  }
  if (hasFrontendHint) {
    return "ui";
  }
  return "backend";
}

export class ManifestValidator {
  private readonly ajvValidate: ValidateFunction;

  constructor() {
    const ajv = new Ajv({ allErrors: true, strict: false });
    this.ajvValidate = ajv.compile(MANIFEST_JSON_SCHEMA as object);
  }

  /**
   * Schema + rules + on-disk type inference (Epic 1.1 / 1.4).
   */
  validateForLoad(manifest: any, pluginPath: string): ValidationResult {
    const base = this.validate(manifest);
    if (!base.valid) {
      return base;
    }
    const warnings = [...base.warnings];
    try {
      const inferred = inferPluginTypeFromDisk(
        pluginPath,
        manifest as PluginManifest,
      );
      if (manifest.type && inferred !== manifest.type) {
        warnings.push({
          field: "type",
          message: `Declared type "${manifest.type}" but project layout suggests "${inferred}". See sprints/PLUGIN_MIGRATION.md.`,
          severity: "warning",
        });
      }
    } catch (e) {
      warnings.push({
        field: "type",
        message: `Could not infer type from disk: ${e instanceof Error ? e.message : String(e)}`,
        severity: "warning",
      });
    }
    return { ...base, warnings };
  }

  validate(manifest: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const schemaOk = this.ajvValidate(manifest);
    if (!schemaOk && this.ajvValidate.errors) {
      for (const err of this.ajvValidate.errors) {
        const field =
          err.instancePath && err.instancePath.length > 0
            ? err.instancePath.replace(/^\//, "").replace(/\//g, ".")
            : "manifest";
        errors.push({
          field,
          message: err.message ?? "JSON Schema validation failed",
          severity: "error",
        });
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // Validate required fields
    this.validateRequired(manifest, errors);

    // Validate field types
    this.validateTypes(manifest, errors);

    // Validate field values
    this.validateValues(manifest, errors, warnings);

    // Validate field combinations
    this.validateCombinations(manifest, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateRequired(manifest: any, errors: ValidationError[]): void {
    const requiredFields = ["name", "version", "type", "main", "mode"];

    for (const field of requiredFields) {
      if (!manifest[field]) {
        errors.push({
          field,
          message: `Required field '${field}' is missing`,
          severity: "error",
        });
      }
    }
  }

  private validateTypes(manifest: any, errors: ValidationError[]): void {
    // Validate string fields
    const stringFields = [
      "name",
      "version",
      "type",
      "main",
      "mode",
      "displayName",
      "description",
      "author",
      "license",
      "ui",
      "html",
      "rootId",
      "icon",
    ];

    for (const field of stringFields) {
      if (
        manifest[field] !== undefined &&
        typeof manifest[field] !== "string"
      ) {
        errors.push({
          field,
          message: `Field '${field}' must be a string`,
          severity: "error",
        });
      }
    }

    // Validate array fields
    if (
      manifest.noteTypes !== undefined &&
      !Array.isArray(manifest.noteTypes)
    ) {
      errors.push({
        field: "noteTypes",
        message: "Field 'noteTypes' must be an array",
        severity: "error",
      });
    }

    if (
      manifest.permissions !== undefined &&
      !Array.isArray(manifest.permissions)
    ) {
      errors.push({
        field: "permissions",
        message: "Field 'permissions' must be an array",
        severity: "error",
      });
    }

    if (
      manifest.activationEvents !== undefined &&
      !Array.isArray(manifest.activationEvents)
    ) {
      errors.push({
        field: "activationEvents",
        message: "Field 'activationEvents' must be an array",
        severity: "error",
      });
    }

    if (manifest.assets !== undefined && !Array.isArray(manifest.assets)) {
      errors.push({
        field: "assets",
        message: "Field 'assets' must be an array",
        severity: "error",
      });
    }

    if (manifest.workers !== undefined && !Array.isArray(manifest.workers)) {
      errors.push({
        field: "workers",
        message: "Field 'workers' must be an array of file paths",
        severity: "error",
      });
    }

    // Validate object fields
    if (
      manifest.engines !== undefined &&
      typeof manifest.engines !== "object"
    ) {
      errors.push({
        field: "engines",
        message: "Field 'engines' must be an object",
        severity: "error",
      });
    }

    if (
      manifest.dependencies !== undefined &&
      typeof manifest.dependencies !== "object"
    ) {
      errors.push({
        field: "dependencies",
        message: "Field 'dependencies' must be an object",
        severity: "error",
      });
    }

    if (
      manifest.devDependencies !== undefined &&
      typeof manifest.devDependencies !== "object"
    ) {
      errors.push({
        field: "devDependencies",
        message: "Field 'devDependencies' must be an object",
        severity: "error",
      });
    }

    if (
      manifest.network !== undefined &&
      typeof manifest.network !== "object"
    ) {
      errors.push({
        field: "network",
        message: "Field 'network' must be an object",
        severity: "error",
      });
    }
  }

  private validateValues(
    manifest: any,
    errors: ValidationError[],
    warnings: ValidationError[],
  ): void {
    // Validate name format
    if (manifest.name && !/^[a-z0-9-]+$/.test(manifest.name)) {
      errors.push({
        field: "name",
        message: "Plugin name must be lowercase alphanumeric with hyphens only",
        severity: "error",
      });
    }

    // Validate version format (semantic versioning)
    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push({
        field: "version",
        message: "Version must follow semantic versioning (e.g., 1.0.0)",
        severity: "error",
      });
    }

    // Validate type
    const validTypes: PluginType[] = ["ui", "backend", "hybrid"];
    if (manifest.type && !validTypes.includes(manifest.type)) {
      errors.push({
        field: "type",
        message: `Plugin type must be one of: ${validTypes.join(", ")}`,
        severity: "error",
      });
    }

    // Validate mode
    const validModes: PluginMode[] = ["development", "production"];
    if (manifest.mode && !validModes.includes(manifest.mode)) {
      errors.push({
        field: "mode",
        message: `Plugin mode must be one of: ${validModes.join(", ")}`,
        severity: "error",
      });
    }

    // Validate permissions
    const validPermissions: Permission[] = [
      "storage.read",
      "storage.write",
      "db.read",
      "db.write",
      "fs.read",
      "fs.write",
      "network.http",
      "ui.panel",
      "ui.toolbar",
    ];

    if (manifest.permissions && Array.isArray(manifest.permissions)) {
      for (const permission of manifest.permissions) {
        if (!validPermissions.includes(permission)) {
          errors.push({
            field: "permissions",
            message: `Invalid permission: ${permission}. Valid permissions: ${validPermissions.join(", ")}`,
            severity: "error",
          });
        }
      }
    }

    // Validate file extensions
    if (manifest.main) {
      if (
        manifest.mode === "development" &&
        !manifest.main.endsWith(".js") &&
        !manifest.main.endsWith(".ts")
      ) {
        warnings.push({
          field: "main",
          message: "Development mode backend should use .js or .ts extension",
          severity: "warning",
        });
      }
      if (
        manifest.mode === "production" &&
        !manifest.main.endsWith(".bundle.js")
      ) {
        warnings.push({
          field: "main",
          message: "Production mode backend should use .bundle.js extension",
          severity: "warning",
        });
      }
    }

    if (manifest.ui) {
      if (
        manifest.mode === "development" &&
        !manifest.ui.endsWith(".jsx") &&
        !manifest.ui.endsWith(".tsx")
      ) {
        warnings.push({
          field: "ui",
          message: "Development mode frontend should use .jsx or .tsx extension",
          severity: "warning",
        });
      }
      if (
        manifest.mode === "production" &&
        !manifest.ui.endsWith(".bundle.js")
      ) {
        warnings.push({
          field: "ui",
          message: "Production mode frontend should use .bundle.js extension",
          severity: "warning",
        });
      }
    }

    // Validate dependencies only in development mode
    if (manifest.mode === "production") {
      if (manifest.dependencies) {
        warnings.push({
          field: "dependencies",
          message:
            "Production mode should not have dependencies (they should be bundled)",
          severity: "warning",
        });
      }
      if (manifest.devDependencies) {
        warnings.push({
          field: "devDependencies",
          message: "Production mode should not have devDependencies",
          severity: "warning",
        });
      }
    }

    // Validate network configuration
    if (manifest.network) {
      if (
        manifest.network.whitelist &&
        !Array.isArray(manifest.network.whitelist)
      ) {
        errors.push({
          field: "network.whitelist",
          message: "Network whitelist must be an array of URLs",
          severity: "error",
        });
      }

      if (
        manifest.network.requestApproval !== undefined &&
        typeof manifest.network.requestApproval !== "boolean"
      ) {
        errors.push({
          field: "network.requestApproval",
          message: "Network requestApproval must be a boolean",
          severity: "error",
        });
      }

      if (manifest.network.rateLimit) {
        if (
          manifest.network.rateLimit.requestsPerMinute !== undefined &&
          typeof manifest.network.rateLimit.requestsPerMinute !== "number"
        ) {
          errors.push({
            field: "network.rateLimit.requestsPerMinute",
            message: "Rate limit requestsPerMinute must be a number",
            severity: "error",
          });
        }

        if (
          manifest.network.rateLimit.requestsPerHour !== undefined &&
          typeof manifest.network.rateLimit.requestsPerHour !== "number"
        ) {
          errors.push({
            field: "network.rateLimit.requestsPerHour",
            message: "Rate limit requestsPerHour must be a number",
            severity: "error",
          });
        }
      }
    }
  }

  private validateCombinations(manifest: any, errors: ValidationError[]): void {
    // UI plugins must have ui field
    if (
      (manifest.type === "ui" || manifest.type === "hybrid") &&
      !manifest.ui
    ) {
      errors.push({
        field: "ui",
        message: "UI and hybrid plugins must specify a 'ui' field",
        severity: "error",
      });
    }

    // Can't have both html and rootId
    if (manifest.html && manifest.rootId) {
      errors.push({
        field: "html",
        message: "Cannot specify both 'html' and 'rootId' - choose one",
        severity: "error",
      });
    }

    // If html is specified, it should be for UI plugins
    if (manifest.html && manifest.type === "backend") {
      errors.push({
        field: "html",
        message: "Backend plugins don't need an 'html' field",
        severity: "error",
      });
    }

    // Network permission required for network config
    if (
      manifest.network &&
      (!manifest.permissions || !manifest.permissions.includes("network.http"))
    ) {
      errors.push({
        field: "network",
        message: "Network configuration requires 'network.http' permission",
        severity: "error",
      });
    }
  }

  formatErrors(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.errors.length > 0) {
      lines.push("Validation Errors:");
      for (const error of result.errors) {
        lines.push(`  - [${error.field}] ${error.message}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push("\nValidation Warnings:");
      for (const warning of result.warnings) {
        lines.push(`  - [${warning.field}] ${warning.message}`);
      }
    }

    return lines.join("\n");
  }
}

export const manifestValidator = new ManifestValidator();
