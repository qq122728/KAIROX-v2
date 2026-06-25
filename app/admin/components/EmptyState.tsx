import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx("admin-empty-state", compact && "is-compact", className)}>
      <div className="admin-empty-state-icon">
        <Icon aria-hidden="true" size={compact ? 18 : 22} strokeWidth={2.1} />
      </div>
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="admin-empty-state-action">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
