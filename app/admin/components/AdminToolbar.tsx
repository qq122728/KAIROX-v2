"use client";

import type { ReactNode } from "react";
import { RotateCcw, Search } from "lucide-react";
import FilterChip, { type FilterChipTone } from "./FilterChip";

export type AdminToolbarFilter = {
  id: string;
  label: string;
  count?: number | string;
  tone?: FilterChipTone;
  disabled?: boolean;
};

type AdminToolbarProps = {
  searchValue?: string;
  searchPlaceholder?: string;
  filters?: AdminToolbarFilter[];
  activeFilterIds?: string[];
  children?: ReactNode;
  className?: string;
  onSearchChange?: (value: string) => void;
  onFilterToggle?: (id: string) => void;
  onReset?: () => void;
  onSearch?: () => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminToolbar({
  searchValue = "",
  searchPlaceholder = "搜索 UID / 邮箱 / 用户名",
  filters = [],
  activeFilterIds = [],
  children,
  className,
  onSearchChange,
  onFilterToggle,
  onReset,
  onSearch,
}: AdminToolbarProps) {
  return (
    <form
      className={cx("admin-toolbar", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch?.();
      }}
    >
      <label className="admin-toolbar-search">
        <Search aria-hidden="true" size={16} strokeWidth={2.2} />
        <input
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={searchPlaceholder}
          type="search"
          value={searchValue}
        />
      </label>

      {filters.length > 0 ? (
        <div className="admin-toolbar-filters" aria-label="筛选条件">
          {filters.map((filter) => (
            <FilterChip
              active={activeFilterIds.includes(filter.id)}
              count={filter.count}
              disabled={filter.disabled}
              key={filter.id}
              label={filter.label}
              onClick={() => onFilterToggle?.(filter.id)}
              tone={filter.tone}
            />
          ))}
        </div>
      ) : null}

      {children ? <div className="admin-toolbar-extra">{children}</div> : null}

      <div className="admin-toolbar-actions">
        <button className="admin-button admin-button-ghost" onClick={onReset} type="button">
          <RotateCcw aria-hidden="true" size={15} strokeWidth={2.2} />
          重置
        </button>
        <button className="admin-button admin-button-primary" type="submit">
          搜索
        </button>
      </div>
    </form>
  );
}

export default AdminToolbar;
