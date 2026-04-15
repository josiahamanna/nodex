/**
 * Build Content-Security-Policy for the web shell.
 * In production, `connect-src` must include any absolute sync API origin (cross-origin fetch).
 */
function tryOrigin(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) {
    return null;
  }
  try {
    return new URL(t).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(): string {
  const syncOrigin = tryOrigin(process.env.NEXT_PUBLIC_NODEX_SYNC_API_URL);
  const connectParts = [
    "'self'",
    "nodex-pdf-worker:",
    "blob:",
    "https://api.github.com",
    ...(syncOrigin ? [syncOrigin] : []),
  ];
  if (process.env.NODE_ENV !== "production") {
    connectParts.push(
      "ws://localhost:*",
      "ws://127.0.0.1:*",
      "wss://localhost:*",
      "wss://127.0.0.1:*",
      "http://localhost:*",
      "http://127.0.0.1:*",
    );
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "script-src-elem 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: nodex-asset:",
    "media-src 'self' data: blob: nodex-asset:",
    "font-src 'self' data:",
    `connect-src ${connectParts.join(" ")}`,
    "worker-src 'self' blob: nodex-pdf-worker:",
    "frame-src 'self' nodex-asset: blob: data: about: https://observablehq.com https://*.observablehq.com",
    "object-src 'self' nodex-asset: blob: data:",
  ].join("; ");
}
