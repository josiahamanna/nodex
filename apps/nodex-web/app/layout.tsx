import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import ClientShellLoader from "./client-shell-loader";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "script-src-elem 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: nodex-asset:",
  "media-src 'self' data: blob: nodex-asset:",
  "font-src 'self' data:",
  "connect-src 'self' nodex-pdf-worker: ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:* blob:",
  "worker-src 'self' blob: nodex-pdf-worker:",
  "frame-src 'self' nodex-asset: blob: data: about:",
  "object-src 'self' nodex-asset: blob: data:",
].join("; ");

export const metadata: Metadata = {
  title: "Nodex",
  description: "Programmable Knowledge System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
      </head>
      <body className="h-full min-h-0" suppressHydrationWarning>
        <ClientShellLoader>
          <div id="root" className="h-full min-h-0">
            {children}
          </div>
        </ClientShellLoader>
      </body>
    </html>
  );
}
