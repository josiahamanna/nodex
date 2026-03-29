import React, { useEffect, useState } from "react";

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
]);

type Props = {
  relativePath: string;
};

export default function AssetPreview({ relativePath }: Props) {
  const [info, setInfo] = useState<{
    name: string;
    ext: string;
    size: number;
    relativePath: string;
  } | null>(null);
  const [loadDone, setLoadDone] = useState(false);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textErr, setTextErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setLoadDone(false);
    setTextBody(null);
    setTextErr(null);
    void (async () => {
      const meta = await window.Nodex.getAssetInfo(relativePath);
      if (cancelled) {
        return;
      }
      setInfo(meta);
      if (!meta) {
        setLoadDone(true);
        return;
      }
      const ext = meta.ext.toLowerCase();
      if (IMAGE_EXT.has(ext)) {
        setLoadDone(true);
        return;
      }
      const tr = await window.Nodex.readAssetText(relativePath);
      if (cancelled) {
        return;
      }
      if (tr.ok) {
        setTextBody(tr.text);
      } else {
        setTextErr(tr.error);
      }
      setLoadDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [relativePath]);

  const openExternal = () => {
    void window.Nodex.openAssetExternal(relativePath);
  };

  if (!loadDone) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <p className="text-[12px] text-muted-foreground">Asset not found.</p>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-1.5 text-[12px] hover:bg-muted/60"
          onClick={openExternal}
        >
          Try open externally
        </button>
      </div>
    );
  }

  const ext = info.ext.toLowerCase();
  const isImage = IMAGE_EXT.has(ext);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{info.name}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            assets/{info.relativePath}
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] hover:bg-muted/60"
          onClick={openExternal}
        >
          Open externally
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isImage ? (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <img
              src={window.Nodex.assetUrl(relativePath)}
              alt={info.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : textBody !== null ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">
            {textBody}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="max-w-md text-[12px] text-muted-foreground">
              {textErr
                ? textErr
                : "No built-in preview for this type. Open it in your default app."}
            </p>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-[12px] hover:bg-muted/60"
              onClick={openExternal}
            >
              Open externally
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
