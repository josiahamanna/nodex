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
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { ShellAppMenuItem } from "./registries/ShellAppMenuRegistry";
import type { ShellTabInstance } from "./registries/ShellTabsRegistry";
import { SHELL_TAB_NOTE } from "./first-party/shellWorkspaceIds";
import {
  SHELL_COLLAPSE_COMPANION_MIN_PX,
  SHELL_COLLAPSE_LEFT_DOCK_MIN_PX,
} from "./shellResponsiveConstants";

function ShellAppMenuList({
  items,
  depth,
  invokeCommand,
  onDone,
}: {
  items: ShellAppMenuItem[];
  depth: number;
  invokeCommand: (commandId: string, args?: Record<string, unknown>) => unknown;
  onDone: () => void;
}): React.ReactElement {
  return (
    <>
      {items.map((item) =>
        item.children?.length ? (
          <div key={item.id}>
            <div
              className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ paddingLeft: 12 + depth * 10 }}
            >
              {item.title}
            </div>
            <ShellAppMenuList
              items={item.children}
              depth={depth + 1}
              invokeCommand={invokeCommand}
              onDone={onDone}
            />
          </div>
        ) : item.commandId ? (
          <button
            key={item.id}
            type="button"
            className="block w-full px-3 py-2 text-left text-[11px] text-foreground hover:bg-muted/40"
            style={{ paddingLeft: 12 + depth * 10 }}
            onClick={() => {
              onDone();
              void Promise.resolve(invokeCommand(item.commandId!, item.args));
            }}
          >
            {item.title}
          </button>
        ) : null,
      )}
    </>
  );
}

function SortableTabRow({
  tab,
  active,
  onSelect,
  onClose,
  onPinNoteTab,
  shellTabNoteTypeId,
}: {
  tab: ShellTabInstance;
  active: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onPinNoteTab?: (instanceId: string) => void;
  shellTabNoteTypeId?: string;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
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
        ref={setActivatorNodeRef}
        className="nodex-tab-drag-handle cursor-grab touch-none rounded-l-md border border-transparent px-1 py-1 text-[10px] text-muted-foreground hover:bg-muted/30 active:cursor-grabbing"
        aria-label="Reorder tab"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⣿
      </button>
      <button
        type="button"
        className={`max-w-[10rem] truncate border px-2 py-1 text-left text-[11px] ${
          active
            ? "border-border bg-muted/50 text-foreground"
            : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/30"
        }`}
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (tab.tabTypeId === shellTabNoteTypeId && onPinNoteTab) {
            onPinNoteTab(tab.instanceId);
          }
        }}
        title={
          tab.tabTypeId === shellTabNoteTypeId
            ? "Double-click title to pin this note tab"
            : tab.instanceId
        }
      >
        {tab.pinned ? "📌 " : ""}
        {tab.title ?? tab.tabTypeId}
      </button>
      <button
        type="button"
        className="relative z-10 rounded-r-md border border-transparent px-1.5 text-[12px] leading-none text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
        aria-label="Close tab"
        title="Close tab"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose(e);
        }}
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
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const appMenuWrapRef = useRef<HTMLDivElement>(null);
  const lastSyncedHash = useRef<string>("");
  const initialHashApplied = useRef(false);

  const primaryRef = React.useRef<ImperativePanelHandle>(null);
  const railPanelRef = React.useRef<ImperativePanelHandle>(null);
  const sidebarPanelRef = React.useRef<ImperativePanelHandle>(null);
  const mainPanelRef = React.useRef<ImperativePanelHandle>(null);
  const secondaryRef = React.useRef<ImperativePanelHandle>(null);
  const bottomRef = React.useRef<ImperativePanelHandle>(null);
  const horizontalWorkspaceRef = useRef<HTMLDivElement>(null);
  const lastViewportWidthRef = useRef(0);

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

  /** Sync primary sidebar + secondary to active tab type; omit companion ids → close region + collapse chrome. */
  useEffect(() => {
    const tabTypeId = activeTab?.tabTypeId ?? null;
    if (!tabTypeId) {
      views.closeRegion("primarySidebar");
      views.closeRegion("secondaryArea");
      store.setVisible("sidebarPanel", false);
      store.setVisible("secondaryArea", false);
      return;
    }
    const t = tabs.getTabType(tabTypeId);
    if (!t) {
      views.closeRegion("primarySidebar");
      views.closeRegion("secondaryArea");
      store.setVisible("sidebarPanel", false);
      store.setVisible("secondaryArea", false);
      return;
    }
    if (t.primarySidebarViewId) {
      views.openView(t.primarySidebarViewId, "primarySidebar");
      store.setVisible("sidebarPanel", true);
    } else {
      views.closeRegion("primarySidebar");
      store.setVisible("sidebarPanel", false);
    }
    if (t.secondaryViewId) {
      views.openView(t.secondaryViewId, "secondaryArea");
      store.setVisible("secondaryArea", true);
    } else {
      views.closeRegion("secondaryArea");
      store.setVisible("secondaryArea", false);
    }
  }, [activeTab?.tabTypeId, activeTab?.instanceId, tabs, views, store]);

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
    if (!appMenuOpen) return;
    const onDocDown = (e: MouseEvent): void => {
      const el = appMenuWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setAppMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [appMenuOpen]);

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

  /** Collapse/expand real `Panel` regions so toggles reclaim space (same idea as unmounting the bottom dock). */
  useLayoutEffect(() => {
    if (!showLeft) {
      primaryRef.current?.collapse();
      return;
    }
    primaryRef.current?.expand(Math.max(10, hSizes[0]));
    const id = window.requestAnimationFrame(() => {
      try {
        if (showMenuRail) {
          railPanelRef.current?.expand(18);
        } else {
          railPanelRef.current?.collapse();
        }
        if (showSidebarPanel) {
          sidebarPanelRef.current?.expand(35);
        } else {
          sidebarPanelRef.current?.collapse();
        }
      } catch {
        /* refs not ready */
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [showLeft, showMenuRail, showSidebarPanel, hSizes[0]]);

  /** When the viewport shrinks, collapse companion and/or left dock if their columns fall below min width (px). */
  useEffect(() => {
    const el = horizontalWorkspaceRef.current;
    if (!el) return;
    let raf = 0;
    const run = (): void => {
      const W = el.clientWidth;
      if (W <= 0) return;
      const prev = lastViewportWidthRef.current;
      lastViewportWidthRef.current = W;
      const shouldReact = prev === 0 || W < prev;
      if (!shouldReact) return;

      const { primaryPct: p, mainPct: m, secondaryPct: s } = layout.sizes;
      const total = showSecondary ? Math.max(1, p + m + s) : Math.max(1, p + m);
      const leftPx = (W * p) / total;
      const rightPx = showSecondary ? (W * s) / total : 0;

      if (showSecondary && rightPx < SHELL_COLLAPSE_COMPANION_MIN_PX) {
        secondaryRef.current?.collapse();
      }
      if (showLeft && leftPx < SHELL_COLLAPSE_LEFT_DOCK_MIN_PX) {
        primaryRef.current?.collapse();
      }
    };
    const schedule = (): void => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        run();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [layout.sizes, showSecondary, showLeft]);

  return (
    <div className="nodex-app-pad box-border flex min-h-0 flex-1 flex-col bg-muted/45 text-foreground dark:bg-muted/25">
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm box-border outline-none"
        data-nodex-main-surface
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-1.5">
          <div className="relative" ref={appMenuWrapRef}>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/20 text-[12px] font-semibold hover:bg-muted/40"
              title="App menu — Welcome and shell actions"
              aria-expanded={appMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                if (appMenuItems.length === 0) {
                  store.toggle("sidebarPanel");
                  return;
                }
                setAppMenuOpen((v) => !v);
              }}
            >
              N
            </button>
            {appMenuOpen && appMenuItems.length > 0 ? (
              <div
                className="absolute left-0 top-full z-50 mt-1 min-w-[13rem] overflow-hidden rounded-md border border-border bg-background py-1 shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-[11px] text-foreground hover:bg-muted/40"
                  onClick={() => {
                    setAppMenuOpen(false);
                    tabs.openOrReuseTab("shell.tab.welcome", {
                      title: "Welcome",
                      reuseKey: "shell:welcome",
                    });
                  }}
                >
                  Welcome
                </button>
                <div className="my-1 border-t border-border" role="separator" />
                <ShellAppMenuList
                  items={appMenuItems}
                  depth={0}
                  invokeCommand={invokeCommand}
                  onDone={() => setAppMenuOpen(false)}
                />
              </div>
            ) : null}
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
                    shellTabNoteTypeId={SHELL_TAB_NOTE}
                    onPinNoteTab={(instanceId) => tabs.pinNoteTab(instanceId, SHELL_TAB_NOTE)}
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
              title="Toggle activity bar"
            >
              Activity bar
            </button>
            <button
              type="button"
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
              onClick={() => store.toggle("sidebarPanel")}
              title="Toggle side panel"
            >
              Side panel
            </button>
            <button
              type="button"
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30"
              onClick={() => store.toggle("secondaryArea")}
              title="Toggle companion"
            >
              Companion
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
            {/*
              Horizontal workbench: left dock (activity bar + side panel) | main area | companion.
              primaryRef = entire left dock; center column = main area; secondaryRef = companion.
            */}
            <div
              ref={horizontalWorkspaceRef}
              className="flex h-full min-h-0 min-w-0 w-full flex-col"
            >
              <PanelGroup
                direction="horizontal"
                className="h-full min-h-0 min-w-0 flex-1 box-border"
                onLayout={(sizes) => {
                  store.patch((cur) => {
                    if (sizes.length >= 3) {
                      const [p, m, s] = sizes;
                      return {
                        ...cur,
                        sizes: {
                          ...cur.sizes,
                          primaryPct: p,
                          mainPct: m,
                          secondaryPct: s,
                        },
                      };
                    }
                    const [p, m] = sizes;
                    return {
                      ...cur,
                      sizes: {
                        ...cur.sizes,
                        primaryPct: p,
                        mainPct: m,
                      },
                    };
                  });
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
                  <PanelGroup direction="horizontal" className="h-full min-h-0 min-w-0">
                    <Panel
                      ref={railPanelRef}
                      order={1}
                      defaultSize={18}
                      minSize={0}
                      maxSize={28}
                      collapsible
                      collapsedSize={0}
                      className="min-w-0"
                      onCollapse={() => store.setVisible("menuRail", false)}
                      onExpand={() => store.setVisible("menuRail", true)}
                    >
                    <div className="flex h-full min-h-0 w-full flex-col items-center gap-1 border-r border-border bg-muted/15 py-2">
                      {railItems.map((it) => {
                        const railActive = Boolean(
                          activeTab?.tabTypeId && it.tabTypeId && it.tabTypeId === activeTab.tabTypeId,
                        );
                        return (
                          <button
                            key={it.id}
                            type="button"
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[12px] ${
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
                  </Panel>
                  <PanelResizeHandle className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active" />
                  <Panel
                    ref={sidebarPanelRef}
                    order={2}
                    defaultSize={82}
                    minSize={0}
                    collapsible
                    collapsedSize={0}
                    className="min-w-0"
                    onCollapse={() => store.setVisible("sidebarPanel", false)}
                    onExpand={() => store.setVisible("sidebarPanel", true)}
                  >
                    {primaryView ? (
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
                                title="Side panel menu"
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
                        <div className="min-h-0 min-w-0 flex-1">
                          <ShellViewHost view={primaryView} />
                        </div>
                      </div>
                    ) : (
                      <div className="h-full min-h-0 w-full bg-background" />
                    )}
                  </Panel>
                </PanelGroup>
              </Panel>
              {renderSash("sash-primary")}
              <Panel
                ref={mainPanelRef}
                defaultSize={hSizes[1]}
                minSize={30}
                className="min-w-0"
              >
                <div
                  className="h-full min-h-0 min-w-0 w-full bg-background"
                  role="region"
                  aria-label="Main area"
                  title="Main area"
                >
                  {mainView ? <ShellViewHost view={mainView} activeMainTab={activeTab} /> : null}
                </div>
              </Panel>
              {showSecondary ? (
                <>
                  {renderSash("sash-secondary")}
                  <Panel
                    ref={secondaryRef}
                    defaultSize={hSizes[2]}
                    minSize={8}
                    collapsible
                    collapsedSize={0}
                    onCollapse={() => store.setVisible("secondaryArea", false)}
                    onExpand={() => store.setVisible("secondaryArea", true)}
                    className="min-w-0"
                  >
                    <div className="h-full min-h-0 min-w-0 w-full bg-background">
                      {secondaryView ? <ShellViewHost view={secondaryView} /> : null}
                    </div>
                  </Panel>
                </>
              ) : null}
            </PanelGroup>
            </div>
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
