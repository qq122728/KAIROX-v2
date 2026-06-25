"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  className?: string;
  onPageChange: (page: number) => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Pagination({
  page,
  pageSize,
  total,
  disabled = false,
  className,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <nav className={cx("admin-pagination", className)} aria-label="分页">
      <span className="admin-pagination-range">
        {start}-{end} / {total}
      </span>
      <div className="admin-pagination-actions">
        <button
          aria-label="上一页"
          className="admin-icon-button"
          disabled={disabled || safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
        <span className="admin-pagination-page">
          {safePage} / {totalPages}
        </span>
        <button
          aria-label="下一页"
          className="admin-icon-button"
          disabled={disabled || safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
