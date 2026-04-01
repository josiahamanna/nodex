import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommandContribution } from "./nodex-contribution-registry";
import { useNodexCommands, useNodexContributionRegistry } from "./NodexContributionContext";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function commandLabel(c: CommandContribution): string {
  const cat = c.category?.trim();
  return cat ? `${cat}: ${c.title}` : c.title;
}

function fuzzyScore(haystack: string, needle: string): number | null {
  const h = haystack;
  const n = needle;
  if (!n) return 0;
  if (h.includes(n)) {
    // Substring match: strong signal. Prefer earlier + tighter.
    const at = h.indexOf(n);
    return 200 - Math.min(150, at) - Math.min(50, h.length - n.length);
  }
  // Subsequence fuzzy match: walk haystack, reward consecutive chars.
  let hi = 0;
  let score = 0;
  let run = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const ch = n[ni]!;
    let found = false;
    while (hi < h.length) {
      const hh = h[hi]!;
      hi += 1;
      if (hh === ch) {
        found = true;
        run += 1;
        score += 5 + Math.min(10, run * 2);
        break;
      }
      run = 0;
    }
    if (!found) return null;
  }
  // Prefer matches that start earlier.
  score -= Math.min(80, hi);
  return score;
}

function scoreCommand(c: CommandContribution, q: string): number | null {
  if (!q) return 0;
  const id = norm(c.id);
  const label = norm(commandLabel(c));
  const doc = norm(c.doc ?? "");
  const parts = q.split(/\s+/).filter(Boolean);

  let total = 0;
  for (const p of parts) {
    // High boosts for exact/prefix/word-ish matches in id/label.
    if (id === p) {
      total += 1000;
      continue;
    }
    if (id.startsWith(p)) {
      total += 700;
      continue;
    }
    if (label.startsWith(p)) {
      total += 520;
      continue;
    }
    const wordRe = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
    if (wordRe.test(c.id) || wordRe.test(commandLabel(c))) {
      total += 380;
      continue;
    }

    // Fuzzy match across concatenated fields; require a match.
    const hay = `${id} ${label} ${doc}`;
    const s = fuzzyScore(hay, p);
    if (s == null) return null;
    total += s;
  }
  return total;
}

export type ShellSurface = "palette" | "miniBar";

export type NodexShellVm = {
  open: boolean;
  surface: ShellSurface;
  query: string;
  setQuery: (v: string) => void;
  commands: CommandContribution[];
  results: CommandContribution[];
  selectedIndex: number;
  setSelectedIndex: (n: number) => void;
  close: () => void;
  openPalette: () => void;
  openMiniBar: (prefill?: string) => void;
  runSelected: () => Promise<void>;
  runFromMiniBarText: (text: string) => Promise<void>;
  miniBarText: string;
  setMiniBarText: (v: string) => void;
};

/**
 * Emacs-ish shell VM (pure state + registry invocation).
 * - Palette: fuzzy filter of registered commands.
 * - Mini bar: accepts `commandId {jsonArgs}` or just `commandId`.
 */
export function useNodexShell(): NodexShellVm {
  const registry = useNodexContributionRegistry();
  const commands = useNodexCommands().filter((c) => c.palette !== false || c.miniBar !== false);
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<ShellSurface>("palette");
  const [query, setQuery] = useState("");
  const [miniBarText, setMiniBarText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const lastOpenAtRef = useRef<number>(0);

  const results = useMemo(() => {
    const q = norm(query);
    const eligible = commands.filter((c) => {
      if (surface === "palette") return c.palette !== false;
      return c.miniBar !== false;
    });
    if (!q) {
      return eligible.slice().sort((a, b) => commandLabel(a).localeCompare(commandLabel(b)));
    }
    return eligible
      .map((c) => ({ c, s: scoreCommand(c, q) }))
      .filter((x): x is { c: CommandContribution; s: number } => typeof x.s === "number")
      .sort((a, b) => b.s - a.s || commandLabel(a.c).localeCompare(commandLabel(b.c)))
      .map((x) => x.c);
  }, [commands, query, surface]);

  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1));
    }
  }, [results.length, selectedIndex]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMiniBarText("");
    setSelectedIndex(0);
  }, []);

  const openPalette = useCallback(() => {
    setSurface("palette");
    setOpen(true);
    setQuery("");
    setSelectedIndex(0);
    lastOpenAtRef.current = Date.now();
  }, []);

  const openMiniBar = useCallback((prefill?: string) => {
    setSurface("miniBar");
    setOpen(true);
    setQuery("");
    setSelectedIndex(0);
    setMiniBarText(prefill ?? "");
    lastOpenAtRef.current = Date.now();
  }, []);

  const runCommand = useCallback(
    async (id: string, args?: Record<string, unknown>) => {
      const r = registry.invokeCommand(id, args);
      await Promise.resolve(r);
    },
    [registry],
  );

  const runSelected = useCallback(async () => {
    const cmd = results[selectedIndex];
    if (!cmd) return;
    if (cmd.doc?.includes("args:")) {
      openMiniBar(`${cmd.id} `);
      return;
    }
    close();
    await runCommand(cmd.id);
  }, [close, openMiniBar, results, runCommand, selectedIndex]);

  const runFromMiniBarText = useCallback(
    async (text: string) => {
      const raw = text.trim();
      if (!raw) return;
      const space = raw.indexOf(" ");
      const id = (space >= 0 ? raw.slice(0, space) : raw).trim();
      const rest = space >= 0 ? raw.slice(space + 1).trim() : "";
      let args: Record<string, unknown> | undefined;
      if (rest) {
        try {
          const parsed = JSON.parse(rest) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Args must be a JSON object.");
          }
          args = parsed as Record<string, unknown>;
        } catch (e) {
          throw new Error(
            e instanceof Error ? `Bad args JSON: ${e.message}` : "Bad args JSON",
          );
        }
      }
      await runCommand(id, args);
    },
    [runCommand],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement | null)?.closest(
        "input, textarea, [contenteditable=true]",
      );
      if (!open) {
        // Ctrl+K or F1 => palette, Alt+X => mini bar (Emacs M-x).
        // (Ctrl+Shift+P can conflict with browser Print on some setups.)
        const k = e.key.toLowerCase();
        const paletteHotkey =
          // Ctrl+K / Cmd+K
          ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && k === "k") ||
          // Ctrl+Alt+P / Cmd+Alt+P (fallback)
          ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && k === "p") ||
          // F1
          (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "F1");

        if (paletteHotkey) {
          if (isInput) return;
          e.preventDefault();
          openPalette();
        } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "x") {
          if (isInput) return;
          e.preventDefault();
          openMiniBar("");
        }
        return;
      }

      // avoid eating the open keystroke (sometimes keyup arrives late)
      if (Date.now() - lastOpenAtRef.current < 50) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (surface === "palette") {
        // If the palette input is focused, let the component handle navigation.
        // Otherwise Arrow/Enter will be handled twice (global + input handler).
        if (
          isInput &&
          (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")
        ) {
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          void runSelected();
        }
      } else {
        if (e.key === "Enter") {
          e.preventDefault();
          void (async () => {
            await runFromMiniBarText(miniBarText);
          })();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    close,
    miniBarText,
    open,
    openMiniBar,
    openPalette,
    results.length,
    runFromMiniBarText,
    runSelected,
    surface,
  ]);

  // Expose palette/minibar open as commands.
  useEffect(() => {
    const disposePalette = registry.registerCommand({
      id: "nodex.shell.openPalette",
      title: "Shell: Open command palette",
      category: "Shell",
      doc: "Open the command palette UI.",
      handler: () => openPalette(),
    });
    const disposeMini = registry.registerCommand({
      id: "nodex.shell.openMiniBar",
      title: "Shell: Open mini buffer (M-x)",
      category: "Shell",
      doc: "Open the mini buffer input UI.",
      handler: (args) => openMiniBar(String(args?.prefill ?? "")),
    });
    return () => {
      disposePalette();
      disposeMini();
    };
  }, [openMiniBar, openPalette, registry]);

  return {
    open,
    surface,
    query,
    setQuery,
    commands,
    results,
    selectedIndex,
    setSelectedIndex,
    close,
    openPalette,
    openMiniBar,
    runSelected,
    runFromMiniBarText,
    miniBarText,
    setMiniBarText,
  };
}

