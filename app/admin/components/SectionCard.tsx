import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "danger";
  className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function SectionCard({
  title,
  description,
  children,
  tone = "default",
  className,
}: SectionCardProps) {
  return (
    <section className={cx("admin-section-card", tone === "danger" && "is-danger", className)}>
      <div className="admin-section-card-header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="admin-section-card-body">{children}</div>
    </section>
  );
}

export default SectionCard;
