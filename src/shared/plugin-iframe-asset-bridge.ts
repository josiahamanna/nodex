/** postMessage types: sandboxed plugin iframe ↔ host (SecurePluginRenderer). */

export const PLUGIN_IFRAME_ASSET_LIST = "nodex_plugin_iframe_asset_list";
export const PLUGIN_IFRAME_ASSET_PICK = "nodex_plugin_iframe_asset_pick";
export const PLUGIN_IFRAME_ASSET_RESPONSE = "nodex_plugin_iframe_asset_response";

/** Plugin iframe ↔ host: per-PDF bookmarks in host `localStorage`. */
export const PLUGIN_IFRAME_PDF_BOOKMARKS_GET =
  "nodex_plugin_iframe_pdf_bookmarks_get";
export const PLUGIN_IFRAME_PDF_BOOKMARKS_SET =
  "nodex_plugin_iframe_pdf_bookmarks_set";
export const PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE =
  "nodex_plugin_iframe_pdf_bookmarks_response";
