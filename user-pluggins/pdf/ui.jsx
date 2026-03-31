import React from "react";
import { createRoot } from "react-dom/client";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

const CATEGORY = "pdf";

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
  GlobalWorkerOptions.workerSrc = src;
}

function PdfJsCanvasViewer({ assetHref }) {
  const [pdf, setPdf] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const docRef = React.useRef(null);

  React.useEffect(() => {
    ensurePdfJsFakeWorker();
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setPdf(null);

    void (async () => {
      try {
        const res = await fetch(assetHref);
        if (!res.ok) {
          throw new Error(`Could not load PDF (${res.status})`);
        }
        const buf = await res.arrayBuffer();
        const task = getDocument({ data: new Uint8Array(buf) });
        const loaded = await task.promise;
        if (cancelled) {
          await loaded.destroy().catch(() => {});
          return;
        }
        docRef.current = loaded;
        setPdf(loaded);
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

  const frameStyle = {
    flex: 1,
    minHeight: 0,
    border: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
    borderRadius: 6,
    width: "100%",
    overflow: "auto",
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

  return (
    <div style={frameStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 8 }}>
        {Array.from({ length: pdf.numPages }, (_, i) => (
          <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} />
        ))}
      </div>
    </div>
  );
}

function PdfPage({ pdf, pageNumber }) {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas || cancelled) {
        return;
      }
      const viewport = page.getViewport({ scale: 1.35 });
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: ctx, viewport }).promise;
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <div style={{ display: "flex", justifyContent: "center", overflow: "auto" }}>
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: "100%",
          borderRadius: 6,
          border: "1px solid hsl(var(--border, 214.3 31.8% 91.4%))",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        }}
      />
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
        <PdfJsCanvasViewer assetHref={assetHref} />
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
