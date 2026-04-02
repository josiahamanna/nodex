import React, { useMemo, useState } from "react";
import { AuthScreen } from "./AuthScreen";
import { NodexLogo } from "../components/NodexLogo";

type EntryView = "marketing" | "auth";
type AuthMode = "login" | "signup";

function MarketingHome({
  onLogin,
  onSignup,
}: {
  onLogin: () => void;
  onSignup: () => void;
}): React.ReactElement {
  const card =
    "rounded-xl border border-border bg-background/70 p-5 shadow-sm backdrop-blur";
  const pill =
    "inline-flex items-center gap-2 rounded-full border border-border bg-muted/10 px-3 py-1 text-[11px] text-muted-foreground";

  return (
    <div className="relative flex h-screen min-h-0 w-full flex-col overflow-y-auto bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-48 -right-40 h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 border-b border-border/40 bg-background/70 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/10 text-primary">
            <NodexLogo className="h-5 w-5" title="Nodex" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Nodex</div>
            <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
              A studio for building & documenting note systems
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-border bg-muted/10 px-3 text-[12px] text-foreground hover:bg-muted/30"
            onClick={onLogin}
          >
            Login
          </button>
          <button
            type="button"
            className="nodex-primary-fill h-9 rounded-md border border-primary/30 bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:brightness-95"
            onClick={onSignup}
          >
            Signup
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-10 pt-6">
        <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
          <div className="min-w-0">
            <div className={pill}>
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span>Bring code, notes, and docs into one place</span>
            </div>
            <h1 className="mt-4 text-balance text-[34px] font-semibold tracking-tight md:text-[46px]">
              Build notes and systems—then ship them.
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-[14px] leading-6 text-muted-foreground">
              Nodex is a studio for technical work: notes, markdown docs, and interactive notebooks.
              It’s keyboard-first and command-driven, extensible like a toolkit, and self-documenting
              with in-app docs that stay close to the features you use.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="nodex-primary-fill h-10 rounded-md border border-primary/30 bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:brightness-95"
                onClick={onSignup}
              >
                Create an account
              </button>
              <div className="ml-1 text-[11px] text-muted-foreground">
                Local Electron mode works offline.
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className={card}>
                <div className="text-[12px] font-semibold">Markdown, done right</div>
                <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  Edit and preview side‑by‑side. Keep architecture notes close to the work.
                </div>
              </div>
              <div className={card}>
                <div className="text-[12px] font-semibold">Observable notebooks</div>
                <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  Turn exploration into reusable, reviewable artifacts.
                </div>
              </div>
              <div className={card}>
                <div className="text-[12px] font-semibold">Command API documentation</div>
                <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  Built‑in docs hub for commands and guides, searchable in‑app.
                </div>
              </div>
              <div className={card}>
                <div className="text-[12px] font-semibold">Plugins & contributions</div>
                <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  Extend the studio with first‑party and bundled plugins.
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="rounded-2xl border border-border bg-muted/10 p-5">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold">What you’ll use every day</div>
                <div className="text-[11px] text-muted-foreground">A fast, calm workspace</div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {[
                  {
                    title: "Notes explorer + pinned tabs",
                    body: "Navigate your workspace like an IDE, but for knowledge.",
                  },
                  {
                    title: "Docs hub",
                    body: "Browse guides and command API docs without leaving the app.",
                  },
                  {
                    title: "Preview-first markdown",
                    body: "Switch between Editor / Preview / Both whenever you need.",
                  },
                ].map((x) => (
                  <div key={x.title} className="rounded-xl border border-border bg-background p-4">
                    <div className="text-[12px] font-medium text-foreground">{x.title}</div>
                    <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{x.body}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-[12px] text-muted-foreground">
                Tip: open <span className="font-mono text-[11px] text-foreground">Docs</span> from the rail
                once you’re inside.
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:col-span-3">
            <div className={card}>
              <div className="text-[12px] font-semibold">For teams</div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Make documentation a living part of the workflow, not an afterthought.
              </div>
            </div>
            <div className={card}>
              <div className="text-[12px] font-semibold">For builders</div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Keep experiments, decisions, and implementation notes in one place.
              </div>
            </div>
            <div className={card}>
              <div className="text-[12px] font-semibold">For maintainers</div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Use admin capabilities to keep system docs accurate and up to date.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/10 p-5 lg:col-span-1">
            <div className="text-[12px] font-semibold">A useful mental model</div>
            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
              If you like tools that reward learning their keys and composing small actions into powerful workflows,
              Nodex will feel familiar.
            </div>
            <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
              Think of it as <span className="font-medium text-foreground">Emacs for note-taking</span>.
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-5 text-center text-[11px] text-muted-foreground">
        Built by Jehu Shalom Amanna
      </footer>
    </div>
  );
}

export function EntryScreen(): React.ReactElement {
  const [view, setView] = useState<EntryView>("marketing");
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const auth = useMemo(
    () => (
      <AuthScreen
        initialMode={authMode}
        onBack={() => {
          setView("marketing");
        }}
      />
    ),
    [authMode],
  );

  if (view === "auth") return auth;

  return (
    <MarketingHome
      onLogin={() => {
        setAuthMode("login");
        setView("auth");
      }}
      onSignup={() => {
        setAuthMode("signup");
        setView("auth");
      }}
    />
  );
}

