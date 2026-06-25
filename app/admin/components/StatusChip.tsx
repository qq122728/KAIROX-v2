export type StatusChipTone = "success" | "warning" | "danger" | "info" | "muted";

type StatusChipProps = {
  label: string;
  tone?: StatusChipTone;
  className?: string;
};

const statusToneMap: Record<StatusChipTone, string[]> = {
  success: ["已通过", "正常", "开启", "已盈利", "盈利", "已保存", "在线"],
  warning: ["待审核", "待结算", "维护", "未保存", "待处理", "大额订单"],
  danger: ["已拒绝", "冻结", "风险", "已亏损", "亏损", "异常", "强平"],
  info: ["运行中", "处理中", "实时", "同步中", "连接中"],
  muted: ["关闭", "未提交", "已取消", "离线", "停用", "已平仓"],
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function getStatusTone(label: string): StatusChipTone {
  const normalized = label.trim();
  const match = Object.entries(statusToneMap).find(([, values]) =>
    values.some((value) => normalized.includes(value)),
  );

  return (match?.[0] as StatusChipTone | undefined) ?? "muted";
}

export function StatusChip({ label, tone, className }: StatusChipProps) {
  const resolvedTone = tone ?? getStatusTone(label);

  return <span className={cx("admin-status-chip", `is-${resolvedTone}`, className)}>{label}</span>;
}

export default StatusChip;
