import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  ChevronRight,
  CircleDashed,
  Copy,
  Crosshair,
  LockKeyhole,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { api, type StrategyDetail } from "@/lib/api";
import { TradingConceptAnimation } from "@/components/TradingConceptAnimation";
import { Reveal } from "@/components/Reveal";
import { Sparkline } from "@/components/Sparkline";
import { CountUpValue } from "@/components/CountUpValue";
import { generateHandle, shortAddress } from "@/lib/identity";

// Full-bleed band that breaks out of the layout's max-width container.
const BAND = "relative left-1/2 w-screen -translate-x-1/2";

const STATE_PILL: Record<string, { label: string; cls: string }> = {
  ENTRY_ACTIVE: { label: "Entry active", cls: "pill-lime" },
  POSITION_ACTIVE: { label: "In position", cls: "pill-violet" },
  EXIT_ACTIVE: { label: "Exit active", cls: "pill-violet" },
  WAITING_FOR_ENTRY: { label: "Waiting", cls: "pill-orange" },
  CLOSED: { label: "Closed", cls: "pill-muted" },
  EXPIRED: { label: "Expired", cls: "pill-muted" },
};

function strategyReturn(s: StrategyDetail): { value: string; label: string; positive: boolean } {
  const closed = s.positions.filter((p) => p.state === "CLOSED");
  const capital = closed.reduce((sum, p) => sum + p.quoteSpent, 0);
  if (capital > 0) {
    const pnl = closed.reduce((sum, p) => sum + (p.realizedPnlQuote ?? 0), 0);
    const roi = (pnl / capital) * 100;
    return { value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, label: "realized ROI", positive: roi >= 0 };
  }
  if (s.targetMin && s.breakoutLevel) {
    const upside = ((s.targetMin - s.breakoutLevel) / s.breakoutLevel) * 100;
    return { value: `+${upside.toFixed(1)}%`, label: "target upside", positive: true };
  }
  return { value: "—", label: "no track record", positive: true };
}

function sparkPoints(s: StrategyDetail): number[] {
  const closed = s.positions.filter((p) => p.state === "CLOSED");
  if (closed.length >= 2) {
    let running = 0;
    return closed.map((p) => (running += p.realizedPnlQuote ?? 0));
  }
  return [s.entryMin, s.breakoutLevel, s.currentPrice ?? s.breakoutLevel, s.targetMin ?? s.currentPrice ?? s.breakoutLevel];
}

export default async function LandingPage() {
  const [overview, smartMoney] = await Promise.all([
    api.getOverview().catch(() => null),
    api.smartMoney().catch(() => null),
  ]);
  const strategies = overview?.details ?? [];
  const livePrice = strategies.find((s) => s.currentPrice !== null)?.currentPrice ?? null;
  const smartTrades = ((smartMoney?.opportunities ?? []) as any[]).slice(0, 4);

  return (
    <div className="-mt-10">
      {/* ---------------- HERO ---------------- */}
      <section className="relative pb-20 pt-12 lg:pb-28 lg:pt-20">
        <div
          className="pointer-events-none absolute -left-[20%] -top-[10%] h-[600px] w-[600px] rounded-full blur-[120px]"
          style={{ background: "rgba(212, 255, 114, 0.05)" }}
        />
        <div className="grid items-center gap-14 lg:grid-cols-[.88fr_1.12fr] lg:gap-12">
          <div className="relative z-10">
            <Reveal y={12}>
              <p className="eyebrow mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Capacity-aware copy trading
              </p>
            </Reveal>
            <Reveal delay={0.08} y={18}>
              <h1 className="max-w-[650px] font-accent text-[clamp(3.5rem,7vw,6.8rem)] leading-[.88] tracking-[-.04em]">
                Copy it
                <br />
                <em className="text-accent">while it&apos;s</em>
                <br />
                still real.
              </h1>
            </Reveal>
            <Reveal delay={0.16} y={14}>
              <p className="mt-8 max-w-[440px] text-base leading-7 text-muted">
                The copy-trading platform that checks live Kuru order-book depth before you enter. No stale signals.
                No silent slippage — every copy is sized to what the market can still reproduce for{" "}
                <span className="text-ink">your</span> capital.
              </p>
            </Reveal>
            <Reveal delay={0.24} y={10}>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/strategies"
                  className="nav-mono group inline-flex items-center gap-3 rounded-full bg-accent px-5 py-3 font-bold text-bg transition hover:brightness-110"
                >
                  Explore strategies <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/strategies/new"
                  className="nav-mono inline-flex items-center gap-2 rounded-full border border-border-strong px-5 py-3 text-ink transition hover:border-accent hover:text-accent"
                >
                  Be a lead trader
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.2} className="relative">
            <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-2xl shadow-black/30">
              <div className="mb-4 flex items-start justify-between px-1">
                <div>
                  <div className="nav-mono text-[10px] text-muted">Live market / Kuru depth</div>
                  <div className="mt-2 font-mono-nums text-2xl text-ink">
                    MON-USDC{" "}
                    {livePrice !== null && <span className="text-sm text-accent">{livePrice.toFixed(4)}</span>}
                  </div>
                </div>
                <span className="pill pill-lime flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  live
                </span>
              </div>
              <TradingConceptAnimation />
              <p className="nav-mono mt-3 text-center text-[9px] text-muted-dim">
                Illustrative setup walkthrough · price above is live
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.3}>
          <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            <div className="stat-cell">
              <span>Active strategies</span>
              <b>
                <CountUpValue value={overview?.activeStrategies ?? 0} />
              </b>
            </div>
            <div className="stat-cell">
              <span>Open positions</span>
              <b>
                <CountUpValue value={overview?.openPositions ?? 0} />
              </b>
            </div>
            <div className="stat-cell">
              <span>Realized PnL</span>
              <b className={overview && overview.totalRealizedPnlQuote < 0 ? "text-danger" : "text-accent"}>
                {overview ? (
                  <CountUpValue value={overview.totalRealizedPnlQuote} prefix={overview.totalRealizedPnlQuote >= 0 ? "+" : ""} decimals={2} />
                ) : (
                  "—"
                )}
              </b>
            </div>
            <div className="stat-cell">
              <span>Network</span>
              <b className="flex items-center gap-2">
                <i className="h-1.5 w-1.5 rounded-full bg-accent" /> Monad testnet
              </b>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------------- 01 MECHANISM ---------------- */}
      <section className={`${BAND} border-y border-border bg-bg-elevated py-24 lg:py-32`}>
        <div className="mx-auto max-w-content px-6">
          <Reveal>
            <div className="mb-16 max-w-xl">
              <p className="eyebrow">01 / The mechanism</p>
              <h2 className="section-title">
                A better copy
                <br />
                <i>starts before</i> the trade.
              </h2>
            </div>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                n: "01",
                Icon: Crosshair,
                title: "Define",
                copy: "A leader publishes a precise entry zone, target and stop. No vague calls, no after-the-fact screenshots.",
              },
              {
                n: "02",
                Icon: BarChart3,
                title: "Check",
                copy: "Before you copy, CopyCap simulates your exact size against live Kuru depth to find what is still reproducible.",
              },
              {
                n: "03",
                Icon: Copy,
                title: "Copy",
                copy: "Your trading wallet executes inside the Privy policy you set — max per trade, per day, max drift. Never wider.",
              },
            ].map(({ n, Icon, title, copy }, i) => (
              <Reveal key={n} delay={i * 0.12}>
                <div className="group relative h-full rounded-xl border border-border bg-panel p-7 transition hover:border-accent/30">
                  <div className="flex items-start justify-between">
                    <span className="font-mono-nums text-xs text-muted-dim">{n}</span>
                    <Icon className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="mt-16 font-accent text-3xl">{title}</h3>
                  <p className="mt-4 text-sm leading-6 text-muted">{copy}</p>
                  <ArrowDownRight className="absolute bottom-7 right-7 h-4 w-4 text-muted-dim transition group-hover:translate-x-1 group-hover:translate-y-1 group-hover:text-accent" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 02 PROBLEM ---------------- */}
      <section className="grid gap-16 py-24 lg:grid-cols-[.85fr_1.15fr] lg:py-32">
        <Reveal>
          <p className="eyebrow">02 / The problem</p>
          <h2 className="section-title">
            Naive copy
            <br />
            <i>trading lies.</i>
          </h2>
          <p className="mt-7 max-w-sm text-sm leading-7 text-muted">
            By the time a signal reaches the 40th follower, the order book has already moved. CopyCap makes
            reproducibility a precondition, not a hope.
          </p>
          <Link href="/strategies" className="nav-mono mt-8 inline-flex items-center gap-2 text-accent">
            See the difference <ChevronRight className="h-4 w-4" />
          </Link>
        </Reveal>
        <div className="grid content-center gap-3">
          {[
            { bad: "Leader enters at 10.00", good: "Your reproducible average: 10.02", Icon: CircleDashed },
            { bad: "40th follower fills at 10.71", good: "Copy sized to what fits inside your drift", Icon: ShieldCheck },
            { bad: "Unlimited exposure on autopilot", good: "Per-trade and per-day caps, enforced by policy", Icon: LockKeyhole },
          ].map(({ bad, good, Icon }, i) => (
            <Reveal key={bad} delay={i * 0.1}>
              <div className="grid gap-4 rounded-xl border border-border bg-bg-elevated p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="font-mono-nums text-xs text-muted line-through decoration-danger">{bad}</div>
                <Icon className="h-4 w-4 text-accent" />
                <div className="font-mono-nums text-xs text-accent">{good}</div>
              </div>
            </Reveal>
          ))}
          <p className="nav-mono mt-1 text-[9px] text-muted-dim">Illustrative numbers</p>
        </div>
      </section>

      {/* ---------------- 03 STRATEGY FEED ---------------- */}
      <section className={`${BAND} border-t border-border bg-bg-elevated py-24 lg:py-32`}>
        <div className="mx-auto max-w-content px-6">
          <Reveal>
            <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <div>
                <p className="eyebrow">03 / Strategy feed</p>
                <h2 className="section-title">
                  Find the
                  <br />
                  <i>real signal.</i>
                </h2>
              </div>
              <Link
                href="/strategies"
                className="nav-mono inline-flex items-center gap-2 self-start rounded-full border border-border-strong px-4 py-2.5 text-[10px] transition hover:border-accent hover:text-accent md:self-auto"
              >
                View all strategies <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </Reveal>

          {strategies.length === 0 ? (
            <div className="mt-12 rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
              No strategies yet — <Link href="/strategies/new" className="text-accent">post the first one</Link>.
            </div>
          ) : (
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {strategies.slice(0, 3).map((s, i) => {
                const pill = STATE_PILL[s.lifecycleState] ?? { label: s.lifecycleState, cls: "pill-muted" };
                const ret = strategyReturn(s);
                return (
                  <Reveal key={s.id} delay={i * 0.1}>
                    <Link
                      href={`/strategies/${s.id}`}
                      className="group block overflow-hidden rounded-xl border border-border bg-panel transition hover:-translate-y-1 hover:border-border-strong"
                    >
                      <div className="border-b border-border p-5">
                        <div className="flex items-center justify-between">
                          <span className={`pill ${pill.cls}`}>{pill.label}</span>
                          <span className="font-mono-nums text-[10px] text-muted-dim">{s.market.symbol}</span>
                        </div>
                        <div className="mt-5 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-accent text-2xl">{generateHandle(s.creator)}</h3>
                            <p className="mt-1 font-mono-nums text-[10px] text-muted-dim">
                              lead {shortAddress(s.creator)} · {s.positions.length} positions
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`font-mono-nums text-lg ${ret.positive ? "text-accent" : "text-danger"}`}>
                              {ret.value}
                            </div>
                            <div className="nav-mono text-[9px] text-muted-dim">{ret.label}</div>
                          </div>
                        </div>
                        <div className="mt-5">
                          <Sparkline points={sparkPoints(s)} color={ret.positive ? "accent" : "danger"} width={320} height={40} smooth />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-px bg-border">
                        {[
                          ["Entry", `${s.entryMin}–${s.entryMax}`],
                          ["Target", s.targetMin ? String(s.targetMin) : "—"],
                          ["Stop", s.stopLevel ? String(s.stopLevel) : "—"],
                        ].map(([label, value]) => (
                          <div key={label} className="bg-panel p-4">
                            <div className="nav-mono text-[9px] text-muted-dim">{label}</div>
                            <div className="mt-1 font-mono-nums text-xs text-ink">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between p-5">
                        <span className="flex items-center gap-2 font-mono-nums text-[10px] text-muted">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> live depth check
                        </span>
                        <span className="nav-mono flex items-center gap-2 text-[10px] text-ink">
                          Analyze <ArrowRight className="h-3 w-3 text-accent transition group-hover:translate-x-1" />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ---------------- 04 SMART MONEY ---------------- */}
      <section className="py-24 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
          <Reveal>
            <p className="eyebrow">04 / Smart money</p>
            <h2 className="section-title">
              See where
              <br />
              <i>conviction moves.</i>
            </h2>
            <p className="mt-7 max-w-sm text-sm leading-7 text-muted">
              A live on-chain feed of trades from Nansen-labelled Smart Money wallets, mapped to Kuru markets where one
              exists.
            </p>
            <Link href="/smart-money" className="nav-mono mt-8 inline-flex items-center gap-2 text-accent">
              Open the full feed <ChevronRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <span className="nav-mono flex items-center gap-2 text-[10px] text-accent">
                  <Radio className="h-3 w-3" /> Live feed
                </span>
                <span className="font-mono-nums text-[10px] text-muted-dim">
                  {smartMoney?.source === "live-nansen"
                    ? "Nansen · trailing 24h"
                    : smartMoney
                      ? "Synthetic sample · live Nansen unavailable"
                      : "Feed unavailable"}
                </span>
              </div>
              {smartTrades.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted">No Smart Money trades in the last 24h.</div>
              ) : (
                smartTrades.map((opp, i) => (
                  <div
                    key={opp.trade.transactionHash ?? i}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-5 py-5 last:border-0 sm:grid-cols-[1fr_1fr_auto_auto]"
                  >
                    <span className="truncate font-mono-nums text-xs text-ink">
                      {opp.trade.traderAddressLabel ?? shortAddress(opp.trade.traderAddress)}
                    </span>
                    <span className="hidden font-mono-nums text-[10px] uppercase sm:block">
                      <span className="text-danger">{opp.trade.tokenSoldSymbol}</span>
                      <span className="text-muted-dim"> → </span>
                      <span className="text-accent">{opp.trade.tokenBoughtSymbol}</span>
                    </span>
                    <span className="font-mono-nums text-xs text-ink">
                      ${(opp.trade.tradeValueUsd ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </span>
                    <span className={`pill ${opp.market ? "pill-lime" : "pill-muted"}`}>
                      {opp.market ? opp.market.symbol : "unmapped"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className={`${BAND} -mb-10 bg-accent text-bg`}>
        <div className="mx-auto flex max-w-content flex-col justify-between gap-10 px-6 py-20 lg:flex-row lg:items-end lg:py-24">
          <Reveal>
            <p className="nav-mono text-[10px] opacity-60">Your next position</p>
            <h2 className="mt-5 max-w-2xl font-accent text-5xl leading-[.9] tracking-[-.04em] sm:text-7xl">
              Don&apos;t copy
              <br />
              <i>the past.</i>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="max-w-sm">
              <p className="text-sm leading-6 opacity-70">
                Sign in with Privy. Set your risk limits. Copy only what the market can still support.
              </p>
              <Link
                href="/strategies"
                className="nav-mono mt-6 inline-flex items-center gap-3 rounded-full bg-bg px-5 py-3 font-bold text-accent transition hover:opacity-90"
              >
                Start copying <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
