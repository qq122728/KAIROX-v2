import { getSettings, type AppSettings } from "./settings";
import { DEFAULT_BINARY_TRADE_SETTINGS, getBinaryTradeSettings, parseBinaryTradeSettings, type BinaryTradeSettings } from "./binary-trade-settings";

export type BinaryOptionPreset = {
  seconds: number;
  label: string;
  odds: number;
  winRate: number;
  lossRate: number;
  drawRefundRate: number;
};

function labelForSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function toPresets(settings: BinaryTradeSettings): BinaryOptionPreset[] {
  return settings.presets.map((preset) => ({
    seconds: preset.seconds,
    label: preset.label || labelForSeconds(preset.seconds),
    odds: preset.winRate,
    winRate: preset.winRate,
    lossRate: preset.lossRate,
    drawRefundRate: preset.drawRefundRate
  }));
}

export function defaultBinaryOptionsConfig() {
  return JSON.stringify(DEFAULT_BINARY_TRADE_SETTINGS.presets.map(({ seconds, winRate: odds }) => ({ seconds, odds })));
}

export function parseBinaryOptionPresets(value?: string | null) {
  return toPresets(parseBinaryTradeSettings(value));
}

export function sanitizeBinaryOptionsConfig(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Binary option config must be an array");
  const presets = parsed.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid binary option preset");
    const row = item as { seconds?: unknown; odds?: unknown; profitRate?: unknown; winRate?: unknown; lossRate?: unknown; drawRefundRate?: unknown };
    const seconds = Number(row.seconds);
    const winRateRaw = Number(row.winRate ?? row.odds ?? row.profitRate);
    const winRate = winRateRaw > 1 ? winRateRaw / 100 : winRateRaw;
    const lossRaw = Number(row.lossRate ?? winRate + 0.01);
    const lossRate = lossRaw > 1 ? lossRaw / 100 : lossRaw;
    const drawRaw = Number(row.drawRefundRate ?? 1);
    const drawRefundRate = drawRaw > 1 ? drawRaw / 100 : drawRaw;
    return { seconds, winRate, lossRate, drawRefundRate };
  });
  const settings = parseBinaryTradeSettings(JSON.stringify({ ...DEFAULT_BINARY_TRADE_SETTINGS, presets }));
  return JSON.stringify(settings.presets.map(({ seconds, winRate: odds }) => ({ seconds, odds })));
}

export function getBinaryOptionPresets(settings: AppSettings = getSettings()) {
  return toPresets(getBinaryTradeSettings());
}

export function getBinaryOptionPreset(durationSeconds: number, settings: AppSettings = getSettings()) {
  return getBinaryOptionPresets(settings).find((item) => item.seconds === durationSeconds) || null;
}

export function binaryOrderRiskAmount(stake: number, odds: number, riskAmount?: number | null, lossRate?: number | null) {
  const storedRisk = Number(riskAmount);
  if (Number.isFinite(storedRisk) && storedRisk > 0) return storedRisk;
  const configuredLoss = Number(lossRate);
  const rate = Number.isFinite(configuredLoss) && configuredLoss >= 0 ? configuredLoss : odds + 0.01;
  return Number((stake * rate).toFixed(8));
}
