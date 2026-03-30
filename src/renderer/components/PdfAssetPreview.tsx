import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";

let workerConfigured = false;

function ensurePdfWorker(): void {
  if (workerConfigured || typeof document === "undefined") {
    return;
  }
  workerConfigured = true;
  const base =
    document.baseURI.endsWith("/") || document.baseURI.endsWith("\\")
      ? document.baseURI
      : `${document.baseURI}/`;
  GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", base).href;
}

type Props = {
  assetSrc: string;
};

/**
 * Renders PDF with pdf.js on canvas. Avoids Chromium’s built-in PDF extension
 * (sandboxed renderer), which can throw webpack-related errors for custom-scheme URLs.
 */
export default function PdfAssetPreview({ assetSrc }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    ensurePdfWorker();
    let cancelled = false;

    setLoading(true);
    setErr(null);
    setPdf(null);

    void (async () => {
      try {
        const res = await fetch(assetSrc);
        if (!res.ok) {
          throw new Error(`Could not load PDF (${res.status})`);
        }
        const buf = await res.arrayBuffer();
        const task = getDocument({ data: new Uint8Array(buf) });
        const loaded = await task.promise;
        if (cancelled) {
          await loaded.destroy();
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
      void d?.destroy().catch(() => {
        /* ignore */
      });
    };
  }, [assetSrc]);

  if (err) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-[12px] text-destructive">
        {err}
      </div>
    );
  }

  if (loading || !pdf) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-[12px] text-muted-foreground">
        Loading PDF…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} />
      ))}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
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
    <div className="flex justify-center overflow-auto">
      <canvas
        ref={canvasRef}
        className="max-w-full rounded border border-border shadow-sm"
      />
    </div>
  );
}
