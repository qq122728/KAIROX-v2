"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import StatusChip, { type StatusChipTone } from "./StatusChip";

type AdminDrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  width?: 420 | 440 | 460 | number;
  statusLabel?: string;
  statusTone?: StatusChipTone;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClose: () => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminDrawer({
  open,
  title,
  description,
  width = 440,
  statusLabel,
  statusTone,
  children,
  footer,
  className,
  onClose,
}: AdminDrawerProps) {
  if (!open) return null;

  const style = { "--admin-drawer-width": `${width}px` } as CSSProperties;

  return (
    <div className="admin-drawer-layer" role="presentation">
      <button
        aria-label="关闭详情"
        className="admin-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-modal="true"
        className={cx("admin-drawer", className)}
        role="dialog"
        style={style}
      >
        <header className="admin-drawer-header">
          <div>
            <div className="admin-drawer-title-row">
              <h2>{title}</h2>
              {statusLabel ? <StatusChip label={statusLabel} tone={statusTone} /> : null}
            </div>
            {description ? <p>{description}</p> : null}
          </div>
          <button aria-label="关闭" className="admin-icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={17} strokeWidth={2.2} />
          </button>
        </header>
        <div className="admin-drawer-body">{children}</div>
        {footer ? <footer className="admin-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export default AdminDrawer;
