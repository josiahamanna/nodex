import React, { useCallback, useMemo, useState } from "react";
import {
  applyHeadlessApiBase,
  getHeadlessApiPresetOptions,
  isElectronUserAgent,
  normalizeHeadlessApiBase,
} from "../nodex-web-shim";

/** Headless API URL picker for plain browser (Next dev, static export); hidden in Electron. */
export const WebHeadlessApiMarketplaceSection: React.FC = () => {
  const [showBrowserPicker] = useState(
    () => typeof window !== "undefined" && !isElectronUserAgent(),
  );
  const presets = useMemo(() => getHeadlessApiPresetOptions(), []);
  const presetValues = useMemo(
    () => new Set(presets.map((p) => p.value)),
    [presets],
  );
  const [baseUrl, setBaseUrl] = useState(() =>
    typeof window !== "undefined"
      ? normalizeHeadlessApiBase(window.__NODEX_WEB_API_BASE__?.trim() ?? "")
      : "",
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(baseUrl);

  const apply = useCallback((raw: string) => {
    const n = normalizeHeadlessApiBase(raw);
    if (!/^https?:\/\/.+/i.test(n)) {
      return;
    }
    applyHeadlessApiBase(n);
    setBaseUrl(n);
    setCustomDraft(n);
  }, []);

  if (!showBrowserPicker) {
    return null;
  }

  const isPreset = presetValues.has(baseUrl);

  return (
    <section
      className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-foreground"
      aria-label="Headless API connection"
    >
      <div className="mb-2 font-medium text-muted-foreground">Headless API</div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="nodex-headless-api-select"
          className="max-w-[min(100%,22rem)] rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground"
          aria-label="Headless API base URL"
          value={baseUrl || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              return;
            }
            apply(v);
            setCustomOpen(false);
          }}
        >
          {baseUrl === "" ? (
            <option value="">Select headless API…</option>
          ) : null}
          {presets.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          {!isPreset && baseUrl ? (
            <option value={baseUrl}>
              Other: {baseUrl.length > 56 ? `${baseUrl.slice(0, 52)}…` : baseUrl}
            </option>
          ) : null}
        </select>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground"
          onClick={() => {
            setCustomDraft(baseUrl);
            setCustomOpen((o) => !o);
          }}
        >
          {customOpen ? "Cancel" : "Other URL…"}
        </button>
      </div>
      {customOpen ? (
        <form
          className="mt-2 flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            apply(customDraft);
            setCustomOpen(false);
          }}
        >
          <input
            type="url"
            className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground sm:min-w-[16rem]"
            placeholder="https://host:port"
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            aria-label="Custom headless API base URL"
          />
          <button
            type="submit"
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold"
          >
            Apply
          </button>
        </form>
      ) : null}
    </section>
  );
};
