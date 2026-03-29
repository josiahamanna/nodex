import React, { type MutableRefObject } from "react";
import { SKIP_INSTALL_CONFIRM_KEY } from "./plugin-manager-constants";
import type { PluginInstallPlanState } from "./plugin-manager-types";

type Props = {
  installModal: PluginInstallPlanState;
  skipConfirmRef: MutableRefObject<boolean>;
  onClose: () => void;
  onConfirmInstall: () => void;
};

export function PluginManagerInstallModal({
  installModal,
  skipConfirmRef,
  onClose,
  onConfirmInstall,
}: Props): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg bg-card p-5 text-card-foreground shadow-xl">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Install dependencies
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Manifest name:{" "}
          <code className="text-xs bg-muted px-1 rounded">
            {installModal.plan.manifestName}
          </code>
        </p>
        <p className="text-xs text-muted-foreground mb-2 break-all">
          Workspace: {installModal.plan.cacheDir}
        </p>
        {installModal.plan.depsChangedSinceLastInstall && (
          <p className="mb-2 rounded border border-border bg-muted/50 p-2 text-sm text-foreground/90">
            package.json or manifest.dependencies changed since the last
            recorded install (see .nodex-deps-snapshot.json).
          </p>
        )}
        {installModal.plan.warnManyDeps && (
          <p className="mb-2 text-sm text-foreground/90">
            This plugin declares many dependencies (
            {installModal.plan.dependencyCount}).
          </p>
        )}
        {installModal.plan.warnLargePackageJson && (
          <p className="mb-2 text-sm text-foreground/90">
            package.json is unusually large — review before installing.
          </p>
        )}
        {installModal.plan.registryNotes.length > 0 && (
          <ul className="text-xs text-muted-foreground mb-3 list-disc pl-5">
            {installModal.plan.registryNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <p className="text-sm font-medium text-foreground mb-1">
          Packages ({installModal.plan.dependencyCount})
        </p>
        <ul className="text-xs font-mono bg-muted/40 border border-border rounded p-2 max-h-40 overflow-auto mb-4">
          {Object.entries(installModal.plan.dependencies).map(([k, v]) => (
            <li key={k}>
              {k}@{v}
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm text-foreground mb-4">
          <input
            type="checkbox"
            defaultChecked={skipConfirmRef.current}
            onChange={(e) => {
              skipConfirmRef.current = e.target.checked;
              if (e.target.checked) {
                localStorage.setItem(SKIP_INSTALL_CONFIRM_KEY, "1");
              } else {
                localStorage.removeItem(SKIP_INSTALL_CONFIRM_KEY);
              }
            }}
          />
          Don&apos;t show this again (stored locally)
        </label>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded bg-muted text-foreground hover:bg-muted/80"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nodex-btn-neutral rounded-sm px-3 py-1.5 text-[12px] font-semibold"
            onClick={onConfirmInstall}
          >
            Run npm install
          </button>
        </div>
      </div>
    </div>
  );
}
