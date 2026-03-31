import React from "react";
import { createRoot } from "react-dom/client";
import {
  getDocument,
  GlobalWorkerOptions,
  OutputScale,
  RenderingCancelledException,
  TextLayer,
} from "pdfjs-dist";
import { PDFJS_GET_DOCUMENT_BASE } from "../../src/shared/pdfjs-document-options.ts";
import { PDFJS_TEXT_LAYER_INLINE_CSS } from "../../src/shared/pdfjs-text-layer-inline-css.ts";

const CATEGORY = "pdf";

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3.5;

/**
 * pdf.js 4.x `import()`s `GlobalWorkerOptions.workerSrc` for the fake-worker path.
 * Nodex sets `window.__NODEX_PDFJS_WORKER_SRC__` to `nodex-pdf-worker:///…` (main process
 * serves bundled pdf.worker.min.mjs) so packaged Electron avoids `import(blob:)`.
 */
let pdfjsFakeWorkerConfigured = false;
function ensurePdfJsFakeWorker() {
  if (pdfjsFakeWorkerConfigured || typeof document === "undefined") {
    return;
  }
  pdfjsFakeWorkerConfigured = true;
  const src =
    typeof window !== "undefined" && window.__NODEX_PDFJS_WORKER_SRC__
      ? String(window.__NODEX_PDFJS_WORKER_SRC__)
      : "";
  if (!src) {
    console.error(
      "[pdf plugin] __NODEX_PDFJS_WORKER_SRC__ missing; open this note in Nodex.",
    );
    return;
  }
  // Be tolerant of accidental trailing slashes (breaks `import()` for module workers).
  GlobalWorkerOptions.workerSrc = src.replace(/\/+$/, "");
}

/** Mirrors pdf.js `PDFLinkService.goToDestination` page resolution (named dest, ref, 0-based index). */
async function pageNumberFromOutlineDest(pdf, dest) {
  try {
    if (dest == null) {
      return null;
    }
    let explicit = dest;
    if (typeof dest === "string") {
      explicit = await pdf.getDestination(dest);
    } else if (typeof dest?.then === "function") {
      explicit = await dest;
    }
    if (!Array.isArray(explicit) || explicit.length === 0) {
      return null;
    }
    const destRef = explicit[0];
    if (destRef && typeof destRef === "object") {
      const cached = pdf.cachedPageNumber?.(destRef);
      if (cached != null && cached >= 1) {
        return cached;
      }
      const idx = await pdf.getPageIndex(destRef);
      return idx + 1;
    }
    if (Number.isInteger(destRef)) {
      return destRef + 1;
    }
    return null;
  } catch {
    return null;
  }
}

function OutlineList({ pdf, items, depth, onPick }) {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        paddingLeft: depth === 0 ? 0 : 12,
        fontSize: 12,
      }}
    >
      {items.map((item, i) => (
        <li key={`${depth}-${i}`} style={{ marginBottom: 4 }}>
          <button
            type="button"
            onClick={() => {
              if (item.url) {
                return;
              }
              onPick(item);
            }}
            style={{
              textAlign: "left",
              width: "100%",
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: "2px 4px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {item.title || "(untitled)"}
          </button>
          {item.items && item.items.length > 0 ? (
            <OutlineList
              pdf={pdf}
              items={item.items}
              depth={depth + 1}
              onPick={onPick}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function generateBookmarkId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function PdfJsCanvasViewer({ assetHref, assetRel }) {
  const [pdf, setPdf] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [outline, setOutline] = React.useState(null);
  const [savedPlaces, setSavedPlaces] = React.useState([]);
  const [tocOpen, setTocOpen] = React.useState(true);
  const [zoomMode, setZoomMode] = React.useState("fitWidth");
  const [manualScale, setManualScale] = React.useState(1.25);
  const [scale, setScale] = React.useState(1.25);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageInput, setPageInput] = React.useState("1");
  const [page1BaseWidth, setPage1BaseWidth] = React.useState(null);
  const [page1BaseHeight, setPage1BaseHeight] = React.useState(null);
  /** Per-page viewport at scale 1 — used for virtual row placeholders without painting every canvas. */
  const [pageDims, setPageDims] = React.useState(() => ({}));

  const docRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const viewerRootRef = React.useRef(null);
  const pageRefs = React.useRef({});

  const setPageWrapperRef = React.useCallback((pageNum) => (el) => {
    if (el) {
      pageRefs.current[pageNum] = el;
    } else {
      delete pageRefs.current[pageNum];
    }
  }, []);

  React.useEffect(() => {
    ensurePdfJsFakeWorker();
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setPdf(null);
    setOutline(null);
    setPage1BaseWidth(null);
    setPage1BaseHeight(null);
    setPageDims({});

    void (async () => {
      try {
        const res = await fetch(assetHref);
        if (!res.ok) {
          throw new Error(`Could not load PDF (${res.status})`);
        }
        const buf = await res.arrayBuffer();
        const task = getDocument({
          data: new Uint8Array(buf),
          ...PDFJS_GET_DOCUMENT_BASE,
        });
        const loaded = await task.promise;
        if (cancelled) {
          await loaded.destroy().catch(() => {});
          return;
        }
        docRef.current = loaded;
        setPdf(loaded);
        let ol = null;
        try {
          ol = await loaded.getOutline();
        } catch {
          ol = null;
        }
        if (!cancelled) {
          setOutline(ol);
        }
        try {
          const p1 = await loaded.getPage(1);
          const vp = p1.getViewport({ scale: 1 });
          if (!cancelled) {
            setPage1BaseWidth(vp.width);
            setPage1BaseHeight(vp.height);
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const d = docRef.current;
      docRef.current = null;
      void d?.destroy().catch(() => {});
    };
  }, [assetHref]);

  const recomputeFitWidth = React.useCallback(() => {
    if (zoomMode !== "fitWidth" || !page1BaseWidth || !scrollRef.current) {
      return;
    }
    const cw = scrollRef.current.clientWidth - 24;
    if (cw <= 0) {
      return;
    }
    const s = cw / page1BaseWidth;
    setScale(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s)));
  }, [zoomMode, page1BaseWidth]);

  React.useEffect(() => {
    recomputeFitWidth();
  }, [recomputeFitWidth, pdf, zoomMode, page1BaseWidth]);

  React.useEffect(() => {
    if (zoomMode !== "fitWidth") {
      setScale(manualScale);
    }
  }, [manualScale, zoomMode]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pdf) {
      return;
    }
    // ResizeObserver callbacks can fire in the middle of layout; updating React state
    // synchronously here may trigger Chromium's "ResizeObserver loop" warning and
    // webpack-dev-server will surface it as a red overlay. Schedule recompute to the
    // next frame and coalesce rapid resize bursts.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      raf = requestAnimationFrame(() => {
        raf = 0;
        recomputeFitWidth();
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [pdf, recomputeFitWidth]);

  /** Prefetch viewport dimensions only (no canvas) so placeholders match scroll height. */
  React.useEffect(() => {
    if (!pdf) {
      return;
    }
    let cancelled = false;
    const n = pdf.numPages;
    const BATCH = 10;
    void (async () => {
      for (let start = 1; start <= n; start += BATCH) {
        const end = Math.min(n, start + BATCH - 1);
        const chunk = {};
        await Promise.all(
          Array.from({ length: end - start + 1 }, (_, k) => start + k).map(
            async (pageNum) => {
              try {
                const page = await pdf.getPage(pageNum);
                const vp = page.getViewport({ scale: 1 });
                chunk[pageNum] = { w: vp.width, h: vp.height };
              } catch {
                /* skip */
              }
            },
          ),
        );
        if (cancelled) {
          return;
        }
        setPageDims((prev) => ({ ...prev, ...chunk }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const updateCurrentPageFromScroll = React.useCallback(() => {
    const root = scrollRef.current;
    if (!root || !pdf) {
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const yLine = rootRect.top + Math.min(120, rootRect.height * 0.15);
    let best = 1;
    let bestScore = -1;
    for (let i = 1; i <= pdf.numPages; i++) {
      const node = pageRefs.current[i];
      if (!node) {
        continue;
      }
      const r = node.getBoundingClientRect();
      const visibleTop = Math.max(r.top, rootRect.top);
      const visibleBottom = Math.min(r.bottom, rootRect.bottom);
      const visible = Math.max(0, visibleBottom - visibleTop);
      const intersectsLine = r.top <= yLine && r.bottom >= yLine;
      const score = intersectsLine ? visible + 1e6 : visible;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    setCurrentPage(best);
    setPageInput(String(best));
  }, [pdf]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pdf) {
      return;
    }
    const onScroll = () => {
      updateCurrentPageFromScroll();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const t = window.setTimeout(updateCurrentPageFromScroll, 100);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, [pdf, scale, updateCurrentPageFromScroll]);

  const scrollToPage = React.useCallback((num) => {
    const n = Math.max(1, Math.min(pdf?.numPages ?? 1, num));
    const el = pageRefs.current[n];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        setCurrentPage(n);
        setPageInput(String(n));
      }, 400);
    } else {
      setCurrentPage(n);
      setPageInput(String(n));
    }
  }, [pdf]);

  const persistSavedPlaces = React.useCallback(
    async (next) => {
      if (!assetRel || typeof Nodex.savePdfBookmarks !== "function") {
        return;
      }
      try {
        await Nodex.savePdfBookmarks(assetRel, next);
      } catch (e) {
        console.error("[pdf plugin] save bookmarks", e);
      }
    },
    [assetRel],
  );

  React.useEffect(() => {
    if (!assetRel || typeof Nodex.getPdfBookmarks !== "function") {
      setSavedPlaces([]);
      return;
    }
    let cancelled = false;
    void Nodex.getPdfBookmarks(assetRel)
      .then((list) => {
        if (!cancelled && Array.isArray(list)) {
          setSavedPlaces(list);
        }
      })
      .catch((e) => {
        console.error("[pdf plugin] load bookmarks", e);
      });
    return () => {
      cancelled = true;
    };
  }, [assetRel]);

  const addBookmarkAtCurrentPage = React.useCallback(() => {
    if (!assetRel || typeof Nodex.savePdfBookmarks !== "function") {
      return;
    }
    const page = Math.max(1, Math.min(pdf?.numPages ?? 1, currentPage));
    const label = `Page ${page}`;
    setSavedPlaces((prev) => {
      const next = [
        ...prev,
        {
          id: generateBookmarkId(),
          page,
          label,
          createdAt: Date.now(),
        },
      ];
      void persistSavedPlaces(next);
      return next;
    });
  }, [assetRel, pdf?.numPages, currentPage, persistSavedPlaces]);

  const removeBookmark = React.useCallback(
    (id) => {
      setSavedPlaces((prev) => {
        const next = prev.filter((b) => b.id !== id);
        void persistSavedPlaces(next);
        return next;
      });
    },
    [persistSavedPlaces],
  );

  const onOutlinePick = React.useCallback(
    async (item) => {
      if (!pdf || item.url || item.dest == null) {
        return;
      }
      const n = await pageNumberFromOutlineDest(pdf, item.dest);
      if (n != null) {
        scrollToPage(n);
      }
    },
    [pdf, scrollToPage],
  );

  const fullWidthReading = () => {
    setTocOpen(false);
    setZoomMode("fitWidth");
    queueMicrotask(() => recomputeFitWidth());
  };

  const zoomIn = () => {
    setZoomMode("manual");
    setManualScale((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  };

  const zoomOut = () => {
    setZoomMode("manual");
    setManualScale((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  };

  const toggleFullscreen = () => {
    const el = viewerRootRef.current;
    if (!el) {
      return;
    }
    if (!document.fullscreenElement) {
      void el.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen();
    }
  };

  const frameStyle = {
    flex: 1,
    minHeight: 0,
    border: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
    borderRadius: 6,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const toolbarBtn = {
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
    borderRadius: 4,
    border: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
    background: "hsl(var(--background, 0 0% 100%))",
    color: "inherit",
  };

  if (err) {
    return (
      <div
        style={{
          ...frameStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          color: "crimson",
          fontSize: 12,
        }}
      >
        {err}
      </div>
    );
  }

  if (loading || !pdf) {
    return (
      <div
        style={{
          ...frameStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          opacity: 0.75,
        }}
      >
        Loading PDF…
      </div>
    );
  }

  const effectiveScale = zoomMode === "fitWidth" ? scale : manualScale;
  const numPages = pdf.numPages;

  return (
    <div ref={viewerRootRef} style={frameStyle}>
      <style dangerouslySetInnerHTML={{ __html: PDFJS_TEXT_LAYER_INLINE_CSS }} />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
          background: "hsl(var(--muted, 210 20% 96%))",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          style={toolbarBtn}
          onClick={() => setTocOpen((o) => !o)}
          title="Document outline and saved places"
        >
          {tocOpen ? "Hide" : "Show"} sidebar
        </button>
        <span style={{ fontSize: 12, opacity: 0.85 }}>Page</span>
        <button
          type="button"
          style={toolbarBtn}
          onClick={() => scrollToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          Prev
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseInt(pageInput, 10);
              if (!Number.isNaN(n)) {
                scrollToPage(n);
              }
            }
          }}
          style={{
            width: 44,
            padding: "4px 6px",
            fontSize: 12,
            borderRadius: 4,
            border: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
          }}
        />
        <span style={{ fontSize: 12 }}>/ {numPages}</span>
        <button
          type="button"
          style={toolbarBtn}
          onClick={() => scrollToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
        >
          Next
        </button>
        <span style={{ width: 8 }} />
        <button type="button" style={toolbarBtn} onClick={zoomOut}>
          Zoom out
        </button>
        <button type="button" style={toolbarBtn} onClick={zoomIn}>
          Zoom in
        </button>
        <span style={{ fontSize: 11, opacity: 0.8, minWidth: 44 }}>
          {Math.round(effectiveScale * 100)}%
        </span>
        <button
          type="button"
          style={{
            ...toolbarBtn,
            fontWeight: zoomMode === "fitWidth" ? 600 : 400,
          }}
          onClick={() => {
            setZoomMode("fitWidth");
            queueMicrotask(() => recomputeFitWidth());
          }}
        >
          Fit width
        </button>
        <button
          type="button"
          style={toolbarBtn}
          onClick={fullWidthReading}
          title="Hide contents and fit page width to the viewer"
        >
          Full width
        </button>
        <button
          type="button"
          style={toolbarBtn}
          onClick={toggleFullscreen}
          title="Fullscreen viewer"
        >
          Full screen
        </button>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tocOpen &&
        (assetRel || (outline && outline.length > 0)) ? (
          <div
            style={{
              width: 228,
              flexShrink: 0,
              overflow: "auto",
              borderRight: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
              padding: 8,
              fontSize: 12,
              background: "hsl(var(--background, 0 0% 100%))",
            }}
          >
            {outline && outline.length > 0 ? (
              <>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Contents</div>
                <OutlineList
                  pdf={pdf}
                  items={outline}
                  depth={0}
                  onPick={onOutlinePick}
                />
              </>
            ) : null}
            {assetRel && typeof Nodex.getPdfBookmarks === "function" ? (
              <div
                style={{
                  marginTop: outline && outline.length > 0 ? 16 : 0,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Saved places
                </div>
                <button
                  type="button"
                  style={{
                    ...toolbarBtn,
                    width: "100%",
                    marginBottom: 8,
                  }}
                  onClick={addBookmarkAtCurrentPage}
                  title="Save the current page to this list (per PDF file)"
                >
                  Bookmark this page
                </button>
                {savedPlaces.length === 0 ? (
                  <div style={{ opacity: 0.7, fontSize: 11, lineHeight: 1.4 }}>
                    Same file shares this list across notes in this workspace.
                  </div>
                ) : (
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                    }}
                  >
                    {savedPlaces.map((b) => (
                      <li
                        key={b.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginBottom: 6,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => scrollToPage(b.page)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            textAlign: "left",
                            border: "none",
                            background: "transparent",
                            color: "inherit",
                            cursor: "pointer",
                            padding: "4px 6px",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                          title={`Go to page ${b.page}`}
                        >
                          {b.label || `Page ${b.page}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBookmark(b.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "hsl(var(--muted-foreground, 215 16% 47%))",
                            cursor: "pointer",
                            fontSize: 12,
                            padding: "2px 4px",
                          }}
                          title="Remove"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
            padding: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              maxWidth: zoomMode === "fitWidth" ? "100%" : "none",
              margin: "0 auto",
            }}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <VirtualPdfPage
                key={i + 1}
                pdf={pdf}
                pageNumber={i + 1}
                scale={effectiveScale}
                scrollRef={scrollRef}
                pageDims={pageDims}
                page1FallbackHeight={page1BaseHeight}
                page1FallbackWidth={page1BaseWidth}
                setWrapperEl={setPageWrapperRef(i + 1)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const VIRTUAL_PAGE_IO_MARGIN = "280px 0px";

function VirtualPdfPage({
  pdf,
  pageNumber,
  scale,
  scrollRef,
  pageDims,
  page1FallbackHeight,
  page1FallbackWidth,
  setWrapperEl,
}) {
  const [visible, setVisible] = React.useState(false);
  const rowRef = React.useRef(null);

  const d = pageDims[pageNumber];
  const fallbackH =
    page1FallbackHeight != null && page1FallbackHeight > 0
      ? page1FallbackHeight * scale
      : 640 * scale;
  const fallbackW =
    page1FallbackWidth != null && page1FallbackWidth > 0
      ? page1FallbackWidth * scale
      : "100%";
  const ph = d ? d.h * scale : fallbackH;
  const pw = d ? d.w * scale : fallbackW;

  const setCombinedRef = React.useCallback(
    (el) => {
      rowRef.current = el;
      setWrapperEl(el);
    },
    [setWrapperEl],
  );

  React.useLayoutEffect(() => {
    const el = rowRef.current;
    const root = scrollRef?.current;
    if (!el || !root) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        setVisible(!!e?.isIntersecting);
      },
      { root, rootMargin: VIRTUAL_PAGE_IO_MARGIN, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRef, pdf]);

  return (
    <div
      ref={setCombinedRef}
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        minHeight: visible ? undefined : ph,
      }}
    >
      {visible ? (
        <PdfPage
          pdf={pdf}
          pageNumber={pageNumber}
          scale={scale}
          suppressPageRootRef
        />
      ) : (
        <div
          style={{
            width: pw,
            height: ph,
            flexShrink: 0,
            borderRadius: 6,
            background: "hsl(var(--muted, 210 20% 96%))",
            opacity: 0.35,
          }}
          aria-hidden
        />
      )}
    </div>
  );
}

function PdfPage({ pdf, pageNumber, scale, setWrapperEl, suppressPageRootRef }) {
  const canvasRef = React.useRef(null);
  const textLayerRef = React.useRef(null);
  const pageBoxRef = React.useRef(null);
  const renderTaskRef = React.useRef(null);
  const textLayerInstRef = React.useRef(null);

  const setRootRef = React.useCallback(
    (el) => {
      if (!suppressPageRootRef && setWrapperEl) {
        setWrapperEl(el);
      }
    },
    [setWrapperEl, suppressPageRootRef],
  );

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      const pageBox = pageBoxRef.current;
      if (!canvas || !textLayerDiv || !pageBox || cancelled) {
        return;
      }

      const viewport = page.getViewport({ scale });
      const outputScale = new OutputScale();
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        return;
      }

      const w = viewport.width;
      const h = viewport.height;
      const sx = outputScale.sx;
      const sy = outputScale.sy;
      canvas.width = Math.floor(w * sx);
      canvas.height = Math.floor(h * sy);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      pageBox.style.width = `${w}px`;
      pageBox.style.height = `${h}px`;
      pageBox.style.setProperty("--scale-factor", String(viewport.scale));

      const transform = outputScale.scaled ? [sx, 0, 0, sy, 0, 0] : null;

      textLayerDiv.innerHTML = "";
      textLayerInstRef.current?.cancel?.();
      textLayerInstRef.current = null;

      renderTaskRef.current?.cancel?.();
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform,
      });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (e) {
        if (e instanceof RenderingCancelledException) {
          return;
        }
        console.error("[pdf plugin] canvas render", pageNumber, e);
        return;
      } finally {
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      }

      if (cancelled) {
        return;
      }

      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true,
        }),
        container: textLayerDiv,
        viewport,
      });
      textLayerInstRef.current = textLayer;

      try {
        await textLayer.render();
      } catch (e) {
        if (
          e?.name === "AbortException" ||
          e?.name === "RenderingCancelledException"
        ) {
          return;
        }
        console.error("[pdf plugin] text layer", pageNumber, e);
      }
    };

    void run();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel?.();
      } catch {
        /* ignore */
      }
      renderTaskRef.current = null;
      try {
        textLayerInstRef.current?.cancel?.();
      } catch {
        /* ignore */
      }
      textLayerInstRef.current = null;
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div
      ref={setRootRef}
      className="nodex-pdf-pageRoot"
      data-page-num={pageNumber}
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        ref={pageBoxRef}
        style={{
          position: "relative",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            borderRadius: 6,
            border: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        />
        <div ref={textLayerRef} className="textLayer" />
      </div>
    </div>
  );
}

function parseRel(content) {
  try {
    const o = JSON.parse(content || "{}");
    if (o && typeof o.assetRel === "string") {
      return o.assetRel.trim();
    }
  } catch (_) {
    /* ignore */
  }
  return "";
}

function MediaApp() {
  const [rel, setRel] = React.useState(() =>
    parseRel(
      typeof window !== "undefined" ? window.__NODEX_NOTE__?.content : "",
    ),
  );
  const [files, setFiles] = React.useState([]);
  const [listErr, setListErr] = React.useState(null);
  const [pickErr, setPickErr] = React.useState(null);

  React.useEffect(() => {
    Nodex.onMessage = (msg) => {
      if (msg.type === "update" || msg.type === "render") {
        window.__NODEX_NOTE__ = msg.payload;
        setRel(parseRel(msg.payload?.content));
      }
    };
  }, []);

  React.useEffect(() => {
    if (rel) {
      if (Nodex.notifyDisplayReady) {
        Nodex.notifyDisplayReady();
      }
      return;
    }
    let cancelled = false;
    setListErr(null);
    void Nodex.listAssetsByCategory(CATEGORY).then((r) => {
      if (cancelled) {
        return;
      }
      if (!r.ok) {
        setListErr(r.error);
      } else {
        setFiles(r.files);
      }
      if (Nodex.notifyDisplayReady) {
        Nodex.notifyDisplayReady();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rel]);

  const root =
    typeof window !== "undefined" ? window.__NODEX_ASSET_PROJECT_ROOT__ : "";

  const pickExternal = () => {
    setPickErr(null);
    void Nodex.pickImportMediaFile(CATEGORY).then((r) => {
      if (!r.ok) {
        if (r.error !== "cancelled") {
          setPickErr(r.error);
        }
        return;
      }
      Nodex.saveNoteContent(JSON.stringify({ assetRel: r.assetRel }));
      setRel(r.assetRel);
    });
  };

  const choose = (relativePath) => {
    Nodex.saveNoteContent(JSON.stringify({ assetRel: relativePath }));
    setRel(relativePath);
  };

  const clearSource = () => {
    Nodex.saveNoteContent(JSON.stringify({ assetRel: "" }));
    setRel("");
  };

  if (rel) {
    const assetHref = Nodex.assetUrl(rel, root || undefined);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 360,
          gap: 8,
        }}
      >
        <div>
          <button type="button" onClick={clearSource}>
            Choose another file…
          </button>
        </div>
        <PdfJsCanvasViewer assetHref={assetHref} assetRel={rel} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 13, marginBottom: 12, opacity: 0.85 }}>
        Pick a PDF from this project&apos;s{" "}
        <span style={{ fontFamily: "monospace" }}>assets/</span> folder, or
        import one from your computer (copied into{" "}
        <span style={{ fontFamily: "monospace" }}>assets/_imports/</span>).
      </p>
      <div style={{ marginBottom: 12 }}>
        <button type="button" onClick={pickExternal}>
          Add from computer…
        </button>
      </div>
      {pickErr ? (
        <p style={{ color: "crimson", fontSize: 12 }}>{pickErr}</p>
      ) : null}
      {listErr ? (
        <p style={{ fontSize: 12 }}>{listErr}</p>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        {files.map((f) => (
          <button
            key={f.relativePath}
            type="button"
            onClick={() => choose(f.relativePath)}
            style={{
              padding: 8,
              textAlign: "left",
              border: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
              borderRadius: 6,
              background: "hsl(var(--background, 0 0% 100%))",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>{f.name}</div>
            <div
              style={{
                fontSize: 10,
                opacity: 0.7,
                wordBreak: "break-all",
                fontFamily: "monospace",
              }}
            >
              {f.relativePath}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const el = document.getElementById("plugin-root");
if (el) {
  createRoot(el).render(<MediaApp />);
}
