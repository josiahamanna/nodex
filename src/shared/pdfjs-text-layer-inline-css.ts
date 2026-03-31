/** Minimal subset of pdf.js `pdf_viewer.css` for `.textLayer` (selection + layout). */
export const PDFJS_TEXT_LAYER_INLINE_CSS = `
.nodex-pdf-pageRoot .textLayer {
  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
  transform-origin: 0 0;
  z-index: 1;
  pointer-events: auto;
  user-select: text;
  -webkit-user-select: text;
}
.nodex-pdf-pageRoot .textLayer span,
.nodex-pdf-pageRoot .textLayer br {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0 0;
}
.nodex-pdf-pageRoot .textLayer ::selection {
  background: rgba(0, 0, 255, 0.25);
}
.nodex-pdf-pageRoot .textLayer ::-moz-selection {
  background: rgba(0, 0, 255, 0.25);
}
.nodex-pdf-pageRoot {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.nodex-pdf-pageRoot canvas {
  display: block;
  pointer-events: none;
}
`;
