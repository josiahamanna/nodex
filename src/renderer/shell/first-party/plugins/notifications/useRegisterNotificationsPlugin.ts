import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../../../store";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { NotificationPanel } from "./NotificationPanel";
import { NotificationMainView } from "./NotificationMainView";

const NOTIFICATIONS_TAB_TYPE_ID = "shell.notifications";
const NOTIFICATIONS_VIEW_MAIN = "shell.view.notifications.main";
const NOTIFICATIONS_VIEW_SIDEBAR = "shell.view.notifications.sidebar";

export function useRegisterNotificationsPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const unreadCount = useSelector((s: RootState) => s.notifications.unreadCount);

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: NOTIFICATIONS_VIEW_MAIN,
        title: "Notifications",
        defaultRegion: "mainArea",
        component: NotificationMainView,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    disposers.push(
      views.registerView({
        id: NOTIFICATIONS_VIEW_SIDEBAR,
        title: "Notifications",
        defaultRegion: "primarySidebar",
        component: NotificationPanel,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: NOTIFICATIONS_TAB_TYPE_ID,
        title: "Notifications",
        viewId: NOTIFICATIONS_VIEW_MAIN,
        primarySidebarViewId: NOTIFICATIONS_VIEW_SIDEBAR,
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "shell.rail.notifications",
        title: `Notifications${unreadCount > 0 ? ` (${unreadCount > 99 ? "99+" : unreadCount})` : ""}`,
        icon: "🔔",
        order: 25,
        tabTypeId: NOTIFICATIONS_TAB_TYPE_ID,
        sidebarViewId: NOTIFICATIONS_VIEW_SIDEBAR,
      }),
    );

    return () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, [regs, views, unreadCount]);
}
