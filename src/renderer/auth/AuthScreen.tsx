import React, { useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

type Mode = "login" | "signup";

export function AuthScreen(): React.ReactElement {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "login" ? "Login" : "Signup";
  const canSubmit = useMemo(() => {
    const e = email.trim();
    const p = password;
    if (!e || !p) return false;
    if (mode === "signup" && username.trim().length < 2) return false;
    return true;
  }, [email, password, username, mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await signup(email.trim(), username.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen min-h-0 w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="text-[14px] font-semibold tracking-tight text-foreground">
            {title}
          </div>
          <div className="flex rounded-lg border border-border bg-muted/10 p-1">
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 text-[12px] ${
                mode === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 text-[12px] ${
                mode === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
            >
              Signup
            </button>
          </div>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete={mode === "login" ? "email" : "email"}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-muted/40"
              placeholder="you@example.com"
            />
          </label>

          {mode === "signup" ? (
            <label className="block">
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                Username
              </div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                autoComplete="username"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-muted/40"
                placeholder="yourname"
              />
            </label>
          ) : null}

          <label className="block">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
              Password
            </div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-2 focus:ring-muted/40"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="mt-2 h-10 w-full rounded-md border border-border bg-foreground text-[13px] font-medium text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Please wait…" : title}
          </button>
        </form>
      </div>
    </div>
  );
}

