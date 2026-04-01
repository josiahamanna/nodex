import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Note } from "../../../preload";
import { MessageType, PluginMessage } from "../../../shared/plugin-api";
import {
  isPluginUiSnapshotMessage,
  PLUGIN_UI_METADATA_KEY,
  PLUGIN_UI_PROTOCOL_VERSION,
} from "../../../shared/plugin-state-protocol";
import { attachReactToPluginWindow } from "../../../shared/react-bridge";
import { VIDEO_JS_IFRAME_CSS } from "../../../shared/video-js-iframe-css";
import { attachVideoJsToPluginWindow } from "../../../shared/videojs-bridge";
import { useTheme } from "../../theme/ThemeContext";
import type { AppDispatch } from "../../store";
import {
  saveNoteContent,
  saveNotePluginUiState,
} from "../../store/notesSlice";
import { receiveSnapshot } from "../../store/pluginUiSlice";
import {
  buildIframeThemeCss,
  NODEX_IFRAME_THEME_MESSAGE,
} from "../../theme/iframe-theme";
import { isAssetMediaCategory } from "../../../shared/asset-media";
import {
  PLUGIN_IFRAME_ASSET_LIST,
  PLUGIN_IFRAME_ASSET_PICK,
  PLUGIN_IFRAME_ASSET_RESPONSE,
  PLUGIN_IFRAME_PDF_BOOKMARKS_GET,
  PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
  PLUGIN_IFRAME_PDF_BOOKMARKS_SET,
} from "../../../shared/plugin-iframe-asset-bridge";
import {
  isSafePdfAssetRel,
  normalizePdfBookmarksPayload,
  pdfBookmarksStorageKey,
  serializePdfBookmarks,
  validatePdfBookmarksJsonSize,
} from "../../../shared/pdf-bookmarks-storage";
import { NODEX_PDF_WORKER_PROTOCOL_URL } from "../../../shared/nodex-pdf-worker-url";

interface SecurePluginRendererProps {
  note: Note;
  /** When false, plugin saves (body + plugin UI state) are not sent to the main notes store. Use for IDE preview with synthetic note ids. */
  persistToNotesStore?: boolean;
  /** Absolute project folder for this note’s `assets/` (multi-root); drives iframe assetUrl + list/import bridge. */
  assetProjectRoot?: string | null;
}

const BRIDGE_REQUEST = "nodex-request-bridge";
const BRIDGE_READY = "nodex-bridge-ready";

/**
 * Single `connect-src` for plugin sandbox (`about:srcdoc`). Must not append a second `connect-src`
 * in dev — Chromium ignores duplicates and leaves only the first, blocking localhost/webpack.
 */
const PLUGIN_IFRAME_CSP_CONNECT_SRC =
  process.env.NODE_ENV === "development"
    ? "connect-src nodex-pdf-worker: blob: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*"
    : "connect-src nodex-pdf-worker: blob:";

/** Chromium built-in PDF viewer nests extension frames (same ID as Chrome). */
const PLUGIN_IFRAME_CSP_PDF_FRAME =
  " chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/";

const SecurePluginRenderer: React.FC<SecurePluginRendererProps> = ({
  note,
  persistToNotesStore = true,
  assetProjectRoot = null,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const assetProjectRootRef = useRef<string | null>(assetProjectRoot);
  assetProjectRootRef.current = assetProjectRoot;
  const [isReady, setIsReady] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [deferDisplay, setDeferDisplay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolvedDark } = useTheme();
  const inheritThemeRef = useRef(true);
  const deferDisplayRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteContentPersistTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  /** Latest pending body save (survives until flush or debounce fires). */
  const pendingNoteContentRef = useRef<{
    noteId: string;
    content: string;
  } | null>(null);
  /**
   * Note identity (`type:id`) last handled by UPDATE. When the user switches notes,
   * `isReady` can still be true until async iframe reload finishes; sending UPDATE
   * to the *old* plugin (e.g. TipTap) with the *new* note body treats markdown as
   * HTML, corrupts it, and debounced save persists the garbage. Skip UPDATE on
   * identity change — READY already sends RENDER for the new note.
   */
  const prevNoteKeyForUpdateRef = useRef<string | null>(null);

  const sendMessageToPlugin = useCallback((message: PluginMessage) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, "*");
    }
  }, []);

  const schedulePluginUiPersist = useCallback(
    (noteId: string, state: unknown) => {
      dispatch(receiveSnapshot({ noteId, state }));
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        void dispatch(saveNotePluginUiState({ noteId, state }));
      }, 400);
    },
    [dispatch],
  );

  const flushPendingNoteContent = useCallback(() => {
    if (noteContentPersistTimerRef.current) {
      clearTimeout(noteContentPersistTimerRef.current);
      noteContentPersistTimerRef.current = null;
    }
    const pending = pendingNoteContentRef.current;
    pendingNoteContentRef.current = null;
    if (pending) {
      void dispatch(saveNoteContent(pending));
    }
  }, [dispatch]);

  const scheduleNoteContentPersist = useCallback(
    (noteId: string, content: string) => {
      pendingNoteContentRef.current = { noteId, content };
      if (noteContentPersistTimerRef.current) {
        clearTimeout(noteContentPersistTimerRef.current);
      }
      noteContentPersistTimerRef.current = setTimeout(() => {
        noteContentPersistTimerRef.current = null;
        const p = pendingNoteContentRef.current;
        pendingNoteContentRef.current = null;
        if (p) {
          void dispatch(saveNoteContent(p));
        }
      }, 400);
    },
    [dispatch],
  );

  useEffect(() => {
    return () => {
      flushPendingNoteContent();
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [flushPendingNoteContent]);

  useEffect(() => {
    flushPendingNoteContent();
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, [note.id, flushPendingNoteContent]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin || event.source !== iframeWin) {
        return;
      }

      if (event.data?.type === BRIDGE_REQUEST) {
        attachReactToPluginWindow(iframeWin);
        attachVideoJsToPluginWindow(iframeWin);
        iframeWin.postMessage({ type: BRIDGE_READY }, "*");
        return;
      }

      if (isPluginUiSnapshotMessage(event.data)) {
        if (persistToNotesStore) {
          schedulePluginUiPersist(noteRef.current.id, event.data.state);
        }
        return;
      }

      if (event.data?.type === MessageType.CONTENT_READY) {
        setContentReady(true);
        return;
      }

      if (event.data?.type === MessageType.SAVE_NOTE_CONTENT) {
        if (persistToNotesStore) {
          const raw = event.data as { content?: unknown };
          if (typeof raw.content === "string") {
            scheduleNoteContentPersist(noteRef.current.id, raw.content);
          }
        }
        return;
      }

      const assetData = event.data as {
        type?: string;
        requestId?: string;
        category?: string;
      };
      if (assetData?.type === PLUGIN_IFRAME_ASSET_LIST && assetData.requestId) {
        const reqId = assetData.requestId;
        const catRaw = assetData.category;
        if (!isAssetMediaCategory(catRaw)) {
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_ASSET_RESPONSE,
              requestId: reqId,
              ok: false,
              error: "Invalid category",
            },
            "*",
          );
          return;
        }
        const root = assetProjectRootRef.current;
        void window.Nodex.listAssetsByCategory(catRaw, root ?? undefined).then(
          (r) => {
            iframeWin.postMessage(
              {
                type: PLUGIN_IFRAME_ASSET_RESPONSE,
                requestId: reqId,
                ...r,
              },
              "*",
            );
          },
        );
        return;
      }
      if (assetData?.type === PLUGIN_IFRAME_ASSET_PICK && assetData.requestId) {
        const reqId = assetData.requestId;
        const catRaw = assetData.category;
        if (!isAssetMediaCategory(catRaw)) {
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_ASSET_RESPONSE,
              requestId: reqId,
              ok: false,
              error: "Invalid category",
            },
            "*",
          );
          return;
        }
        const root = assetProjectRootRef.current;
        void window.Nodex.pickImportMediaFile(catRaw, root ?? undefined).then(
          (r) => {
            iframeWin.postMessage(
              {
                type: PLUGIN_IFRAME_ASSET_RESPONSE,
                requestId: reqId,
                ...r,
              },
              "*",
            );
          },
        );
        return;
      }

      const pdfBm = event.data as {
        type?: string;
        requestId?: string;
        assetRel?: unknown;
        bookmarks?: unknown;
      };
      if (
        pdfBm?.type === PLUGIN_IFRAME_PDF_BOOKMARKS_GET &&
        typeof pdfBm.requestId === "string"
      ) {
        const reqId = pdfBm.requestId;
        const rel = pdfBm.assetRel;
        if (!isSafePdfAssetRel(rel)) {
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
              requestId: reqId,
              ok: false,
              error: "Invalid asset path",
            },
            "*",
          );
          return;
        }
        const root = assetProjectRootRef.current ?? "";
        const key = pdfBookmarksStorageKey(root, rel);
        try {
          const raw = window.localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : [];
          const bookmarks = normalizePdfBookmarksPayload(parsed);
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
              requestId: reqId,
              ok: true,
              bookmarks,
            },
            "*",
          );
        } catch (e) {
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
              requestId: reqId,
              ok: false,
              error: e instanceof Error ? e.message : "Failed to load bookmarks",
            },
            "*",
          );
        }
        return;
      }
      if (
        pdfBm?.type === PLUGIN_IFRAME_PDF_BOOKMARKS_SET &&
        typeof pdfBm.requestId === "string"
      ) {
        const reqId = pdfBm.requestId;
        const rel = pdfBm.assetRel;
        if (!isSafePdfAssetRel(rel)) {
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
              requestId: reqId,
              ok: false,
              error: "Invalid asset path",
            },
            "*",
          );
          return;
        }
        const bookmarks = normalizePdfBookmarksPayload(pdfBm.bookmarks);
        const json = serializePdfBookmarks(bookmarks);
        const sizeErr = validatePdfBookmarksJsonSize(json);
        if (sizeErr) {
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
              requestId: reqId,
              ok: false,
              error: sizeErr,
            },
            "*",
          );
          return;
        }
        const root = assetProjectRootRef.current ?? "";
        const key = pdfBookmarksStorageKey(root, rel);
        try {
          window.localStorage.setItem(key, json);
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
              requestId: reqId,
              ok: true,
            },
            "*",
          );
        } catch (e) {
          iframeWin.postMessage(
            {
              type: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
              requestId: reqId,
              ok: false,
              error: e instanceof Error ? e.message : "Failed to save bookmarks",
            },
            "*",
          );
        }
        return;
      }

      const message: PluginMessage = event.data;

      switch (message.type) {
        case MessageType.READY: {
          setIsReady(true);
          if (!deferDisplayRef.current) {
            setContentReady(true);
          }
          const n = noteRef.current;
          sendMessageToPlugin({
            type: MessageType.RENDER,
            payload: n,
          });
          const ui = n.metadata?.[PLUGIN_UI_METADATA_KEY];
          if (ui !== undefined) {
            sendMessageToPlugin({
              type: MessageType.HYDRATE_PLUGIN_UI,
              payload: {
                v: PLUGIN_UI_PROTOCOL_VERSION,
                state: ui,
              },
            });
          }
          break;
        }

        case MessageType.ACTION:
          console.log("[Plugin Action]", message.payload);
          break;

        default:
          break;
      }
    },
    [
      persistToNotesStore,
      scheduleNoteContentPersist,
      schedulePluginUiPersist,
      sendMessageToPlugin,
    ],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (!isReady || !iframeRef.current) {
      return;
    }
    const key = `${note.type}:${note.id}`;
    const prev = prevNoteKeyForUpdateRef.current;
    prevNoteKeyForUpdateRef.current = key;
    if (prev === key) {
      sendMessageToPlugin({ type: MessageType.UPDATE, payload: note });
    }
  }, [isReady, note, sendMessageToPlugin]);

  const pushThemeToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !inheritThemeRef.current) {
      return;
    }
    const css = buildIframeThemeCss(true);
    win.postMessage(
      {
        type: NODEX_IFRAME_THEME_MESSAGE,
        css,
        dark: resolvedDark,
      },
      "*",
    );
  }, [resolvedDark]);

  useEffect(() => {
    const onResolved = () => pushThemeToIframe();
    window.addEventListener("nodex-theme-resolved", onResolved);
    return () => window.removeEventListener("nodex-theme-resolved", onResolved);
  }, [pushThemeToIframe]);

  useEffect(() => {
    if (isReady) {
      pushThemeToIframe();
    }
  }, [isReady, pushThemeToIframe]);

  const loadPluginContent = useCallback(async () => {
    const n = noteRef.current;
    try {
      setError(null);
      const htmlContent = await window.Nodex.getPluginHTML(n.type, n);

      if (!htmlContent) {
        setError(`No plugin renderer found for type: ${n.type}`);
        return;
      }

      const meta = await window.Nodex.getPluginRendererUiMeta(n.type);
      const inherit = (meta?.theme ?? "inherit") !== "isolated";
      inheritThemeRef.current = inherit;

      const defer = meta?.deferDisplayUntilContentReady === true;
      deferDisplayRef.current = defer;
      setDeferDisplay(defer);
      setContentReady(false);

      const themeCss = buildIframeThemeCss(inherit);
      const sandboxedHTML = createSandboxedHTML(htmlContent, {
        themeCss,
        dark: resolvedDark,
        inheritTheme: inherit,
        saveNoteContentType: MessageType.SAVE_NOTE_CONTENT,
        pluginUiSnapshotType: MessageType.PLUGIN_UI_SNAPSHOT,
        pluginUiProtocolVersion: PLUGIN_UI_PROTOCOL_VERSION,
        assetProjectRoot,
        iframeAssetListType: PLUGIN_IFRAME_ASSET_LIST,
        iframeAssetPickType: PLUGIN_IFRAME_ASSET_PICK,
        iframeAssetResponseType: PLUGIN_IFRAME_ASSET_RESPONSE,
        iframePdfBookmarksGetType: PLUGIN_IFRAME_PDF_BOOKMARKS_GET,
        iframePdfBookmarksSetType: PLUGIN_IFRAME_PDF_BOOKMARKS_SET,
        iframePdfBookmarksResponseType: PLUGIN_IFRAME_PDF_BOOKMARKS_RESPONSE,
      });

      if (iframeRef.current) {
        iframeRef.current.srcdoc = sandboxedHTML;
        setIsReady(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plugin");
    }
  }, [note.id, note.type, resolvedDark, assetProjectRoot]);

  useEffect(() => {
    void loadPluginContent();
  }, [loadPluginContent]);

  useEffect(() => {
    if (!isReady || !deferDisplay || contentReady) {
      return;
    }
    const t = window.setTimeout(() => {
      setContentReady(true);
    }, 15_000);
    return () => window.clearTimeout(t);
  }, [isReady, deferDisplay, contentReady]);

  const showHostLoader = !isReady || (deferDisplay && !contentReady);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-sm border border-border bg-muted/60 p-4">
          <p className="font-medium text-foreground">Plugin Error</p>
          <p className="mt-2 text-sm text-foreground/90">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full">
      {/** No `sandbox` — Chromium can block nested PDF/media (`nodex-asset:`) as ERR_BLOCKED_BY_CLIENT; srcdoc CSP still isolates plugin markup. */}
      <iframe
        ref={iframeRef}
        className={`h-full w-full border-0 transition-opacity duration-150 ${
          showHostLoader ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        title={`Plugin renderer for ${note.type}`}
      />
      {showHostLoader ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85 text-muted-foreground backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground"
            aria-hidden
          />
          <span className="text-[12px] font-medium">Loading note…</span>
        </div>
      ) : null}
    </div>
  );
};

function createSandboxedHTML(
  pluginHTML: string,
  opts: {
    themeCss: string;
    dark: boolean;
    inheritTheme: boolean;
    saveNoteContentType: string;
    pluginUiSnapshotType: string;
    pluginUiProtocolVersion: number;
    assetProjectRoot: string | null;
    iframeAssetListType: string;
    iframeAssetPickType: string;
    iframeAssetResponseType: string;
    iframePdfBookmarksGetType: string;
    iframePdfBookmarksSetType: string;
    iframePdfBookmarksResponseType: string;
  },
): string {
  const {
    themeCss,
    dark,
    inheritTheme,
    saveNoteContentType,
    pluginUiSnapshotType,
    pluginUiProtocolVersion,
    assetProjectRoot,
    iframeAssetListType,
    iframeAssetPickType,
    iframeAssetResponseType,
    iframePdfBookmarksGetType,
    iframePdfBookmarksSetType,
    iframePdfBookmarksResponseType,
  } = opts;
  const rootJson = JSON.stringify(assetProjectRoot ?? "");
  const themeStyle =
    inheritTheme && themeCss.length > 0
      ? `<style id="nodex-theme">${escapeForInlineStyle(themeCss)}</style>`
      : "";
  const videoJsStyle = `<style id="nodex-video-js">${escapeForInlineStyle(VIDEO_JS_IFRAME_CSS)}</style>`;
  const themeListener = inheritTheme
    ? `
      window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d || d.type !== '${NODEX_IFRAME_THEME_MESSAGE}') return;
        if (typeof d.css === 'string') {
          var el = document.getElementById('nodex-theme');
          if (el) el.textContent = d.css;
        }
        if (d.dark === true) document.documentElement.classList.add('dark');
        else if (d.dark === false) document.documentElement.classList.remove('dark');
      });
    `
    : "";

  return `
<!DOCTYPE html>
<html class="${dark ? "dark" : ""}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob: nodex-pdf-worker:; worker-src blob: nodex-pdf-worker:; style-src 'unsafe-inline' blob:; img-src 'self' nodex-asset: data: blob:; media-src 'self' nodex-asset: data: blob:; frame-src 'self' nodex-asset: blob: data: about:${PLUGIN_IFRAME_CSP_PDF_FRAME}; object-src 'self' nodex-asset: blob: data:; font-src data: blob:; ${PLUGIN_IFRAME_CSP_CONNECT_SRC}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${themeStyle}
  ${videoJsStyle}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    /* Video.js fluid uses height:0 + padding-top%; border-box makes the box collapse. */
    .video-js { box-sizing: content-box !important; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      padding: 1rem;
      background: hsl(var(--background, 0 0% 100%));
      color: hsl(var(--foreground, 222.2 47% 11%));
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    #plugin-root { flex: 1; min-height: 0; }
  </style>
</head>
<body>
  <div id="plugin-root"></div>
  <script>
    (function () {
      ${themeListener}
      window.__NODEX_PDFJS_WORKER_SRC__ = ${JSON.stringify(NODEX_PDF_WORKER_PROTOCOL_URL)};
      window.Nodex = window.Nodex || {};
      window.Nodex.postMessage = function (data) {
        window.parent.postMessage({ type: 'action', payload: data }, '*');
      };
      window.Nodex.postPluginUiState = function (state) {
        window.parent.postMessage({
          type: '${pluginUiSnapshotType}',
          v: ${pluginUiProtocolVersion},
          state: state,
        }, '*');
      };
      window.Nodex.notifyDisplayReady = function () {
        try {
          window.parent.postMessage({ type: '${MessageType.CONTENT_READY}' }, '*');
        } catch (e) {}
      };
      window.Nodex.saveNoteContent = function (content) {
        if (typeof content !== 'string') return;
        window.parent.postMessage({ type: '${saveNoteContentType}', content: content }, '*');
      };
      window.__NODEX_ASSET_PROJECT_ROOT__ = ${rootJson};
      window.Nodex.assetUrl = function (relativePath, projectRoot) {
        var root =
          projectRoot !== undefined && projectRoot !== null && String(projectRoot) !== ''
            ? String(projectRoot)
            : (window.__NODEX_ASSET_PROJECT_ROOT__ || '');
        function normalizeAssetRel(p) {
          p = String(p == null ? '' : p).trim();
          if (!p) return '';
          if (p.toLowerCase().indexOf('nodex-asset:') === 0) {
            try {
              var u = new URL(p);
              var pathn = (u.pathname || '').replace(/^\\/+/, '').replace(/\\\\/g, '/');
              var h = u.hostname || '';
              if (h) {
                try { h = decodeURIComponent(h); } catch (e0) {}
                pathn = pathn ? h + '/' + pathn : h;
              }
              if (!pathn || pathn.indexOf('..') >= 0) return '';
              try {
                return decodeURIComponent(pathn);
              } catch (e1) {
                return '';
              }
            } catch (e2) {
              return '';
            }
          }
          return p.replace(/^\\/+/, '').replace(/\\\\/g, '/');
        }
        var norm = normalizeAssetRel(relativePath);
        var parts = norm.split('/').map(function (s) { return s.trim(); }).filter(Boolean).map(encodeURIComponent);
        var u = new URL('nodex-asset:///' + parts.join('/'));
        if (root) {
          u.searchParams.set('root', root);
        }
        return u.href;
      };
      function nodexAssetBridgeRequest(kind, category) {
        return new Promise(function (resolve) {
          var id = 'a' + Math.random().toString(36).slice(2) + Date.now();
          function handler(ev) {
            var d = ev.data;
            if (!d || d.type !== '${iframeAssetResponseType}' || d.requestId !== id) return;
            window.removeEventListener('message', handler);
            resolve(d);
          }
          window.addEventListener('message', handler);
          window.parent.postMessage(
            { type: kind, requestId: id, category: category },
            '*',
          );
        });
      }
      window.Nodex.listAssetsByCategory = function (category) {
        return nodexAssetBridgeRequest('${iframeAssetListType}', category);
      };
      window.Nodex.pickImportMediaFile = function (category) {
        return nodexAssetBridgeRequest('${iframeAssetPickType}', category);
      };
      window.Nodex.getPdfBookmarks = function (assetRel) {
        return new Promise(function (resolve, reject) {
          var id = 'pb' + Math.random().toString(36).slice(2) + Date.now();
          function handler(ev) {
            var d = ev.data;
            if (!d || d.type !== '${iframePdfBookmarksResponseType}' || d.requestId !== id) return;
            window.removeEventListener('message', handler);
            if (d.ok) resolve(d.bookmarks || []);
            else reject(new Error(d.error || 'Failed to load bookmarks'));
          }
          window.addEventListener('message', handler);
          window.parent.postMessage(
            { type: '${iframePdfBookmarksGetType}', requestId: id, assetRel: String(assetRel || '') },
            '*',
          );
        });
      };
      window.Nodex.savePdfBookmarks = function (assetRel, bookmarks) {
        return new Promise(function (resolve, reject) {
          var id = 'pb' + Math.random().toString(36).slice(2) + Date.now();
          function handler(ev) {
            var d = ev.data;
            if (!d || d.type !== '${iframePdfBookmarksResponseType}' || d.requestId !== id) return;
            window.removeEventListener('message', handler);
            if (d.ok) resolve(undefined);
            else reject(new Error(d.error || 'Failed to save bookmarks'));
          }
          window.addEventListener('message', handler);
          window.parent.postMessage(
            {
              type: '${iframePdfBookmarksSetType}',
              requestId: id,
              assetRel: String(assetRel || ''),
              bookmarks: bookmarks,
            },
            '*',
          );
        });
      };
      window.Nodex.onMessage = null;
      window.addEventListener('message', function (event) {
        var d = event.data;
        if (d && d.type === '${BRIDGE_READY}') return;
        if (window.Nodex.onMessage) {
          window.Nodex.onMessage(d);
        }
      });
      window.addEventListener('message', function onBridgeReady(ev) {
        if (ev.data && ev.data.type === '${BRIDGE_READY}') {
          window.removeEventListener('message', onBridgeReady);
          try {
            ${pluginHTML}
          } catch (e) {
            console.error('[Plugin]', e);
          }
          window.parent.postMessage({ type: '${MessageType.READY}' }, '*');
        }
      });
      window.parent.postMessage({ type: '${BRIDGE_REQUEST}' }, '*');
    })();
  </script>
</body>
</html>
  `.trim();
}

/** Avoid breaking out of &lt;style&gt; if token file ever contained &lt;/style&gt; */
function escapeForInlineStyle(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

export default SecurePluginRenderer;
