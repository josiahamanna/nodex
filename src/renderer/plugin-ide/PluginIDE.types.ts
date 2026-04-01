export interface PluginIDEProps {
  onPluginsChanged?: () => void;
  /** VS Code–style shell: menus + file tree live in the primary sidebar. */
  shellLayout?: boolean;
  /** Absolute project folder for preview `nodex-asset` URLs (first workspace root). */
  previewAssetProjectRoot?: string | null;
}
