import { Loader2 } from "lucide-react";

type LoadingStateProps = {
  label?: string;
  className?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function LoadingState({ label = "加载中", className }: LoadingStateProps) {
  return (
    <div className={cx("admin-loading-state", className)} role="status">
      <Loader2 aria-hidden="true" className="admin-loading-spinner" size={18} strokeWidth={2.2} />
      <span>{label}</span>
    </div>
  );
}

export default LoadingState;
