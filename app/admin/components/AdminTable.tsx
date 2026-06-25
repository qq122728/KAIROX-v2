import type { Key, ReactNode } from "react";
import EmptyState from "./EmptyState";

export type AdminTableAlign = "left" | "center" | "right";

export type AdminTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: AdminTableAlign;
  numeric?: boolean;
  className?: string;
};

type AdminTableProps<T> = {
  columns: Array<AdminTableColumn<T>>;
  rows: T[];
  getRowKey: (row: T) => Key;
  selectedRowKey?: Key;
  emptyState?: ReactNode;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function columnAlignClass(align?: AdminTableAlign, numeric?: boolean) {
  if (numeric || align === "right") return "is-right";
  if (align === "center") return "is-center";
  return "is-left";
}

export function AdminTable<T,>({
  columns,
  rows,
  getRowKey,
  selectedRowKey,
  emptyState,
  className,
  rowClassName,
  onRowClick,
}: AdminTableProps<T>) {
  return (
    <div className={cx("admin-table-shell", className)}>
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={cx(columnAlignClass(column.align, column.numeric), column.className)}
                key={column.id}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => {
              const key = getRowKey(row);
              const selected =
                selectedRowKey !== undefined && String(selectedRowKey) === String(key);

              return (
                <tr
                  className={cx(
                    onRowClick && "is-clickable",
                    selected && "is-selected",
                    rowClassName?.(row),
                  )}
                  key={key}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <td
                      className={cx(columnAlignClass(column.align, column.numeric), column.className)}
                      key={column.id}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="admin-table-empty-cell" colSpan={columns.length}>
                {emptyState ?? (
                  <EmptyState compact description="调整筛选条件后再试。" title="暂无数据" />
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default AdminTable;
