"use client";

import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type CandlestickData,
  type LineData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";
import { useEffect, useRef } from "react";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function movingAverage(candles: Candle[], period: number): LineData[] {
  if (candles.length < period) return [];
  const out: LineData[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      out.push({ time: candles[i].time as UTCTimestamp, value: sum / period });
    }
  }
  return out;
}

export function CandleChart({ candles }: { candles: Candle[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma72Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const didFitContentRef = useRef(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = createChart(hostRef.current, {
      autoSize: true,
      height: 320,
      layout: { background: { color: "#0F151D" }, textColor: "#9BA3AF", fontFamily: "Inter, 'DM Sans', Arial, sans-serif" },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.045)" },
        horzLines: { color: "rgba(255, 255, 255, 0.045)" }
      },
      crosshair: {
        vertLine: { color: "rgba(255, 255, 255, 0.30)", width: 1, style: 3, labelBackgroundColor: "#1B2330" },
        horzLine: { color: "rgba(255, 255, 255, 0.30)", width: 1, style: 3, labelBackgroundColor: "#1B2330" }
      },
      localization: {
        locale: "en-US",
        timeFormatter: (time: UTCTimestamp) => new Date(Number(time) * 1000).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      },
      rightPriceScale: { borderColor: "rgba(255, 255, 255, 0.06)", textColor: "#9BA3AF" },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.06)",
        timeVisible: true,
        tickMarkFormatter: (time: UTCTimestamp) => new Date(Number(time) * 1000).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      }
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16C784",
      downColor: "#F6465D",
      borderVisible: false,
      wickUpColor: "#16C784",
      wickDownColor: "#F6465D"
    });
    const ma20 = chart.addSeries(LineSeries, {
      color: "#F0B90B",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const ma72 = chart.addSeries(LineSeries, {
      color: "#E843C4",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    chartRef.current = chart;
    seriesRef.current = series;
    ma20Ref.current = ma20;
    ma72Ref.current = ma72;
    return () => {
      seriesRef.current = null;
      ma20Ref.current = null;
      ma72Ref.current = null;
      chartRef.current = null;
      didFitContentRef.current = false;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const ma20 = ma20Ref.current;
    const ma72 = ma72Ref.current;
    if (!series || !chart || !ma20 || !ma72) return;
    const orderedCandles = Array.from(new Map([...candles].sort((a, b) => a.time - b.time).map((c) => [c.time, c])).values());
    const nextData: CandlestickData[] = orderedCandles.map((c) => ({ ...c, time: c.time as UTCTimestamp }));
    series.setData(nextData);
    ma20.setData(movingAverage(orderedCandles, 20));
    ma72.setData(movingAverage(orderedCandles, 72));
    if (!didFitContentRef.current && nextData.length) {
      chart.timeScale().fitContent();
      didFitContentRef.current = true;
    }
  }, [candles]);

  return <div ref={hostRef} className="candle-chart" />;
}
