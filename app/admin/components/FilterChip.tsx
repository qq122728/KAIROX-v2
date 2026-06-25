"use client";

export type FilterChipTone = "default" | "success" | "warning" | "danger" | "info" | "muted";

type FilterChipProps = {
  label: string;
  active?: boolean;
  count?: number | string;
  tone?: FilterChipTone;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function FilterChip({
  label,
  active = false,
  count,
  tone = "default",
  disabled = false,
  className,
  onClick,
}: FilterChipProps) {
  return (
    <button
      aria-pressed={active}
      className={cx("admin-filter-chip", `is-${tone}`, active && "is-active", className)}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      {count !== undefined ? <span className="admin-filter-chip-count">{count}</span> : null}
    </button>
  );
}

export default FilterChip;
