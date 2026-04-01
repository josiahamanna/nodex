import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { useShellLayoutState, useShellLayoutStore } from "./layout/ShellLayoutContext";
import {
  hashForActiveTab,
  parseShellHash,
  replaceWindowHash,
} from "./shellTabUrlSync";
import { useShellNavigation } from "./useShellNavigation";
import { ShellViewHost } from "./views/ShellViewHost";
import { useShellViewRegistry } from "./views/ShellViewContext";
import { useShellRegistries } from "./registries/ShellRegistriesContext";
import type { ShellTabInstance } from "./registries/ShellTabsRegistry";

function SortableTabRow({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: ShellTabInstance;
  active: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.instanceId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex shrink-0 items-stretch gap-0.5 rounded-md border border-transparent hover:border-border/60"
    >
      <button
        type="button"
        className={`max-w-[10rem] truncate rounded-l-md border px-2 py-1 text-left text-[11px] ${
          active
            ? "border-border bg-muted/50 text-foreground"
            : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/30"
        }`}
        onClick={onSelect}
        title={tab.instanceId}
        {...attributes}
        {...listeners}
      >
        {tab.title ?? tab.tabTypeId}
      </button>
      <button
        type="button"
        className="rounded-r-md px-1.5 text-[12px] leading-none text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        aria-label="Close tab"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}

export function ChromeOnlyWorkbench(): React.ReactElement {
  const layout = useShellLayoutState();
  const store = useShellLayoutStore();
  const views = useShellViewRegistry();
  const { menuRail, appMenu, panelMenu, tabs, widgetSlots } = useShellRegistries();
  const { openFromRailItem, openNoteById, invokeCommand } = useShellNavigation();
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const lastSyncedHash = useRef<string>("");
  const initialHashApplied = useRef(false);

  const primaryRef = React.useRef<ImperativePanelHandle>(null);
  const secondaryRef = React.useRef<ImperativePanelHandle>(null);
  const bottomRef = React.useRef<ImperativePanelHandle>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const closeTabInstance = useCallback(
    (instanceId: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      tabs.closeTab(instanceId);
      if (tabs.listOpenTabs().length === 0) {
        tabs.openOrReuseTab("shell.tab.welcome", { title: "Welcome", reuseKey: "shell:welcome" });
      }
    },
    [tabs],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = openTabs.findIndex((t) => t.instanceId === active.id);
      const newIndex = openTabs.findIndex((t) => t.instanceId === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      tabs.reorderTabs(oldIndex, newIndex);
    },
    [openTabs, tabs],
  );

  useEffect(() => {
    const instId = activeTab?.instanceId ?? null;
    if (!instId) return;
    const viewId = tabs.resolveViewForInstance(instId);
    if (!viewId) return;
    views.openView(viewId, "mainArea");
  }, [activeTab?.instanceId, tabs, views]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (initialHashApplied.current) return;
      initialHashApplied.current = true;
      const parsed = parseShellHash();
      if (parsed?.kind === "note") {
        openNoteById(parsed.noteId);
      } else if (parsed?.kind === "tab") {
        const inst = tabs.listOpenTabs().find((i) => i.instanceId === parsed.instanceId);
        if (inst) {
          tabs.setActiveTab(inst.instanceId);
        }
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [openNoteById, tabs]);

  useEffect(() => {
    return tabs.subscribe(() => {
      const a = tabs.getActiveTab();
      const h = hashForActiveTab(a);
      if (!h) {
        if (lastSyncedHash.current !== "") {
          replaceWindowHash("");
          lastSyncedHash.current = "";
        }
        return;
      }
      if (typeof window !== "undefined" && window.location.hash === h) {
        lastSyncedHash.current = h;
        return;
      }
      if (h === lastSyncedHash.current) return;
      replaceWindowHash(h);
      lastSyncedHash.current = h;
    });
  }, [tabs]);

  useEffect(() => {
    const onHash = (): void => {
      const parsed = parseShellHash();
      if (parsed?.kind === "note") {
        openNoteById(parsed.noteId);
      } else if (parsed?.kind === "tab") {
        const inst = tabs.listOpenTabs().find((i) => i.instanceId === parsed.instanceId);
        if (inst) {
          tabs.setActiveTab(inst.instanceId);
        }
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [openNoteById, tabs]);

  const renderSash = (key: string) => (
    <PanelResizeHandle
      key={key}
      className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active"
    />
  );

  const sortableIds = openTabs.map((t) => t.instanceId);

  return (
    <div className="nodex-app-pad box-border flex min-h-0 flex-1 flex-col bg-muted/45 text-foreground dark:bg-muted/25">
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm box-border outline-none"
        data-nodex-main-surface
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-1.5">
          <div className="relative">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/20 text-[12px] font-semibold hover:bg-muted/40"
              title="App menu"
              onClick={() => {
                if (appMenuItems.length === 0) {
                  store.toggle("sidebarPanel");
                }
              }}
            >
              N
            </button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {openTabs.map((t) => (
                  <SortableTabRow
                    key={t.instanceId}
                    tab={t}
                    active={t.instanceId === activeTab?.instanceId}
                    onSelect={() => tabs.setActiveTab(t.instanceId)}
                    onClose={closeTabInstance(t.instanceId)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
                    {showMenuRail ? (
                      <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/15 py-2">
                        {railItems.map((it) => {
                          const railActive = Boolean(
                            activeTab?.tabTypeId && it.tabTypeId && it.tabTypeId === activeTab.tabTypeId,
                          );
                          return (
                            <button
                              key={it.id}
                              type="button"
                              className={`flex h-9 w-9 items-center justify-center rounded-md border text-[12px] ${
                                railActive
                                  ? "border-border bg-muted/50 text-foreground"
                                  : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/30"
                              }`}
                              title={it.title}
                              onClick={() => openFromRailItem(it)}
                            >
                              {it.icon ?? "•"}
                            </button>
                          );
                        })}
                        {widgetSlots.list("rail").map((w) => {
                          const W = w.component;
                          return (
                            <div key={w.id} className="w-full border-t border-border/40 pt-1">
                              <W slotId="rail" />
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
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
                                        .map((item) => (
                                          <button
                                            key={item.id}
                                            type="button"
                                            className="block w-full px-3 py-2 text-left text-[11px] text-foreground hover:bg-muted/40"
                                            onClick={() => {
                                              setPanelMenuOpen(false);
                                              void Promise.resolve(
                                                invokeCommand(item.commandId, item.commandArgs),
                                              );
                                            }}
                                          >
                                            {item.title}
                                          </button>
                                        ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <div className="min-h-0 flex-1">
                              <ShellViewHost view={primaryView} />
                            </div>
                          </div>
                        ) : (
                          <div className="h-full min-h-0 w-full bg-background" />
                        )
                      ) : (
                        <div className="h-full min-h-0 w-full bg-background" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-0 w-full bg-background" />
                )}
              </Panel>
              {renderSash("sash-primary")}
              <Panel defaultSize={hSizes[1]} minSize={30} className="min-w-0">
                <div className="h-full min-h-0 w-full bg-background">
                  {mainView ? <ShellViewHost view={mainView} activeMainTab={activeTab} /> : null}
                </div>
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
                  <div className="h-full min-h-0 w-full bg-background">
                    {secondaryView ? <ShellViewHost view={secondaryView} /> : null}
                  </div>
                ) : (
                  <div className="h-full min-h-0 w-full bg-background" />
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
                <div className="h-full min-h-0 w-full bg-background">
                  {bottomView ? <ShellViewHost view={bottomView} /> : null}
                </div>
              </Panel>
            </>
          ) : null}
        </PanelGroup>
      </div>
    </div>
  );
}
