import { TOKENS_CSS_FOR_IFRAME } from "../styles/tokens-raw.generated";

/** postMessage type: sync iframe CSS variables + dark class with host */
export const NODEX_IFRAME_THEME_MESSAGE = "nodex-theme-update" as const;

export function buildIframeThemeCss(inject: boolean): string {
  if (!inject) {
    return "";
  }
  return TOKENS_CSS_FOR_IFRAME;
}
