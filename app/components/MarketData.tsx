"use client";

import { useEffect, useState } from "react";
import { CandleChart } from "./CandleChart";

type Candle = { time: number; open: number; high: number; low: number; close: number };
type ChartStatus = "loading" | "ready" | "empty" | "error";

function chartSourceLabel(source: string, status: ChartStatus) {
  if (status === "loading") return "";
  if (status === "error") return "Market feed unavailable";
  if (source === "okx") return "OKX market feed";
  if (source === "binance") return "Live market feed";
  if (source === "local-fallback") return "Local fallback data";
  return "Market feed";
}

function emptyChartLabel(source: string, status: ChartStatus) {
  if (status === "loading") return "";
  if (status === "error") return "Market feed unavailable";
  if (source === "local-fallback") return "Local fallback data unavailable";
  return "No chart data available";
}

export function MarketChartPanel({ symbol }: { symbol: string }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<ChartStatus>("loading");
  const [interval, setIntervalValue] = useState("1m");
  const emptyLabel = emptyChartLabel(source, status);
  const sourceLabel = chartSourceLabel(source, status);

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

  return (
    <div className="fx-panel trade-chart-card">
      <div className="fx-panel-pad trade-chart-pad">
        <div className="fx-choice-grid three chart-intervals">
          {["1m", "5m", "15m", "1h", "4h", "1d"].map((item) => (
            <button key={item} className={`fx-choice ${interval === item ? "on" : ""}`} onClick={() => setIntervalValue(item)}>{item}</button>
          ))}
        </div>
        {candles.length ? <CandleChart candles={candles} /> : <div className="empty-chart">{emptyLabel}</div>}
        <div className="indicator-strip">
          <span>MA</span>
          <span>EMA</span>
          <span>BOLL</span>
          <span>SAR</span>
          <span>AVL</span>
          <span>MACD</span>
          <span>RSI</span>
        </div>
        {sourceLabel && <div className="chart-source">{sourceLabel}</div>}
      </div>
    </div>
  );
}
