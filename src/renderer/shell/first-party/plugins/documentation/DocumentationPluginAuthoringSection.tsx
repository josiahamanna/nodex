import React from "react";

function CodeBlock({ children }: { children: string }): React.ReactElement {
  return (
    <pre className="my-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[10px] leading-relaxed text-foreground">
      {children.trimEnd()}
    </pre>
  );
}

/**
 * In-app guide: developing and wiring plugins into Nodex (secondary Documentation panel).
 */
export function DocumentationPluginAuthoringSection(): React.ReactElement {
  return (
    <div className="space-y-5 text-[11px] leading-relaxed text-foreground">
      <section>
        <h3 className="mb-1.5 text-[13px] font-bold">How to create plugins</h3>
        <p className="text-muted-foreground">
          Plugins extend the shell (rail, side panel, primary tabs, secondary column) and can register
          commands for the palette and minibuffer. <strong>System plugins</strong> ship inside the app as
          normal TypeScript modules; <strong>user plugins</strong> use the same conceptual API and will load
          from compiled bundles under a SES sandbox (see repo docs).
        </p>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">1. UI vs non-UI</h4>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            <strong className="text-foreground">UI plugin</strong> — contributes one or more{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">React</code> views registered on{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">ShellViewRegistry</code>, plus
            optional rail items and tab types.
          </li>
          <li>
            <strong className="text-foreground">Non-UI (or hybrid)</strong> — registers{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">commands</code> only (e.g. palette
            actions) with no extra views, or combines commands with views.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">2. Shell regions (where views mount)</h4>
        <table className="w-full border-collapse border border-border text-[10px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="border border-border px-2 py-1.5 text-left">Region</th>
              <th className="border border-border px-2 py-1.5 text-left">Role</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr>
              <td className="border border-border px-2 py-1 font-mono">primarySidebar</td>
              <td className="border border-border px-2 py-1">Left panel body (beside the rail)</td>
            </tr>
            <tr>
              <td className="border border-border px-2 py-1 font-mono">mainArea</td>
              <td className="border border-border px-2 py-1">Primary editor column (follows active tab)</td>
            </tr>
            <tr>
              <td className="border border-border px-2 py-1 font-mono">secondaryArea</td>
              <td className="border border-border px-2 py-1">Right/auxiliary column</td>
            </tr>
            <tr>
              <td className="border border-border px-2 py-1 font-mono">bottomArea</td>
              <td className="border border-border px-2 py-1">Bottom dock (optional)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">3. Register a hook from the app shell</h4>
        <p className="mb-1 text-muted-foreground">
          First-party plugins use a <code className="font-mono text-[10px]">useRegister…Plugin()</code> hook
          called once from the shell bootstrap (same pattern as Documentation and Observable). Inside{" "}
          <code className="font-mono text-[10px]">useEffect</code>, register views, tab types, rail items,
          and commands; return a cleanup that disposes all disposers.
        </p>
        <CodeBlock>{`// useRegisterMyFeaturePlugin.ts
import { useEffect } from "react";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../views/ShellViewContext";
import { useNodexContributionRegistry } from "../NodexContributionContext";
import { MyMainView } from "./MyMainView";
import { MySidebarView } from "./MySidebarView";

const VIEW_MAIN = "plugin.myfeature.main";
const VIEW_SIDE = "plugin.myfeature.sidebar";
const TAB_MY = "plugin.myfeature.tab";
const PLUGIN_ID = "plugin.myfeature";

export function useRegisterMyFeaturePlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    // React views (props: { viewId, title })
    disposers.push(
      views.registerView({
        id: VIEW_MAIN,
        title: "My feature",
        defaultRegion: "mainArea",
        component: MyMainView,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
      views.registerView({
        id: VIEW_SIDE,
        title: "My feature — tools",
        defaultRegion: "primarySidebar",
        component: MySidebarView,
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
    );

    // Tab links main column to VIEW_MAIN when this tab is active
    disposers.push(
      regs.tabs.registerTabType({
        id: TAB_MY,
        title: "My feature",
        order: 50,
        viewId: VIEW_MAIN,
      }),
    );

    // Rail: new tab + sidebar companion (see ChromeOnlyWorkbench rail handler)
    disposers.push(
      regs.menuRail.registerItem({
        id: "plugin.myfeature.rail",
        title: "My feature",
        icon: "★",
        order: 50,
        tabTypeId: TAB_MY,
        sidebarViewId: VIEW_SIDE,
        // optional: secondaryViewId: "plugin.myfeature.settings",
      }),
    );

    // Command palette / M-x
    disposers.push(
      contrib.registerCommand({
        id: "nodex.myfeature.open",
        title: "My feature: Open",
        category: "My feature",
        sourcePluginId: PLUGIN_ID,
        doc: "Opens My feature in a new tab with the tools sidebar.",
        api: {
          summary: "Open My feature (tab + sidebar).",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "Updates shell layout." },
        },
        handler: () => {
          regs.tabs.openTab(TAB_MY, "My feature");
          views.openView(VIEW_SIDE, "primarySidebar");
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [contrib, regs, views]);
}`}</CodeBlock>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">4. View component shape</h4>
        <p className="mb-1 text-muted-foreground">
          Shell views receive <code className="font-mono text-[10px]">viewId</code> and{" "}
          <code className="font-mono text-[10px]">title</code>. Use hooks for registries and{" "}
          <code className="font-mono text-[10px]">window.Nodex</code> /{" "}
          <code className="font-mono text-[10px]">window.nodex.shell</code> as needed.
        </p>
        <CodeBlock>{`// MyMainView.tsx
import React from "react";
import type { ShellViewComponentProps } from "../../views/ShellViewRegistry";

export function MyMainView({ viewId, title }: ShellViewComponentProps): React.ReactElement {
  return (
    <div className="p-4 text-[13px]">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground">View id: {viewId}</p>
    </div>
  );
}`}</CodeBlock>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">5. Commands, prose docs, and API contract</h4>
        <p className="mb-2 text-muted-foreground">
          Set <code className="font-mono text-[10px]">sourcePluginId</code> and <code className="font-mono text-[10px]">doc</code>{" "}
          on every command. Add an <code className="font-mono text-[10px]">api</code> object so the Documentation
          primary view can show namespace, argument table, generated JSON Schema, example invoke envelope, and
          return type: <code className="font-mono text-[10px]">summary</code>,{" "}
          <code className="font-mono text-[10px]">details</code>, <code className="font-mono text-[10px]">args</code>{" "}
          (name, type, required, description, optional <code className="font-mono text-[10px]">schema</code> per
          field), <code className="font-mono text-[10px]">exampleInvoke</code>, and{" "}
          <code className="font-mono text-[10px]">returns</code>. Use <code className="font-mono text-[10px]">args: []</code>{" "}
          when there are no parameters.
        </p>
        <p className="text-muted-foreground">
          Optional: register keybindings via <code className="font-mono text-[10px]">ShellKeymapRegistry</code> where your
          feature registers.
        </p>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">6. Author SDK (<code className="font-mono">@nodex/plugin-ui</code>)</h4>
        <p className="mb-1 text-muted-foreground">
          For packaged plugin modules, authors describe a single module with{" "}
          <code className="font-mono text-[10px]">definePlugin()</code>: slot components, command metadata,
          and note types. The host compiles <code className="font-mono text-[10px]">ts/tsx/js/jsx</code> and
          (for untrusted code) evaluates inside SES with mediated{" "}
          <code className="font-mono text-[10px]">fetch</code> and host file APIs only — no direct DOM.
        </p>
        <CodeBlock>{`import { definePlugin } from "@nodex/plugin-ui";
import * as React from "react";

function RailWidget() {
  return React.createElement("span", null, "Hi");
}

export default definePlugin({
  id: "com.example.hello",
  version: "1.0.0",
  slots: { rail: RailWidget },
  commands: [
    {
      id: "hello.say",
      title: "Hello: Say hi",
      category: "Hello",
      doc: "Sample command.",
      sourcePluginId: "com.example.hello",
    },
  ],
});`}</CodeBlock>
        <p className="text-muted-foreground">
          Loading user bundles into the live registries is orchestrated by the host (manifest + hashed entry
          URL in production). System plugins in this repo use the hook pattern above instead.
        </p>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">7. Host API (Electron vs web)</h4>
        <p className="text-muted-foreground">
          Use <code className="font-mono text-[10px]">window.Nodex</code> for project/note/file operations
          (preload IPC in Electron, HTTP shim on web). Do not import Node{" "}
          <code className="font-mono text-[10px]">fs</code> or SQLite in renderer plugin code. See{" "}
          <code className="font-mono text-[10px]">src/shared/nodex-renderer-api.ts</code> and{" "}
          <code className="font-mono text-[10px]">plugin-host-capabilities.ts</code> in the repo.
        </p>
      </section>

      <section>
        <h4 className="mb-1 text-[12px] font-semibold">8. Checklist</h4>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>Unique view ids and tab type id; stable plugin id string.</li>
          <li>
            <code className="font-mono text-[10px]">registerView</code> for each region you use.
          </li>
          <li>
            <code className="font-mono text-[10px]">registerTabType</code> if the main column should follow a
            tab.
          </li>
          <li>
            Rail: <code className="font-mono text-[10px]">tabTypeId</code> (+ optional{" "}
            <code className="font-mono text-[10px]">sidebarViewId</code> /{" "}
            <code className="font-mono text-[10px]">secondaryViewId</code>) or <code className="font-mono text-[10px]">commandId</code>.
          </li>
          <li>Register the hook from the shell app entry alongside other plugins.</li>
        </ol>
      </section>

      <section className="rounded-md border border-border bg-muted/20 p-2.5 text-[10px] text-muted-foreground">
        <strong className="text-foreground">Repo reference:</strong>{" "}
        <code className="font-mono">claude-docs/architecture/modular-plugins-architecture.md</code> — high-level
        architecture; this panel is the in-app tutorial.
      </section>
    </div>
  );
}
