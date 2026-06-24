"use client";

import { useEffect, useMemo, useState } from "react";
import { CandleChart } from "./CandleChart";

type Candle = { time: number; open: number; high: number; low: number; close: number };
type ChartStatus = "loading" | "ready" | "empty" | "error";

const INTERVALS: { id: string; label: string }[] = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
  { id: "4h", label: "4h" },
  { id: "1d", label: "1d" }
];

function emptyChartLabel(source: string, status: ChartStatus) {
  if (status === "loading") return "";
  if (status === "error") return "Market feed unavailable";
  if (source === "local-fallback") return "Local fallback data unavailable";
  return "No chart data available";
}

function trailingMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1) return value.toFixed(4);
  return value.toFixed(5);
}

export function MarketChartPanel({ symbol }: { symbol: string }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<ChartStatus>("loading");
  const [interval, setIntervalValue] = useState("1m");
  const emptyLabel = emptyChartLabel(source, status);

  useEffect(() => {
    let active = true;
    setCandles([]);
    setSource("");
    setStatus("loading");
    async function load() {
      try {
        const res = await fetch(`/api/market-data/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`, {
          cache: "no-store"
        });
        if (!res.ok) throw new Error("Failed to load chart data");
        const data = await res.json();
        if (!active) return;
        const nextCandles = data.candles || [];
        setCandles(nextCandles);
        setSource(data.source || "");
        setStatus(nextCandles.length ? "ready" : "empty");
      } catch {
        if (!active) return;
        setCandles([]);
        setSource("");
        setStatus("error");
      }
    }
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [symbol, interval]);

  const { ma20, ma72 } = useMemo(() => {
    const closes = candles.map((c) => c.close);
    return { ma20: trailingMA(closes, 20), ma72: trailingMA(closes, 72) };
  }, [candles]);

  return (
    <div className="trade-chart-wrap">
      <div className="chart-intervals-row">
        {INTERVALS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chart-interval-tab${interval === item.id ? " on" : ""}`}
            onClick={() => setIntervalValue(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="chart-canvas-host">
        <div className="chart-ma-strip">
          <span className="chart-ma chart-ma-20">MA(20): <b className="tabular-nums">{ma20 != null ? formatPrice(ma20) : "—"}</b></span>
          <span className="chart-ma chart-ma-72">MA(72): <b className="tabular-nums">{ma72 != null ? formatPrice(ma72) : "—"}</b></span>
        </div>
        {candles.length ? <CandleChart candles={candles} /> : <div className="empty-chart">{emptyLabel}</div>}
      </div>
    </div>
  );
}
