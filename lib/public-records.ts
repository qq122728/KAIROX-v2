export type PublicRecordRow = {
  status?: unknown;
  type?: unknown;
  note?: unknown;
  admin_note?: unknown;
  processed_by?: unknown;
  [key: string]: unknown;
};

const internalNotePattern = /(admin|administrator|pending admin review|admin created|admin adjust|manual preset|admin preset|\u540e\u53f0|\u7ba1\u7406\u5458)/i;
const generatedNotePattern = /^(deposit|withdrawal) (request|approved|rejected|completed|returned) #\d+/i;

export function publicRecordNote(note: unknown, status?: unknown) {
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return null;
  if (internalNotePattern.test(text) || generatedNotePattern.test(text)) {
    return String(status || "").toLowerCase() === "pending" ? "Pending system review" : "System processed";
  }
  return text;
}

export function sanitizePublicRecord<T extends PublicRecordRow>(row: T): T {
  const next: PublicRecordRow = { ...row };
  if ("note" in next) next.note = publicRecordNote(next.note, next.status);
  if ("admin_note" in next) next.admin_note = publicRecordNote(next.admin_note, next.status);
  if (String(next.type || "").toLowerCase() === "admin_adjust") next.type = "system_adjustment";
  if ("processed_by" in next) delete next.processed_by;
  return next as T;
}

export function sanitizePublicRecords<T extends PublicRecordRow>(rows: T[]) {
  return rows.map((row) => sanitizePublicRecord(row));
}
