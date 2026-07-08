"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    const btn = moreRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // If less than 200px below, flip upward
    const top = spaceBelow < 200 ? rect.top - 8 : rect.bottom + 8;
    // Pin right edge, but ensure it doesn't overflow left
    const right = Math.max(8, window.innerWidth - rect.right);
    setPos({ top, right });
    setOpen(true);
  }, [open, close]);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onScroll = () => close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

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
        onClick={toggle}
        ref={moreRef}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={15} strokeWidth={2.2} />
        {moreLabel}
      </button>
      {open && pos ? (
        <div
          className="admin-action-dropdown"
          ref={dropdownRef}
          role="menu"
          style={{
            position: "fixed",
            top: `${pos.top}px`,
            right: `${pos.right}px`,
            zIndex: 50,
          }}
        >
          {items.map((item) => (
            <button
              className={cx("admin-action-dropdown-item", item.tone === "danger" && "is-danger")}
              disabled={item.disabled}
              key={item.id}
              onClick={() => {
                item.onSelect?.();
                close();
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
