export type PluginMode = "development" | "production";
export type PluginType = "ui" | "backend" | "hybrid";

export type Permission =
  | "storage.read"
  | "storage.write"
  | "db.read"
  | "db.write"
  | "fs.read"
  | "fs.write"
  | "network.http"
  | "ui.panel"
  | "ui.toolbar";

export interface NetworkConfig {
  whitelist?: string[];
  requestApproval?: boolean;
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
  };
}

export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  main: string;
  mode: PluginMode;

  displayName?: string;
  description?: string;
  author?: string;
  license?: string;
  ui?: string;
  html?: string;
  rootId?: string;
  noteTypes?: string[];
  permissions?: Permission[];
  activationEvents?: string[];
  icon?: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  assets?: string[];
  workers?: string[];
  network?: NetworkConfig;
  theme?: "inherit" | "isolated";
  designSystemVersion?: string;
  deferDisplayUntilContentReady?: boolean;
}

export interface NodexAPI {
  ui: {
    registerComponent: (type: string, componentCode: string) => void;
  };
}

export interface Plugin {
  activate?: (Nodex: NodexAPI) => void;
  deactivate?: () => void;
}
