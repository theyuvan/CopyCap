"use client";

import { useMemo, useState } from "react";
import { Sparkline } from "@/components/Sparkline";

export interface ClosedPositionPoint {
  exitExecutedAt: string;
  realizedPnlQuote: number;
  quoteSpent: number;
}

/** Toggleable ROI% / PnL cumulative-history chart, built from real closed positions — mirrors the ROI/PnL toggle on a Binance lead-trader page, but every point here is an actual recorded close. */
export function PerformanceChart({ positions }: { positions: ClosedPositionPoint[] }) {
  const [mode, setMode] = useState<"roi" | "pnl">("roi");

  const { roiSeries, pnlSeries, labels, fullDateLabels } = useMemo(() => {
    let cumPnl = 0;
    let cumCapital = 0;
    const roi: number[] = [];
    const pnl: number[] = [];
    for (const p of positions) {
      cumPnl += p.realizedPnlQuote;
      cumCapital += p.quoteSpent;
      roi.push(cumCapital > 0 ? (cumPnl / cumCapital) * 100 : 0);
      pnl.push(cumPnl);
    }
    const dateLabels = positions.map((p) => {
      const d = new Date(p.exitExecutedAt);
      return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    });
    const fullDateLabels = positions.map((p) => new Date(p.exitExecutedAt).toISOString().slice(0, 19).replace("T", " "));
    const step = Math.max(1, Math.floor(dateLabels.length / 5));
    const sparse = dateLabels.filter((_, i) => i % step === 0 || i === dateLabels.length - 1);
    return { roiSeries: roi, pnlSeries: pnl, labels: sparse, fullDateLabels };
  }, [positions]);

  if (positions.length < 2) {
    return (
      <p className="text-sm text-muted-dim">
        Not enough closed positions yet for a performance history ({positions.length} closed so far).
      </p>
    );
  }

  const series = mode === "roi" ? roiSeries : pnlSeries;
  const latest = series[series.length - 1];

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-sm border border-border-strong bg-bg p-0.5 text-xs">
        <button
          onClick={() => setMode("roi")}
          className={`rounded-sm px-3 py-1.5 font-medium transition-colors ${mode === "roi" ? "bg-panel text-ink" : "text-muted-dim hover:text-muted"}`}
        >
          ROI
        </button>
        <button
          onClick={() => setMode("pnl")}
          className={`rounded-sm px-3 py-1.5 font-medium transition-colors ${mode === "pnl" ? "bg-panel text-ink" : "text-muted-dim hover:text-muted"}`}
        >
          PnL
        </button>
      </div>
      <div className={`mb-2 font-mono-nums text-lg font-semibold ${latest >= 0 ? "text-success" : "text-danger"}`}>
        {latest >= 0 ? "+" : ""}
        {latest.toFixed(mode === "roi" ? 1 : 2)}
        {mode === "roi" ? "%" : ""}
      </div>
      <Sparkline
        points={series}
        labels={labels}
        pointLabels={fullDateLabels}
        formatValue={(v) => `${mode === "roi" ? "ROI: " : "PnL: "}${v >= 0 ? "+" : ""}${v.toFixed(2)}${mode === "roi" ? "%" : ""}`}
        width={560}
        height={180}
        showZeroLine
        smooth
        biColor
        color={latest >= 0 ? "success" : "danger"}
      />
    </div>
  );
}
