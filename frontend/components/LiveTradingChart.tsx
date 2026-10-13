"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface TradingBarDatum {
  value: number;
  variant?: "up" | "down" | "neutral";
  open?: number;
  high?: number;
  low?: number;
}

export interface LiveTradingChartProps {
  data: TradingBarDatum[];
  height?: number;
  className?: string;
}

export function resolveCandles(data: TradingBarDatum[]) {
  return data.map((datum, index) => {
    const close = Number.isFinite(datum.value) ? datum.value : 0;
    const previous = data[index - 1]?.value;
    const open = Number.isFinite(datum.open) ? datum.open! : Number.isFinite(previous) ? previous! : close;
    const high = Math.max(open, close, Number.isFinite(datum.high) ? datum.high! : close);
    const low = Math.min(open, close, Number.isFinite(datum.low) ? datum.low! : close);
    return { open, close, high, low, variant: close > open ? "up" : close < open ? "down" : (datum.variant ?? "neutral") };
  });
}

/**
 * Live-ticking candlestick chart — the flat, professional style real
 * exchanges use. Every ~3s the window shifts forward with a small bounded
 * random-walk tick on the live edge, so the chart keeps moving like a real
 * feed instead of sitting static after its mount animation.
 */
export function LiveTradingChart({ data, height = 320, className = "" }: LiveTradingChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [liveData, setLiveData] = useState<TradingBarDatum[]>(data);
  const reducedMotion = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const measured = element.getBoundingClientRect().width;
      if (measured > 0) setWidth(measured);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const baseline = data[data.length - 1]?.value ?? 0;
    if (!Number.isFinite(baseline) || baseline === 0) return;

    const interval = setInterval(() => {
      setLiveData((prev) => {
        if (prev.length === 0) return prev;
        const lastIndex = prev.length - 1;
        const prevValue = prev[lastIndex]?.value ?? baseline;
        const step = baseline * (0.002 + Math.random() * 0.01);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const maxDrift = baseline * 0.06;
        const next = Math.min(baseline + maxDrift, Math.max(baseline - maxDrift, prevValue + direction * step));
        const variant: TradingBarDatum["variant"] = next > prevValue ? "up" : next < prevValue ? "down" : "neutral";
        // Only the rightmost, still-forming candle updates — every earlier
        // candle is finalized history and must never move or shift position,
        // same as a real exchange chart's live/in-progress bar.
        const updated = prev.slice();
        updated[lastIndex] = { ...updated[lastIndex], value: next, variant };
        return updated;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [data, reducedMotion]);

  const safeHeight = Number.isFinite(height) && height > 0 ? height : 320;
  const top = 22;
  const bottom = Math.max(top + 1, safeHeight - 22);
  const plotHeight = bottom - top;
  const plotWidth = Math.max(1, width - 85);
  const candles = resolveCandles(liveData);
  const minimum = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;
  const maximum = candles.length ? Math.max(...candles.map((c) => c.high)) : 1;
  // Scale-relative only — a hardcoded absolute floor here (e.g. "1") assumes
  // BTC-thousands-scale prices and silently swallows all visible variation
  // for assets priced near 1 (like MON-USDC), squashing every candle into a
  // flat sliver with a huge dead zone above/below.
  const buffer = Math.max((maximum - minimum) * 0.15, Math.abs(maximum) * 0.02, 0.0001);
  const rangeLow = minimum - buffer;
  const rangeHigh = maximum + buffer;
  const y = (price: number) => top + ((rangeHigh - price) / (rangeHigh - rangeLow)) * plotHeight;
  const cell = plotWidth / Math.max(1, candles.length);
  const bodyWidth = Math.min(16, cell * 0.6);
  const last = candles.at(-1);
  const lastX = (candles.length - 0.5) * cell;
  const lastY = y(last?.close ?? 0);
  const color = last?.variant === "down" ? "var(--danger)" : "var(--success)";
  const format = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div ref={ref} className={`relative w-full overflow-hidden chart-surface ${className}`}>
      <svg
        width="100%"
        height={safeHeight}
        viewBox={`0 0 ${width} ${safeHeight}`}
        className="block"
        role="img"
        aria-label={`Candlestick chart, ${candles.length} candles${last ? `, latest price ${last.close}` : ""}`}
      >
        <defs>
          <filter id={`glow-${id}`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
          <linearGradient id={`scan-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--success)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1="0"
              x2={plotWidth}
              y1={top + fraction * plotHeight}
              y2={top + fraction * plotHeight}
              className="chart-grid"
              strokeDasharray="3 5"
            />
            <text x={plotWidth + 10} y={top + fraction * plotHeight + 3} className="candle-axis">
              {format(rangeHigh - fraction * (rangeHigh - rangeLow))}
            </text>
          </g>
        ))}
        {[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((fraction) => (
          <line
            key={fraction}
            x1={plotWidth * fraction}
            x2={plotWidth * fraction}
            y1="0"
            y2={safeHeight}
            className="chart-grid"
            strokeDasharray="3 5"
          />
        ))}

        {candles.map((candle, index) => {
          const center = (index + 0.5) * cell;
          const bodyTop = Math.min(y(candle.open), y(candle.close));
          const bodyHeight = Math.max(1.5, Math.abs(y(candle.open) - y(candle.close)));
          const transition = {
            duration: reducedMotion ? 0.15 : 0.45,
            delay: reducedMotion ? 0 : index * Math.min(0.08, 1 / Math.max(1, candles.length)),
            ease: "easeOut" as const,
          };
          return (
            <g key={index} className={`candle-${candle.variant}`}>
              <motion.line
                data-candle-wick="true"
                x1={center}
                x2={center}
                initial={{ y1: y(candle.open), y2: y(candle.open) }}
                animate={{ y1: y(candle.high), y2: y(candle.low) }}
                strokeWidth="1.2"
                transition={transition}
              />
              <motion.rect
                data-candle-body="true"
                x={center - bodyWidth / 2}
                width={bodyWidth}
                rx="0.6"
                initial={{ y: y(candle.open), height: 0 }}
                animate={{ y: bodyTop, height: bodyHeight }}
                transition={transition}
              />
            </g>
          );
        })}

        {!reducedMotion && last && (
          <motion.line
            y1="0"
            y2={safeHeight}
            stroke={`url(#scan-${id})`}
            strokeWidth="2"
            initial={{ x1: 0, x2: 0, opacity: 0 }}
            animate={{ x1: [0, plotWidth], x2: [0, plotWidth], opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 4.6,
              repeat: Infinity,
              ease: "linear",
              opacity: { duration: 4.6, repeat: Infinity, times: [0, 0.12, 0.88, 1] },
            }}
          />
        )}

        {last && (
          <g>
            <line x1="0" x2={plotWidth} y1={lastY} y2={lastY} stroke={color} strokeOpacity="0.5" strokeDasharray="3 4" />
            <rect x={plotWidth} y={lastY - 11} width="84" height="22" rx="2" fill={color} />
            <text x={plotWidth + 7} y={lastY + 3.5} className="candle-price">
              {format(last.close)}
            </text>
            <motion.circle
              cx={lastX}
              cy={lastY}
              fill={color}
              filter={`url(#glow-${id})`}
              animate={reducedMotion ? { r: 3, opacity: 0.3 } : { r: [3, 9, 3], opacity: [0.5, 0, 0] }}
              transition={{ duration: 1.8, repeat: reducedMotion ? 0 : Infinity }}
            />
            <circle cx={lastX} cy={lastY} r="2" fill={color} />
          </g>
        )}
      </svg>
    </div>
  );
}
