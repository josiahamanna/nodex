import React, { useEffect, useMemo, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { useShellLayoutState, useShellLayoutStore } from "./layout/ShellLayoutContext";
import { ShellIFrameViewHost } from "./views/ShellViewRegistry";
import { useShellViewRegistry } from "./views/ShellViewContext";
import { useShellRegistries } from "./registries/ShellRegistriesContext";

function EmptyRegion({ title }: { title: string }): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-3">
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        {title} (empty)
      </div>
    </div>
  );
}

export function ChromeOnlyWorkbench(): React.ReactElement {
  const layout = useShellLayoutState();
  const store = useShellLayoutStore();
  const views = useShellViewRegistry();
  const { menuRail, appMenu, panelMenu, tabs } = useShellRegistries();
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);

  const primaryRef = React.useRef<ImperativePanelHandle>(null);
  const secondaryRef = React.useRef<ImperativePanelHandle>(null);
  const bottomRef = React.useRef<ImperativePanelHandle>(null);

  const hSizes = useMemo(() => {
    const { primaryPct, mainPct, secondaryPct } = layout.sizes;
    const total = Math.max(1, primaryPct + mainPct + secondaryPct);
    return [
      (primaryPct / total) * 100,
      (mainPct / total) * 100,
      (secondaryPct / total) * 100,
    ];
  }, [layout.sizes]);

  const showMenuRail = layout.visible.menuRail;
  const showSidebarPanel = layout.visible.sidebarPanel;
  const showLeft = showMenuRail || showSidebarPanel;
  const showSecondary = layout.visible.secondaryArea;
  const showBottom = layout.visible.bottomArea;

  const primaryViewId = views.getOpenViewId("primarySidebar");
  const mainViewId = views.getOpenViewId("mainArea");
  const secondaryViewId = views.getOpenViewId("secondaryArea");
  const bottomViewId = views.getOpenViewId("bottomArea");

  const primaryView = primaryViewId ? views.getView(primaryViewId) : undefined;
  const mainView = mainViewId ? views.getView(mainViewId) : undefined;
  const secondaryView = secondaryViewId ? views.getView(secondaryViewId) : undefined;
  const bottomView = bottomViewId ? views.getView(bottomViewId) : undefined;

  const railItems = menuRail.list();
  const appMenuItems = appMenu.list();
  const openTabs = tabs.listOpenTabs();
  const activeTab = tabs.getActiveTab();

  // Keep main area view in sync with active tab type.
  useEffect(() => {
    const instId = activeTab?.instanceId ?? null;
    if (!instId) return;
    const viewId = tabs.resolveViewForInstance(instId);
    if (!viewId) return;
    views.openView(viewId, "mainArea");
  }, [activeTab?.instanceId, tabs, views]);

  const renderSash = (key: string) => (
    <PanelResizeHandle
      key={key}
      className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active"
    />
  );

  return (
    <div className="nodex-app-pad box-border flex min-h-0 flex-1 flex-col bg-muted/45 text-foreground dark:bg-muted/25">
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm box-border outline-none"
        data-nodex-main-surface
        tabIndex={-1}
      >
        {/* Top bar: N menu + primary tabs */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-1.5">
          <div className="relative">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/20 text-[12px] font-semibold hover:bg-muted/40"
              title="App menu"
              onClick={() => {
                // Minimal: if items exist, open first leaf command via palette later.
                // For now, toggle sidebar visibility as a visible affordance.
                if (appMenuItems.length === 0) {
                  store.toggle("sidebarPanel");
                }
              }}
            >
              N
            </button>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {openTabs.length === 0 ? (
              <div className="px-2 text-[11px] text-muted-foreground">No tabs</div>
            ) : (
              openTabs.map((t) => {
                const active = t.instanceId === activeTab?.instanceId;
                return (
                  <button
                    key={t.instanceId}
                    type="button"
                    className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${
                      active
                        ? "border-border bg-muted/50 text-foreground"
                        : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/30"
                    }`}
                    onClick={() => tabs.setActiveTab(t.instanceId)}
                    title={t.instanceId}
                  >
                    {t.title ?? t.tabTypeId}
                  </button>
                );
              })
            )}
          </div>
          {/* Collapse/expand indicators */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
              onClick={() => store.toggle("menuRail")}
              title="Toggle menu rail"
            >
              Rail
            </button>
            <button
              type="button"
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
              onClick={() => store.toggle("sidebarPanel")}
              title="Toggle sidebar panel"
            >
              Panel
            </button>
            <button
              type="button"
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
              onClick={() => store.toggle("secondaryArea")}
              title="Toggle secondary area"
            >
              Secondary
            </button>
            <button
              type="button"
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
              onClick={() => store.toggle("bottomArea")}
              title="Toggle bottom dock"
            >
              Bottom
            </button>
          </div>
        </div>

        <PanelGroup
          direction="vertical"
          className="h-full min-h-0 min-w-0 flex-1 box-border"
        >
          <Panel defaultSize={100 - layout.bottomTabs.heightPct} minSize={40} className="min-h-0">
            <PanelGroup
              direction="horizontal"
              className="h-full min-h-0 min-w-0 flex-1 box-border"
              onLayout={(sizes) => {
                // sizes is [p, m, s] in percentages (0-100)
                const [p, m, s] = sizes;
                store.patch((cur) => ({
                  ...cur,
                  sizes: {
                    ...cur.sizes,
                    primaryPct: p,
                    mainPct: m,
                    secondaryPct: s,
                  },
                }));
              }}
            >
              <Panel
                ref={primaryRef}
                defaultSize={hSizes[0]}
                minSize={showLeft ? 8 : 0}
                collapsible
                collapsedSize={0}
                onCollapse={() => {
                  store.setVisible("menuRail", false);
                  store.setVisible("sidebarPanel", false);
                }}
                onExpand={() => {
                  store.setVisible("menuRail", true);
                  store.setVisible("sidebarPanel", true);
                }}
                className="min-w-0"
              >
                {showLeft ? (
                  <div className="flex h-full min-h-0">
                    {/* Menu rail */}
                    {showMenuRail ? (
                      <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/15 py-2">
                      {railItems.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : (
                        railItems.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-[12px] text-muted-foreground hover:border-border hover:bg-muted/30"
                            title={it.title}
                            onClick={() => {
                              if (it.openViewId) {
                                views.openView(it.openViewId, it.openViewRegion ?? "primarySidebar");
                                return;
                              }
                              if (it.commandId) {
                                void Promise.resolve(
                                  (window.nodex as any)?.shell?.commands?.invoke?.(it.commandId, it.commandArgs),
                                );
                              }
                            }}
                          >
                            {it.icon ?? "•"}
                          </button>
                        ))
                      )}
                      </div>
                    ) : null}
                    {/* Panel body */}
                    <div className="min-w-0 flex-1">
                      {showSidebarPanel ? (
                        primaryView ? (
                          <div className="flex h-full min-h-0 flex-col">
                            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/10 px-2 py-1">
                              <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
                                {primaryView.title}
                              </div>
                              {panelMenu.listFor("primarySidebar", primaryView.id).length > 0 ? (
                                <div className="relative">
                                  <button
                                    type="button"
                                    className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
                                    onClick={() => setPanelMenuOpen((v) => !v)}
                                    title="Panel menu"
                                  >
                                    ⋯
                                  </button>
                                  {panelMenuOpen ? (
                                    <div className="absolute right-0 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-md border border-border bg-background shadow-lg">
                                      {panelMenu
                                        .listFor("primarySidebar", primaryView.id)
                                        .map((it) => (
                                          <button
                                            key={it.id}
                                            type="button"
                                            className="block w-full px-3 py-2 text-left text-[11px] text-foreground hover:bg-muted/40"
                                            onClick={() => {
                                              setPanelMenuOpen(false);
                                              void Promise.resolve(
                                                (window.nodex as any)?.shell?.commands?.invoke?.(
                                                  it.commandId,
                                                  it.commandArgs,
                                                ),
                                              );
                                            }}
                                          >
                                            {it.title}
                                          </button>
                                        ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <div className="min-h-0 flex-1">
                              <ShellIFrameViewHost view={primaryView} />
                            </div>
                          </div>
                        ) : (
                          <EmptyRegion title="Sidebar panel" />
                        )
                      ) : (
                        <EmptyRegion title="Sidebar panel (hidden)" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full" />
                )}
              </Panel>
              {renderSash("sash-primary")}
              <Panel defaultSize={hSizes[1]} minSize={30} className="min-w-0">
                {mainView ? (
                  <ShellIFrameViewHost view={mainView} />
                ) : activeTab ? (
                  <EmptyRegion title={`Primary area (${activeTab.tabTypeId})`} />
                ) : (
                  <EmptyRegion title="Primary area" />
                )}
              </Panel>
              {renderSash("sash-secondary")}
              <Panel
                ref={secondaryRef}
                defaultSize={hSizes[2]}
                minSize={showSecondary ? 8 : 0}
                collapsible
                collapsedSize={0}
                onCollapse={() => store.setVisible("secondaryArea", false)}
                onExpand={() => store.setVisible("secondaryArea", true)}
                className="min-w-0"
              >
                {showSecondary ? (
                  secondaryView ? (
                    <ShellIFrameViewHost view={secondaryView} />
                  ) : (
                    <EmptyRegion title="Secondary area" />
                  )
                ) : (
                  <div className="h-full" />
                )}
              </Panel>
            </PanelGroup>
          </Panel>

          {showBottom ? (
            <>
              <PanelResizeHandle className="nodex-panel-sash relative h-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-x-0 before:top-1/2 before:z-10 before:h-px before:-translate-y-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active" />
              <Panel
                ref={bottomRef}
                defaultSize={layout.bottomTabs.heightPct}
                minSize={10}
                collapsible
                collapsedSize={0}
                onCollapse={() => store.setVisible("bottomArea", false)}
                onExpand={() => store.setVisible("bottomArea", true)}
                className="min-h-0"
                onResize={(size) => {
                  store.patch((cur) => ({
                    ...cur,
                    bottomTabs: { ...cur.bottomTabs, heightPct: size },
                  }));
                }}
              >
                {bottomView ? (
                  <ShellIFrameViewHost view={bottomView} />
                ) : (
                  <EmptyRegion title="Bottom dock (output/terminal/notebook)" />
                )}
              </Panel>
            </>
          ) : null}
        </PanelGroup>
      </div>
    </div>
  );
}

