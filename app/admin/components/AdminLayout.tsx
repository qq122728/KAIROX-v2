"use client";

import type { ReactNode } from "react";
import AdminHeader, { type AdminRealtimeStatus } from "./AdminHeader";
import AdminSidebar, { type AdminNavGroup, type AdminNavItem } from "./AdminSidebar";

type AdminLayoutProps = {
  title: string;
  description?: string;
  activeNavId?: string;
  children: ReactNode;
  navGroups?: AdminNavGroup[];
  realtimeStatus?: AdminRealtimeStatus;
  lastSync?: string;
  unreadNotifications?: number;
  adminLabel?: string;
  headerActions?: ReactNode;
  notificationSlot?: ReactNode;
  className?: string;
  contentClassName?: string;
  sidebarClassName?: string;
  onNavigate?: (id: string, item: AdminNavItem) => void;
  onNotificationClick?: () => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminLayout({
  title,
  description,
  activeNavId,
  children,
  navGroups,
  realtimeStatus,
  lastSync,
  unreadNotifications,
  adminLabel,
  headerActions,
  notificationSlot,
  className,
  contentClassName,
  sidebarClassName,
  onNavigate,
  onNotificationClick,
}: AdminLayoutProps) {
  return (
    <div className={cx("admin-console", "admin-shell", className)}>
      <AdminSidebar
        activeId={activeNavId}
        className={sidebarClassName}
        groups={navGroups}
        onNavigate={onNavigate}
      />
      <main className="admin-main">
        <AdminHeader
          actions={headerActions}
          adminLabel={adminLabel}
          description={description}
          lastSync={lastSync}
          notificationSlot={notificationSlot}
          onNotificationClick={onNotificationClick}
          realtimeStatus={realtimeStatus}
          title={title}
          unreadNotifications={unreadNotifications}
        />
        <div className={cx("admin-content", contentClassName)}>{children}</div>
      </main>
    </div>
  );
}

export default AdminLayout;
