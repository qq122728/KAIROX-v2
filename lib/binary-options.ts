import { getSettings, type AppSettings } from "@/lib/settings";

export type BinaryOptionPreset = {
  seconds: number;
  label: string;
  odds: number;
  lossRate: number;
};

const defaultPresets: BinaryOptionPreset[] = [
  { seconds: 30, label: "30s", odds: 0.3, lossRate: 0.31 },
  { seconds: 60, label: "60s", odds: 0.35, lossRate: 0.36 },
  { seconds: 180, label: "180s", odds: 0.45, lossRate: 0.46 },
  { seconds: 300, label: "300s", odds: 0.55, lossRate: 0.56 }
];

function labelForSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function normalizePreset(item: unknown): BinaryOptionPreset | null {
  if (!item || typeof item !== "object") return null;
  const row = item as { seconds?: unknown; odds?: unknown; profitRate?: unknown; label?: unknown };
  const seconds = Number(row.seconds);
  const rawOdds = row.odds ?? row.profitRate;
  const oddsValue = Number(rawOdds);
  const odds = oddsValue > 1 ? oddsValue / 100 : oddsValue;
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 86400) return null;
  if (!Number.isFinite(odds) || odds <= 0 || odds > 10) return null;
  const roundedOdds = Number(odds.toFixed(6));
  return {
    seconds,
    label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : labelForSeconds(seconds),
    odds: roundedOdds,
    lossRate: Number((roundedOdds + 0.01).toFixed(6))
  };
}

export function defaultBinaryOptionsConfig() {
  return JSON.stringify(defaultPresets.map(({ seconds, odds }) => ({ seconds, odds })));
}

export function parseBinaryOptionPresets(value?: string | null) {
  if (!value) return defaultPresets;
  try {
    const raw = JSON.parse(value) as unknown;
    if (!Array.isArray(raw)) return defaultPresets;
    const rows = raw.map(normalizePreset).filter((item): item is BinaryOptionPreset => Boolean(item));
    const unique = new Map<number, BinaryOptionPreset>();
    for (const row of rows) unique.set(row.seconds, row);
    const presets = Array.from(unique.values()).sort((a, b) => a.seconds - b.seconds);
    return presets.length ? presets : defaultPresets;
  } catch {
    return defaultPresets;
  }
}

export function sanitizeBinaryOptionsConfig(value: string) {
  const raw = JSON.parse(value) as unknown;
  if (!Array.isArray(raw)) throw new Error("Binary option config must be an array");
  const rows = raw.map(normalizePreset).filter((item): item is BinaryOptionPreset => Boolean(item));
  const unique = new Map<number, BinaryOptionPreset>();
  for (const row of rows) unique.set(row.seconds, row);
  const presets = Array.from(unique.values()).sort((a, b) => a.seconds - b.seconds);
  if (!presets.length) throw new Error("At least one valid binary option preset is required");
  return JSON.stringify(presets.map(({ seconds, odds }) => ({ seconds, odds })));
}

export function getBinaryOptionPresets(settings: AppSettings = getSettings()) {
  return parseBinaryOptionPresets(settings.binary_options_config);
}

export function getBinaryOptionPreset(durationSeconds: number, settings: AppSettings = getSettings()) {
  return getBinaryOptionPresets(settings).find((item) => item.seconds === durationSeconds) || null;
}

export function binaryOrderRiskAmount(stake: number, odds: number, riskAmount?: number | null) {
  const storedRisk = Number(riskAmount);
  if (Number.isFinite(storedRisk) && storedRisk > 0) return storedRisk;
  return Number((stake * (odds + 0.01)).toFixed(8));
}
