/** Must match `nodex-pdf-worker` handler paths in main-helpers (cmaps / standard_fonts). */
export const PDFJS_CMAP_URL = "nodex-pdf-worker:///cmaps/";
export const PDFJS_STANDARD_FONT_URL = "nodex-pdf-worker:///standard_fonts/";

export const PDFJS_GET_DOCUMENT_BASE = {
  cMapUrl: PDFJS_CMAP_URL,
  standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
  cMapPacked: true,
} as const;
