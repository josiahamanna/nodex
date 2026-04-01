import React, { useEffect, useMemo, useRef, useState } from "react";
import type { NodexShellVm } from "./useNodexShell";

function splitMiniBar(text: string): { id: string; rest: string; hasSpace: boolean } {
  const raw = text ?? "";
  const firstSpace = raw.indexOf(" ");
  if (firstSpace < 0) return { id: raw, rest: "", hasSpace: false };
  return { id: raw.slice(0, firstSpace), rest: raw.slice(firstSpace + 1), hasSpace: true };
}

function commandLabel(c: { title: string; category?: string | null }): string {
  const cat = c.category?.trim();
  return cat ? `${cat}: ${c.title}` : c.title;
}

export function NodexMiniBar({ vm }: { vm: NodexShellVm }): React.ReactElement | null {
  const { miniBarText, setMiniBarText, runFromMiniBarText, commands } = vm;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);

  const { id: typedId, rest, hasSpace } = useMemo(() => splitMiniBar(miniBarText), [miniBarText]);
  const typedIdNorm = typedId.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (hasSpace) return [];
    const eligible = commands.filter((c) => c.miniBar !== false);
    // No suggestions until the user types — avoids a permanent overlay above the bar that steals clicks.
    if (!typedIdNorm) {
      return [];
    }
    const starts = eligible.filter((c) => c.id.toLowerCase().startsWith(typedIdNorm));
    const contains = eligible.filter(
      (c) =>
        !c.id.toLowerCase().startsWith(typedIdNorm) &&
        (c.id.toLowerCase().includes(typedIdNorm) ||
          commandLabel(c).toLowerCase().includes(typedIdNorm)),
    );
    return [...starts, ...contains].slice(0, 12);
  }, [commands, hasSpace, typedIdNorm]);

  useEffect(() => {
    setErr(null);
    setActiveIdx(0);
  }, []);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, suggestions.length]);

  const showSuggestionPanel =
    inputFocused && !hasSpace && typedIdNorm.length > 0 && suggestions.length > 0;

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (t && root.contains(t)) return;
      inputRef.current?.blur();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return (
    <div
      ref={rootRef}
      className="nodex-minibar-host shrink-0 border-t border-border bg-background"
    >
      <div className="flex w-full items-center gap-2 px-3 py-2">
        <span className="shrink-0 border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
          M-x
        </span>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={miniBarText}
            onChange={(e) => setMiniBarText(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder='Type `commandId {"arg":"value"}` and press Enter'
            className="w-full min-w-0 rounded-none border border-input bg-background px-2 py-2 text-[12px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setErr(null);
                setMiniBarText("");
                inputRef.current?.blur();
                return;
              }
              if (showSuggestionPanel) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.max(0, i - 1));
                  return;
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const pick = suggestions[activeIdx] ?? suggestions[0];
                  if (pick) setMiniBarText(`${pick.id} `);
                  return;
                }
              }
              if (e.key === "Enter") {
                e.preventDefault();
                setErr(null);
                void (async () => {
                  try {
                    if (!hasSpace && rest.trim().length === 0) {
                      const pick = suggestions[activeIdx];
                      if (pick && pick.id.toLowerCase() !== typedIdNorm) {
                        setMiniBarText(`${pick.id} `);
                        return;
                      }
                    }
                    await runFromMiniBarText(miniBarText);
                  } catch (ex) {
                    setErr(ex instanceof Error ? ex.message : "Command failed");
                  }
                })();
              }
            }}
          />
          {showSuggestionPanel ? (
            <div
              className="absolute bottom-full mb-1 w-full overflow-hidden rounded-none border border-border bg-background shadow-lg"
              onMouseDown={(e) => e.preventDefault()}
            >
              <ul className="max-h-56 overflow-auto py-1">
                {suggestions.map((c, idx) => {
                  const active = idx === activeIdx;
                  return (
                    <li key={c.id}>
                      <button
                        ref={active ? activeItemRef : null}
                        type="button"
                        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] ${
                          active ? "bg-muted/60" : "hover:bg-muted/40"
                        }`}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onMouseDown={(ev) => {
                          // keep focus in input
                          ev.preventDefault();
                        }}
                        onClick={() => setMiniBarText(`${c.id} `)}
                      >
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{c.id}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {commandLabel(c)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
                <span className="font-mono">↑</span>/<span className="font-mono">↓</span> to select,{" "}
                <span className="font-mono">Tab</span> to complete
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {err ? (
        <div className="w-full px-3 pb-2 text-[11px] text-red-600 dark:text-red-400">
          {err}
        </div>
      ) : null}
      <div className="w-full px-3 pb-2 text-[10px] text-muted-foreground">
        Tips: <span className="font-mono">Ctrl+K</span> (or <span className="font-mono">F1</span>) opens the palette.{" "}
        <span className="font-mono">Esc</span> clears. <span className="font-mono">Tab</span> completes.
      </div>
    </div>
  );
}

