import React from "react";
import { createRoot } from "react-dom/client";

const CATEGORY = "video";

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
    const url = Nodex.assetUrl(rel, root || undefined);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 200,
          gap: 8,
        }}
      >
        <div>
          <button type="button" onClick={clearSource}>
            Choose another file…
          </button>
        </div>
        <video
          src={url}
          controls
          style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 6 }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 13, marginBottom: 12, opacity: 0.85 }}>
        Pick a video from <span style={{ fontFamily: "monospace" }}>assets/</span>{" "}
        or import from your computer.
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
