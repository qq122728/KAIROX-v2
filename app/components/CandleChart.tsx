"use client";

import { createChart, CandlestickSeries, type CandlestickData, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export function CandleChart({ candles }: { candles: Candle[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const didFitContentRef = useRef(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = createChart(hostRef.current, {
      autoSize: true,
      height: 300,
      layout: { background: { color: "#20262f" }, textColor: "#8f96a3" },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.06)" },
        horzLines: { color: "rgba(255, 255, 255, 0.06)" }
      },
      localization: {
        locale: "en-US",
        timeFormatter: (time: UTCTimestamp) => new Date(Number(time) * 1000).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      },
      rightPriceScale: { borderColor: "rgba(255, 255, 255, 0.08)" },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        timeVisible: true,
        tickMarkFormatter: (time: UTCTimestamp) => new Date(Number(time) * 1000).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      }
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#27d49a",
      downColor: "#ff486b",
      borderVisible: false,
      wickUpColor: "#27d49a",
      wickDownColor: "#ff486b"
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      seriesRef.current = null;
      chartRef.current = null;
      didFitContentRef.current = false;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const orderedCandles = Array.from(new Map([...candles].sort((a, b) => a.time - b.time).map((c) => [c.time, c])).values());
    const nextData: CandlestickData[] = orderedCandles.map((c) => ({ ...c, time: c.time as UTCTimestamp }));
    series.setData(nextData);
    if (!didFitContentRef.current && nextData.length) {
      chart.timeScale().fitContent();
      didFitContentRef.current = true;
    }
  }, [candles]);

  return <div ref={hostRef} className="candle-chart" />;
}
