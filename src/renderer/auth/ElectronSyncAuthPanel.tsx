import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  platformDeps,
  type AppDispatch,
  type RootState,
} from "../store";
import {
  cloudLoginThunk,
  cloudRegisterThunk,
} from "../store/cloudAuthSlice";

type Mode = "login" | "signup";

/**
 * Sign in / register against the sync API (same as Cloud tab). Used from Electron Notes “Sync” overlay.
 */
export function ElectronSyncAuthPanel({
  initialMode,
  onBack,
  onSignedIn,
}: {
  initialMode: Mode;
  onBack: () => void;
  onSignedIn: () => void;
}): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((s: RootState) => s.cloudAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">(
    initialMode === "signup" ? "register" : "login",
  );

  useEffect(() => {
    setMode(initialMode === "signup" ? "register" : "login");
  }, [initialMode]);

  useEffect(() => {
    if (auth.status === "signedIn") {
      onSignedIn();
    }
  }, [auth.status, onSignedIn]);

  const apiBase = platformDeps.remoteApi.getBaseUrl() || "(not set)";

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">Sync</h2>
        <button
          type="button"
          className="text-[12px] text-muted-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground"
          onClick={onBack}
        >
          Back
        </button>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
        Sign in or create an account to sync notes with the configured API. On-disk workspace files are
        unchanged. API base:{" "}
        <span className="font-mono text-[11px] text-foreground/90">{apiBase}</span>
      </p>
      {auth.error ? (
        <p className="mt-3 text-[12px] text-destructive">{auth.error}</p>
      ) : null}
      <div className="mt-5 space-y-3">
        <div className="flex gap-2 text-[11px]">
          <button
            type="button"
            className={`rounded px-2 py-1 ${mode === "login" ? "bg-muted font-medium" : ""}`}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 ${mode === "register" ? "bg-muted font-medium" : ""}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>
        <label className="block text-[12px]">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            autoComplete="email"
            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-[12px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-[12px]">
          <span className="text-muted-foreground">Password (min 8)</span>
          <input
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-[12px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={auth.busy || !email.trim() || password.length < 8}
          className="w-full rounded border border-input bg-background px-3 py-2 text-[12px] shadow-sm hover:bg-muted/50 disabled:opacity-50"
          onClick={() => {
            if (mode === "login") {
              void dispatch(cloudLoginThunk({ email: email.trim(), password }));
            } else {
              void dispatch(cloudRegisterThunk({ email: email.trim(), password }));
            }
          }}
        >
          {auth.busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </div>
    </div>
  );
}
