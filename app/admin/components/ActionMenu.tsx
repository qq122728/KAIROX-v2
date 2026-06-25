"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, MoreHorizontal } from "lucide-react";

export type ActionMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  onSelect?: () => void;
};

type ActionMenuProps = {
  items?: ActionMenuItem[];
  primaryLabel?: string;
  moreLabel?: string;
  className?: string;
  onPrimaryClick?: () => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ActionMenu({
  items = [],
  primaryLabel = "查看",
  moreLabel = "更多",
  className,
  onPrimaryClick,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={cx("admin-action-menu", className)} ref={rootRef}>
      <button className="admin-action-primary" onClick={onPrimaryClick} type="button">
        <Eye aria-hidden="true" size={14} strokeWidth={2.2} />
        {primaryLabel}
      </button>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="admin-action-more"
        disabled={items.length === 0}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={15} strokeWidth={2.2} />
        {moreLabel}
      </button>
      {open ? (
        <div className="admin-action-dropdown" role="menu">
          {items.map((item) => (
            <button
              className={cx("admin-action-dropdown-item", item.tone === "danger" && "is-danger")}
              disabled={item.disabled}
              key={item.id}
              onClick={() => {
                item.onSelect?.();
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ActionMenu;
