import { getDb, inTransaction } from "./db";

export type BinaryTradePreset = {
  seconds: number;
  winRate: number;
  lossRate: number;
  drawRefundRate: number;
  label?: string;
};

export type BinaryTradeSettings = {
  minOrderAmount: number;
  maxOrderAmount: number;
  dailyMaxAmount: number;
  presets: BinaryTradePreset[];
  version: number;
};

export const DEFAULT_BINARY_TRADE_SETTINGS: BinaryTradeSettings = {
  minOrderAmount: 10,
  maxOrderAmount: 5000,
  dailyMaxAmount: 0,
  version: 1,
  presets: [
    { seconds: 60, winRate: 0.05, lossRate: 0.06, drawRefundRate: 1 },
    { seconds: 120, winRate: 0.15, lossRate: 0.16, drawRefundRate: 1 },
    { seconds: 180, winRate: 0.2, lossRate: 0.21, drawRefundRate: 1 },
    { seconds: 300, winRate: 0.3, lossRate: 0.31, drawRefundRate: 1 }
  ]
};

const round = (value: number) => Number(value.toFixed(8));

function normalizeRate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return number > 1 ? number / 100 : number;
}

export function validateBinaryTradeSettings(value: unknown): BinaryTradeSettings {
  if (!value || typeof value !== "object") throw new Error("Invalid binary trade settings");
  const input = value as Partial<BinaryTradeSettings> & { presets?: unknown };
  const minOrderAmount = Number(input.minOrderAmount);
  const maxOrderAmount = Number(input.maxOrderAmount);
  const dailyMaxAmount = Number(input.dailyMaxAmount ?? 0);
  const version = Number(input.version ?? 1);
  if (!Number.isFinite(minOrderAmount) || minOrderAmount <= 0) throw new Error("Minimum order amount must be greater than 0");
  if (!Number.isFinite(maxOrderAmount) || maxOrderAmount < minOrderAmount) throw new Error("Maximum order amount must be greater than or equal to minimum");
  if (!Number.isFinite(dailyMaxAmount) || dailyMaxAmount < 0) throw new Error("Daily maximum amount must be 0 or greater");
  if (!Number.isInteger(version) || version < 1) throw new Error("Invalid binary trade config version");
  if (!Array.isArray(input.presets) || input.presets.length === 0) throw new Error("At least one duration preset is required");
  const seen = new Set<number>();
  const presets = input.presets.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid duration preset");
    const row = item as Partial<BinaryTradePreset> & { odds?: unknown; profitRate?: unknown };
    const seconds = Number(row.seconds);
    const winRate = normalizeRate(row.winRate ?? row.odds ?? row.profitRate);
    const lossRate = normalizeRate(row.lossRate);
    const drawRefundRate = normalizeRate(row.drawRefundRate ?? 1);
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 86400) throw new Error("Invalid duration preset seconds");
    if (seen.has(seconds)) throw new Error("Duration presets must be unique");
    seen.add(seconds);
    if (![winRate, lossRate, drawRefundRate].every((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 1)) throw new Error("Rates must be between 0 and 1");
    return { seconds, winRate: round(winRate), lossRate: round(lossRate), drawRefundRate: round(drawRefundRate), ...(typeof row.label === "string" && row.label.trim() ? { label: row.label.trim() } : {}) };
  }).sort((a, b) => a.seconds - b.seconds);
  return { minOrderAmount: round(minOrderAmount), maxOrderAmount: round(maxOrderAmount), dailyMaxAmount: round(dailyMaxAmount), presets, version };
}

export function serializeBinaryTradeSettings(settings: BinaryTradeSettings) {
  return JSON.stringify(validateBinaryTradeSettings(settings));
}

function legacySettings(value: unknown): BinaryTradeSettings | null {
  if (!Array.isArray(value)) return null;
  const presets = value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = item as { seconds?: unknown; odds?: unknown; profitRate?: unknown; lossRate?: unknown; drawRefundRate?: unknown };
    const winRate = normalizeRate(row.odds ?? row.profitRate);
    const lossRate = normalizeRate(row.lossRate ?? (Number.isFinite(winRate) ? winRate + 0.01 : NaN));
    return { seconds: Number(row.seconds), winRate, lossRate, drawRefundRate: normalizeRate(row.drawRefundRate ?? 1) };
  }).filter(Boolean);
  try {
    return validateBinaryTradeSettings({ ...DEFAULT_BINARY_TRADE_SETTINGS, presets });
  } catch {
    return null;
  }
}

export function parseBinaryTradeSettings(value?: string | null): BinaryTradeSettings {
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown;
      try { return validateBinaryTradeSettings(parsed); } catch { /* legacy shape below */ }
      const legacy = legacySettings(parsed);
      if (legacy) return legacy;
    } catch { /* use defaults */ }
  }
  return DEFAULT_BINARY_TRADE_SETTINGS;
}

export function getBinaryTradeSettings() {
  const rows = getDb().prepare("SELECT key, value FROM settings WHERE key IN ('binary_trade_config','binary_options_config')").all() as { key: string; value: string }[];
  const direct = rows.find((row) => row.key === "binary_trade_config")?.value;
  if (direct) return parseBinaryTradeSettings(direct);
  const legacy = rows.find((row) => row.key === "binary_options_config")?.value;
  return parseBinaryTradeSettings(legacy);
}

export function getBinaryPreset(seconds: number, settings = getBinaryTradeSettings()) {
  return settings.presets.find((preset) => preset.seconds === Number(seconds)) || null;
}

export function updateBinaryTradeSettings(value: unknown, updatedBy: number) {
  const next = validateBinaryTradeSettings(value);
  const serialized = serializeBinaryTradeSettings(next);
  inTransaction(() => {
    const database = getDb();
    const previous = database.prepare("SELECT value FROM settings WHERE key = ?").get("binary_trade_config") as { value?: string } | undefined;
    database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("binary_trade_config", serialized);
    database.prepare("INSERT INTO settings_audit (key, old_value, new_value, updated_by) VALUES (?, ?, ?, ?)").run("binary_trade_config", previous?.value || null, serialized, updatedBy);
  });
  return next;
}

