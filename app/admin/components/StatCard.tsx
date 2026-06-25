import type { ReactNode } from "react";

export type StatCardTone = "default" | "success" | "warning" | "danger" | "info" | "muted";

type StatCardProps = {
  title: string;
  value: ReactNode;
  description?: ReactNode;
  tone?: StatCardTone;
  icon?: ReactNode;
  className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function StatCard({
  title,
  value,
  description,
  tone = "default",
  icon,
  className,
}: StatCardProps) {
  return (
    <article className={cx("admin-stat-card", `is-${tone}`, className)}>
      <div className="admin-stat-card-header">
        <span className="admin-stat-card-title">{title}</span>
        {icon ? <span className="admin-stat-card-icon">{icon}</span> : null}
      </div>
      <div className="admin-stat-card-value">{value}</div>
      {description ? <div className="admin-stat-card-description">{description}</div> : null}
    </article>
  );
}

export default StatCard;
