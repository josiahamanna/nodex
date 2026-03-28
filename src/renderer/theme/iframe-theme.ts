import tokensRaw from "../styles/tokens.css?raw";

/** postMessage type: sync iframe CSS variables + dark class with host */
export const NODEX_IFRAME_THEME_MESSAGE = "nodex-theme-update" as const;

export function buildIframeThemeCss(inject: boolean): string {
  if (!inject) {
    return "";
  }
  return tokensRaw;
}
