import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Note } from "@nodex/ui-types";
import MarkdownRenderer from "../../../../components/renderers/MarkdownRenderer";
import { resolveCommandApiDoc } from "../../../command-api-metadata";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { BUNDLED_DOC_NOTE_IDS, DOCS_BC, type DocsBcMessage } from "./documentationConstants";
import { fetchBundledDocumentationNote } from "./documentationFetchBundledNote";
import { resolvedCommandDocToMarkdown } from "./documentationCommandMarkdown";
import { useShellProjectWorkspace } from "../../../useShellProjectWorkspace";
import {
  DOCUMENTATION_SHELL_TAB_TYPE_ID,
  buildDocumentationStateFromUi,
  mergeDocumentationIntoTabState,
  readDocumentationStateFromTab,
} from "./documentationShellHash";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch),
  );
}

/**
 * **Main area** for the Documentation plugin: command API as a markdown note when the user picks a row
 * in the side panel search list (`docs.showCommand` over {@link DOCS_BC}).
 * URL hash can target a command, bundled note, or hub heading via `state.documentation` (see `documentationShellHash`).
 */
export function DocumentationHubView(_props: { viewId: string; title: string }): React.ReactElement {
  const registry = useNodexContributionRegistry();
  const regs = useShellRegistries();
  const { mountKind } = useShellProjectWorkspace();
  const [commandId, setCommandId] = useState<string | null>(null);
  const [bundledNoteId, setBundledNoteId] = useState<string | null>(null);
  const [headingSlug, setHeadingSlug] = useState<string | undefined>(undefined);
  const [bundledNote, setBundledNote] = useState<Note | null>(null);
  const [bundledLoading, setBundledLoading] = useState(false);
  const [bundledError, setBundledError] = useState<string | null>(null);
  const [hubNote, setHubNote] = useState<Note | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const tabDocSig = useSyncExternalStore(
    (cb) => regs.tabs.subscribe(cb),
    () => {
      const t = regs.tabs.getActiveTab();
      const d = readDocumentationStateFromTab(t);
      return `${t?.instanceId ?? ""}|${d?.view ?? ""}|${d?.commandId ?? ""}|${d?.noteId ?? ""}|${d?.headingSlug ?? ""}`;
    },
    () => "",
  );
  void tabDocSig;

  useLayoutEffect(() => {
    const t = regs.tabs.getActiveTab();
    if (!t || t.tabTypeId !== DOCUMENTATION_SHELL_TAB_TYPE_ID) return;
    const doc = readDocumentationStateFromTab(t);
    if (!doc) {
      setCommandId(null);
      setBundledNoteId(null);
      setHeadingSlug(undefined);
      return;
    }
    if (doc.view === "command" && doc.commandId) {
      setCommandId(doc.commandId);
      setBundledNoteId(null);
      setHeadingSlug(doc.headingSlug);
      return;
    }
    if (doc.view === "bundled" && doc.noteId) {
      setCommandId(null);
      setBundledNoteId(doc.noteId);
      setHeadingSlug(doc.headingSlug);
      return;
    }
    if (doc.view === "hub") {
      setCommandId(null);
      setBundledNoteId(null);
      setHeadingSlug(doc.headingSlug);
    }
  }, [regs.tabs, tabDocSig]);

  useEffect(() => {
    const t = regs.tabs.getActiveTab();
    if (!t || t.tabTypeId !== DOCUMENTATION_SHELL_TAB_TYPE_ID) return;
    const next = buildDocumentationStateFromUi(commandId, bundledNoteId, headingSlug);
    mergeDocumentationIntoTabState(regs.tabs, t.instanceId, next);
  }, [bundledNoteId, commandId, headingSlug, regs.tabs]);

  const registryRev = useSyncExternalStore(
    (onChange) => registry.subscribe(onChange),
    () => registry.getSnapshotVersion(),
    () => 0,
  );

  const cmd = useMemo(() => {
    if (!commandId) return null;
    return registry.getCommand(commandId) ?? null;
  }, [commandId, registry, registryRev]);

  const doc = useMemo(() => (cmd ? resolveCommandApiDoc(cmd) : null), [cmd]);

  const commandMarkdownNote = useMemo((): Note | null => {
    if (!doc) return null;
    return {
      id: `documentation-hub-command:${doc.commandId}`,
      type: "markdown",
      title: doc.commandId,
      content: resolvedCommandDocToMarkdown(doc),
    };
  }, [doc]);

  useEffect(() => {
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DOCS_BC) : null;
    if (!bc) return () => {};
    const onMsg = (ev: MessageEvent<DocsBcMessage>) => {
      const d = ev.data;
      if (d?.type === "docs.showCommand" && typeof d.commandId === "string") {
        setBundledNoteId(null);
        setHeadingSlug(undefined);
        setCommandId(d.commandId);
      }
      if (d?.type === "docs.showBundledDoc" && typeof d.noteId === "string") {
        setCommandId(null);
        setHeadingSlug(undefined);
        setBundledNoteId(d.noteId);
      }
      if (d?.type === "docs.showBundledLogical" && typeof d.logicalId === "string") {
        setCommandId(null);
        setHeadingSlug(undefined);
        void fetchBundledDocumentationNote(d.logicalId, mountKind)
          .then((n) => {
            setBundledNoteId(n.id);
          })
          .catch(() => {});
      }
    };
    bc.addEventListener("message", onMsg);
    return () => {
      bc.removeEventListener("message", onMsg);
      bc.close();
    };
  }, [mountKind]);

  useEffect(() => {
    if (!bundledNoteId) {
      setBundledNote(null);
      setBundledError(null);
      setBundledLoading(false);
      return;
    }
    setBundledLoading(true);
    setBundledError(null);
    const load = async () => {
      if (mountKind === "wpn-postgres" || bundledNoteId.startsWith("wpn-docs:")) {
        const r = await window.Nodex.wpnGetNote(bundledNoteId);
        return r.note as unknown as Note;
      }
      return await window.Nodex.getNote(bundledNoteId);
    };
    void load()
      .then((n) => {
        setBundledNote(n);
        setBundledLoading(false);
      })
      .catch((e: unknown) => {
        setBundledError(e instanceof Error ? e.message : String(e));
        setBundledLoading(false);
      });
  }, [bundledNoteId, mountKind]);

  useEffect(() => {
    if (bundledNoteId || commandId) {
      setHubNote(null);
      setHubError(null);
      setHubLoading(false);
      return;
    }
    let cancelled = false;
    setHubLoading(true);
    setHubError(null);
    void (async () => {
      try {
        const n = await fetchBundledDocumentationNote(BUNDLED_DOC_NOTE_IDS.hubOverview, mountKind);
        if (!cancelled) {
          setHubNote(n);
          setHubLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setHubError(e instanceof Error ? e.message : String(e));
          setHubNote(null);
          setHubLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bundledNoteId, commandId, mountKind]);

  useEffect(() => {
    if (!headingSlug) return;
    const id = window.setTimeout(() => {
      const root = scrollRootRef.current;
      const el = root?.querySelector(`#${CSS.escape(headingSlug)}`) ?? document.getElementById(headingSlug);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 160);
    return () => window.clearTimeout(id);
  }, [headingSlug, commandId, bundledNoteId, hubNote?.id, bundledNote?.id, commandMarkdownNote?.id]);

  const scrollDocHeadingIntoView = useCallback((slug: string) => {
    const root = scrollRootRef.current;
    const el = root?.querySelector(`#${CSS.escape(slug)}`) ?? document.getElementById(slug);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onEv = (ev: Event) => {
      const slug = (ev as CustomEvent<{ slug?: string }>).detail?.slug;
      if (typeof slug === "string" && slug) {
        queueMicrotask(() => scrollDocHeadingIntoView(slug));
      }
    };
    window.addEventListener("nodex:documentation-scroll-to-heading", onEv);
    return () => window.removeEventListener("nodex:documentation-scroll-to-heading", onEv);
  }, [scrollDocHeadingIntoView]);

  /** TOC / in-doc `#slug` links: update shell hash and scroll (re-click same slug still scrolls). */
  const onDocHeadingLinkClick = useCallback(
    (slug: string) => {
      setHeadingSlug((prev) => {
        if (prev === slug) {
          queueMicrotask(() => scrollDocHeadingIntoView(slug));
          return prev;
        }
        return slug;
      });
    },
    [scrollDocHeadingIntoView],
  );

  const docHubDismissBtn =
    "shrink-0 rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40";

  const closeBundled = () => {
    setBundledNoteId(null);
    setHeadingSlug(undefined);
  };

  const backToHubOverview = () => {
    setCommandId(null);
    setHeadingSlug(undefined);
  };

  if (bundledNoteId) {
    if (bundledLoading) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
            <button type="button" className={docHubDismissBtn} onClick={closeBundled}>
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-[13px] text-muted-foreground">
            Loading guide…
          </div>
        </div>
      );
    }
    if (bundledError) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
            <button type="button" className={docHubDismissBtn} onClick={closeBundled}>
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-5 text-[13px] text-destructive">
            <p className="font-medium">Could not load this guide</p>
            <p className="text-muted-foreground">{esc(bundledError)}</p>
          </div>
        </div>
      );
    }
    if (!bundledNote) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
            <button type="button" className={docHubDismissBtn} onClick={closeBundled}>
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-5 text-[13px] text-muted-foreground">
            <p className="font-medium text-foreground">Guide not available</p>
            <p>
              This note id is not in the current workspace, or notes have not finished loading. Open a project and
              ensure bundled docs have seeded.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col overflow-auto">
        <div className="shrink-0 border-b border-border px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Bundled guide (read-only)
              </div>
              <h1 className="mt-1 text-lg font-semibold text-foreground">{esc(bundledNote.title)}</h1>
            </div>
            <button type="button" className={docHubDismissBtn} onClick={closeBundled}>
              Close
            </button>
          </div>
        </div>
        <div ref={scrollRootRef} className="min-h-0 flex-1 overflow-auto">
          <MarkdownRenderer note={bundledNote} onSamePageHeadingClick={onDocHeadingLinkClick} />
        </div>
      </div>
    );
  }

  if (!doc || !commandMarkdownNote) {
    if (hubLoading) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-[13px] text-muted-foreground">
          Loading overview…
        </div>
      );
    }
    if (hubNote) {
      return (
        <div ref={scrollRootRef} className="flex h-full min-h-0 flex-col overflow-auto p-5 text-[13px] text-muted-foreground">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bundled overview (read-only)
          </div>
          <MarkdownRenderer note={hubNote} onSamePageHeadingClick={onDocHeadingLinkClick} />
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 p-5 text-[13px] text-muted-foreground">
        <p className="font-medium text-foreground">Documentation overview not available</p>
        <p>
          {hubError ? esc(hubError) : "Open a workspace so bundled documentation can seed from the repository."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 justify-end border-b border-border px-3 py-2">
        <button type="button" className={docHubDismissBtn} onClick={backToHubOverview}>
          Back to overview
        </button>
      </div>
      <div ref={scrollRootRef} className="min-h-0 flex-1 overflow-auto">
        <MarkdownRenderer note={commandMarkdownNote} onSamePageHeadingClick={onDocHeadingLinkClick} />
      </div>
    </div>
  );
}
