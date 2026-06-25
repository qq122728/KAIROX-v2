import type { ReactNode } from "react";

type DangerZoneProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function DangerZone({ title, description, children, className }: DangerZoneProps) {
  return (
    <section className={cx("admin-danger-zone", className)}>
      <div className="admin-danger-zone-copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="admin-danger-zone-actions">{children}</div>
    </section>
  );
}

export default DangerZone;
