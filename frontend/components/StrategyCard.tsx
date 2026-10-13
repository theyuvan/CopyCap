"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { StatusBadge } from "@/components/StatusBadge";
import { Sparkline } from "@/components/Sparkline";
import { Identicon } from "@/components/Identicon";
import { staggerItem } from "@/components/Reveal";
import { shortAddress, generateHandle } from "@/lib/identity";
import type { StrategyDetail } from "@/lib/api";

export function StrategyCard({
  strategy: s,
  followerCount = 0,
}: {
  strategy: StrategyDetail;
  followerCount?: number;
}) {
  const closed = s.positions.filter((p) => p.state === "CLOSED");
  const wins = closed.filter((p) => (p.realizedPnlQuote ?? 0) > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null;
  const realizedPnl = closed.reduce((sum, p) => sum + (p.realizedPnlQuote ?? 0), 0);
  const closedCapital = closed.reduce((sum, p) => sum + p.quoteSpent, 0);
  const roi = closedCapital > 0 ? (realizedPnl / closedCapital) * 100 : null;
  const hasTrackRecord = closed.length > 0;

  const upside =
    s.targetMin && s.breakoutLevel ? ((s.targetMin - s.breakoutLevel) / s.breakoutLevel) * 100 : null;
  const downside = s.stopLevel && s.breakoutLevel ? ((s.breakoutLevel - s.stopLevel) / s.breakoutLevel) * 100 : null;

  const daysTrading = Math.max(0, Math.floor((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
  const aum = s.positions.filter((p) => p.state !== "CLOSED").reduce((sum, p) => sum + p.quoteSpent, 0);

  let sparkPoints: number[];
  let sparkColor: "success" | "danger" | "accent";
  if (hasTrackRecord) {
    let running = 0;
    sparkPoints = closed.map((p) => (running += p.realizedPnlQuote ?? 0));
    sparkColor = realizedPnl >= 0 ? "success" : "danger";
  } else {
    sparkPoints = [s.entryMin, s.breakoutLevel, s.currentPrice ?? s.breakoutLevel, s.targetMin ?? s.currentPrice ?? s.breakoutLevel];
    sparkColor = upside !== null && upside >= 0 ? "success" : "accent";
  }

  const href = `/strategies/${s.id}`;

  return (
    <motion.div
      variants={staggerItem}
      className="group h-full rounded-lg border border-border bg-panel p-5 transition-all hover:-translate-y-1 hover:border-border-strong"
    >
      <Link href={href} className="block">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Identicon address={s.creator} size={40} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold leading-tight">{generateHandle(s.creator)}</span>
                {hasTrackRecord && realizedPnl > 0 && (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-success"
                    aria-label="Positive track record"
                  >
                    <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
                    <path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-dim">
                <span className="font-mono-nums">{shortAddress(s.creator)}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                  </svg>
                  <span className="font-mono-nums">
                    {followerCount}
                    {s.maxFollowers ? ` / ${s.maxFollowers}` : ""}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <StatusBadge status={s.lifecycleState} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-muted-dim">Momentum Breakout</span>
          <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-muted-dim">{s.market.symbol}</span>
          <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-muted-dim">
            {s.market.network.replace("monad-", "")}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-4">
          <div>
            <div className="text-xs text-muted-dim">{hasTrackRecord ? "Realized PnL" : "Target upside"}</div>
            {hasTrackRecord ? (
              <>
                <div className={`font-mono-nums text-2xl font-bold leading-tight ${realizedPnl >= 0 ? "text-success" : "text-danger"}`}>
                  {realizedPnl >= 0 ? "+" : ""}
                  {realizedPnl.toFixed(2)}
                </div>
                {roi !== null && (
                  <div className={`font-mono-nums text-xs ${roi >= 0 ? "text-success" : "text-danger"}`}>
                    ROI {roi >= 0 ? "+" : ""}
                    {roi.toFixed(1)}%
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={`font-mono-nums text-2xl font-bold leading-tight ${upside !== null ? "text-success" : "text-muted-dim"}`}>
                  {upside !== null ? `+${upside.toFixed(1)}%` : "—"}
                </div>
                {downside !== null && <div className="font-mono-nums text-xs text-danger">-{downside.toFixed(1)}% stop</div>}
              </>
            )}
          </div>
          <Sparkline points={sparkPoints} color={sparkColor} />
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-dim">AUM</span>
            <span className="font-mono-nums">{aum.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-dim">Stop risk</span>
            <span className="font-mono-nums text-danger">{downside !== null ? `-${downside.toFixed(1)}%` : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-dim">Win rate</span>
            <span className="font-mono-nums">{winRate !== null ? `${winRate.toFixed(0)}% (${wins}/${closed.length})` : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-dim">Days leading trading</span>
            <span className="font-mono-nums">{daysTrading}</span>
          </div>
        </div>

        {s.description && <p className="mt-4 line-clamp-2 text-xs text-muted-dim">{s.description}</p>}
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={href}
          className="rounded-sm border border-border-strong bg-white/5 py-2 text-center text-xs font-semibold text-muted transition-colors hover:bg-white/10"
        >
          Mock
        </Link>
        <Link
          href={`${href}#overview`}
          className="rounded-sm border border-accent/30 bg-accent/5 py-2 text-center text-xs font-semibold text-accent transition-colors group-hover:bg-accent/10"
        >
          Copy
        </Link>
      </div>
    </motion.div>
  );
}
