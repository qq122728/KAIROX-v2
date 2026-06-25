"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownToLine,
  Bell,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
  WalletCards,
  Wrench,
} from "lucide-react";

export type AdminNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  disabled?: boolean;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const defaultAdminNavGroups: AdminNavGroup[] = [
  {
    label: "运营中心",
    items: [
      { id: "dashboard", label: "首页", icon: LayoutDashboard },
      { id: "notifications", label: "通知中心", icon: Bell },
    ],
  },
  {
    label: "用户管理",
    items: [
      { id: "users", label: "用户", icon: Users },
      { id: "funds", label: "资金", icon: Wallet },
    ],
  },
  {
    label: "审核中心",
    items: [
      { id: "deposits", label: "充值审核", icon: CircleDollarSign },
      { id: "withdrawals", label: "提现审核", icon: ArrowDownToLine },
      { id: "kyc", label: "KYC审核", icon: ShieldCheck },
    ],
  },
  {
    label: "交易中心",
    items: [
      { id: "binary-orders", label: "二元订单", icon: WalletCards },
      { id: "perpetual-positions", label: "永续持仓", icon: Activity },
    ],
  },
  {
    label: "系统",
    items: [
      { id: "markets", label: "交易市场", icon: Landmark },
      { id: "settings", label: "平台设置", icon: Settings2 },
      { id: "maintenance", label: "系统维护", icon: Wrench },
    ],
  },
];

type AdminSidebarProps = {
  activeId?: string;
  groups?: AdminNavGroup[];
  brandLabel?: string;
  brandSubtitle?: string;
  className?: string;
  onNavigate?: (id: string, item: AdminNavItem) => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminSidebar({
  activeId = "dashboard",
  groups = defaultAdminNavGroups,
  brandLabel = "VORX",
  brandSubtitle = "运营控制中心",
  className,
  onNavigate,
}: AdminSidebarProps) {
  return (
    <aside className={cx("admin-sidebar", className)} aria-label="后台导航">
      <div className="admin-sidebar-brand">
        <span className="admin-sidebar-logo">{brandLabel}</span>
        <span className="admin-sidebar-subtitle">{brandSubtitle}</span>
      </div>

      <nav className="admin-sidebar-nav">
        {groups.map((group) => (
          <section className="admin-sidebar-group" key={group.label}>
            <div className="admin-sidebar-group-label">{group.label}</div>
            <div className="admin-sidebar-group-items">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeId;

                return (
                  <button
                    aria-current={active ? "page" : undefined}
                    className={cx("admin-sidebar-item", active && "is-active")}
                    disabled={item.disabled}
                    key={item.id}
                    onClick={() => onNavigate?.(item.id, item)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={16} strokeWidth={2.2} />
                    <span>{item.label}</span>
                    {item.badge !== undefined ? (
                      <span className="admin-sidebar-badge">{item.badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}

export default AdminSidebar;
