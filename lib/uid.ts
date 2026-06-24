export type PublicUidSource = {
  public_uid?: string | null;
  user_public_uid?: string | null;
  id?: number | string | null;
  user_id?: number | string | null;
};

export function formatUid(value: number | string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "000000";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return raw;
  return String(Math.trunc(numeric)).padStart(6, "0");
}

export function displayUid(source: PublicUidSource | number | string | null | undefined) {
  if (source && typeof source === "object") {
    if (source.public_uid) return formatUid(source.public_uid);
    if (source.user_public_uid) return formatUid(source.user_public_uid);
    if (source.id != null) return formatUid(source.id);
    if (source.user_id != null) return formatUid(source.user_id);
    return "000000";
  }
  return formatUid(source);
}
