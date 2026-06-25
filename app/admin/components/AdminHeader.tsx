"use client";

import type { ReactNode } from "react";
import { Bell, CircleUserRound, Radio } from "lucide-react";

export type AdminRealtimeStatus = "connected" | "connecting" | "polling" | "offline";

type AdminHeaderProps = {
  title: string;
  description?: string;
  realtimeStatus?: AdminRealtimeStatus;
  lastSync?: string;
  unreadNotifications?: number;
  adminLabel?: string;
  actions?: ReactNode;
  notificationSlot?: ReactNode;
  className?: string;
  onNotificationClick?: () => void;
};

const realtimeLabels: Record<AdminRealtimeStatus, string> = {
  connected: "实时连接",
  connecting: "连接中",
  polling: "轮询中",
  offline: "已离线",
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminHeader({
  title,
  description,
  realtimeStatus = "connected",
  lastSync,
  unreadNotifications = 0,
  adminLabel = "管理员",
  actions,
  notificationSlot,
  className,
  onNotificationClick,
}: AdminHeaderProps) {
  return (
    <header className={cx("admin-header", className)}>
      <div className="admin-header-title">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>

      <div className="admin-header-meta">
        <div className={cx("admin-realtime", `is-${realtimeStatus}`)}>
          <Radio aria-hidden="true" size={14} strokeWidth={2.3} />
          <span>{realtimeLabels[realtimeStatus]}</span>
        </div>
        {lastSync ? <span className="admin-last-sync">最后同步 {lastSync}</span> : null}
        {actions}
        {notificationSlot ?? (
          <button
            aria-label="通知中心"
            className="admin-icon-button"
            onClick={onNotificationClick}
            type="button"
          >
            <Bell aria-hidden="true" size={17} strokeWidth={2.2} />
            {unreadNotifications > 0 ? (
              <span className="admin-notification-dot">{unreadNotifications}</span>
            ) : null}
          </button>
        )}
        <div className="admin-avatar" aria-label={adminLabel} title={adminLabel}>
          <CircleUserRound aria-hidden="true" size={18} strokeWidth={2.2} />
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;
