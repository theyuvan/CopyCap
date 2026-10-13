import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { LiveTradingChart, type TradingBarDatum } from "@/components/LiveTradingChart";
import { PerformanceChart } from "@/components/PerformanceChart";
import { DonutChart } from "@/components/DonutChart";
import { Reveal } from "@/components/Reveal";
import { DetailTabs } from "@/components/DetailTabs";
import { Identicon } from "@/components/Identicon";
import { WalletInput } from "@/components/WalletInput";
import { CopyActionPanel } from "@/components/CopyActionPanel";
import { TradingWalletPanel } from "@/components/TradingWalletPanel";
import { QuickFollowButton } from "@/components/QuickFollowButton";
import { ClosePositionButton } from "@/components/ClosePositionButton";
import { shortAddress, generateHandle } from "@/lib/identity";

const EXPLORER_TX = "https://testnet.monadexplorer.com/tx/";

export default async function StrategyDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { wallet?: string; amount?: string };
}) {
  const strategy = await api.getStrategy(params.id);
  const wallet = searchParams.wallet;
  const amount = Number(searchParams.amount ?? 100);

  const analysis =
    wallet && amount > 0 ? await api.analyze(params.id, wallet, amount).catch((e) => ({ error: String(e) })) : null;

  const curveBars: TradingBarDatum[] | null =
    analysis && "capacityCurve" in analysis
      ? analysis.capacityCurve.map((p) => ({
          value: p.expectedAveragePrice ?? 0,
          variant: p.status === "COPYABLE" ? "up" : p.status === "OUTSIDE_POLICY" || p.status === "EXPIRED" ? "down" : "neutral",
        }))
      : null;

  const closedPositions = strategy.positions
    .filter((p) => p.state === "CLOSED" && p.exitExecutedAt)
    .sort((a, b) => a.exitExecutedAt!.localeCompare(b.exitExecutedAt!));
  const openPositions = strategy.positions.filter((p) => p.state !== "CLOSED");
  const wins = closedPositions.filter((p) => (p.realizedPnlQuote ?? 0) > 0).length;
  const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : null;
  const entryMsLeft = new Date(strategy.entryExpiresAt).getTime() - Date.now();
  const entryDaysLeft = Math.max(0, Math.ceil(entryMsLeft / (1000 * 60 * 60 * 24)));
  const daysTrading = Math.max(0, Math.floor((Date.now() - new Date(strategy.createdAt).getTime()) / (1000 * 60 * 60 * 24)));

  const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + (p.realizedPnlQuote ?? 0), 0);
  const totalLeaderFee = closedPositions.reduce((sum, p) => sum + (p.leaderFeeQuote ?? 0), 0);
  const closedCapital = closedPositions.reduce((sum, p) => sum + p.quoteSpent, 0);
  const roi = closedCapital > 0 ? (totalRealizedPnl / closedCapital) * 100 : null;
  const aum = openPositions.reduce((sum, p) => sum + p.quoteSpent, 0);
  const losses = closedPositions.length - wins;

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="rounded-lg border border-border bg-panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Identicon address={strategy.creator} size={56} />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{generateHandle(strategy.creator)}</h1>
                  <StatusBadge status={strategy.lifecycleState} />
                </div>
                <p className="font-mono-nums text-xs text-muted-dim">{shortAddress(strategy.creator)}</p>
                <p className="mt-1 text-sm text-muted">{strategy.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-muted-dim">
                    Momentum Breakout
                  </span>
                  <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-muted-dim">{strategy.market.symbol}</span>
                  <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-muted-dim">
                    {strategy.market.network.replace("monad-", "")}
                  </span>
                  <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-muted-dim">
                    10% leader fee
                  </span>
                </div>
              </div>
            </div>
            <a
              href="#overview"
              className="rounded-sm bg-accent px-6 py-2.5 text-center text-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              Follow / Copy
            </a>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-5 border-t border-border pt-5 sm:grid-cols-5">
            <Field
              label="Followers"
              value={strategy.maxFollowers ? `${strategy.positions.length} / ${strategy.maxFollowers}` : strategy.positions.length}
              mono
            />
            <Field label="Days trading" value={daysTrading} mono />
            <Field label="Current price" value={strategy.currentPrice ?? "—"} mono accent="accent" />
            <Field label="Win rate" value={winRate !== null ? `${winRate.toFixed(0)}%` : "—"} mono accent="success" />
            <Field label="Entry window" value={entryDaysLeft > 0 ? `${entryDaysLeft}d left` : "expired"} mono />
          </div>

          <a
            href="/smart-money"
            className="mt-5 flex items-center justify-between rounded-sm border border-border-strong bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-accent/50"
          >
            <span className="text-muted">
              See what Smart Money wallets are doing right now <span className="text-accent">on the live Nansen feed</span>
            </span>
            <span className="text-accent">→</span>
          </a>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-5 rounded-lg border border-border bg-panel p-6 sm:grid-cols-4">
          <Field label="Breakout level" value={strategy.breakoutLevel} mono />
          <Field label="Entry range" value={`${strategy.entryMin} – ${strategy.entryMax}`} mono />
          <Field
            label="Target"
            value={strategy.targetMin ? `${strategy.targetMin} – ${strategy.targetMax ?? ""}` : "—"}
            mono
          />
          <Field label="Stop" value={strategy.stopLevel ?? "—"} mono accent="danger" />
        </section>
      </Reveal>

      <div id="overview">
        <DetailTabs
          tabs={[
            {
              id: "performance",
              label: "Performance",
              content: (
                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="rounded-lg border border-border bg-panel p-6">
                    <h3 className="mb-4 text-sm font-semibold text-muted">Performance</h3>
                    <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
                      <div>
                        <div className="text-xs text-muted-dim">ROI</div>
                        <div className={`font-mono-nums text-xl font-bold ${roi !== null ? (roi >= 0 ? "text-success" : "text-danger") : "text-muted-dim"}`}>
                          {roi !== null ? `${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-dim">PnL</div>
                        <div className={`font-mono-nums text-xl font-bold ${totalRealizedPnl > 0 ? "text-success" : totalRealizedPnl < 0 ? "text-danger" : "text-muted-dim"}`}>
                          {totalRealizedPnl >= 0 ? "+" : ""}
                          {totalRealizedPnl.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3 pt-4 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Leader fees paid</span>
                        <span className="font-mono-nums">{totalLeaderFee.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Win rate</span>
                        <span className="font-mono-nums text-success">{winRate !== null ? `${winRate.toFixed(2)}%` : "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Win positions</span>
                        <span className="font-mono-nums">{wins}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Total positions</span>
                        <span className="font-mono-nums">{strategy.positions.length}</span>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-panel p-6">
                    <PerformanceChart
                      positions={closedPositions.map((p) => ({
                        exitExecutedAt: p.exitExecutedAt!,
                        realizedPnlQuote: p.realizedPnlQuote ?? 0,
                        quoteSpent: p.quoteSpent,
                      }))}
                    />
                  </section>

                  <section className="rounded-lg border border-border bg-panel p-6">
                    <h3 className="mb-4 text-sm font-semibold">Lead Trader Overview</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <span className="text-muted">AUM (open positions)</span>
                        <span className="font-mono-nums">{aum.toFixed(2)} USDC</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <span className="text-muted">Profit sharing</span>
                        <span className="font-mono-nums">10.00%</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <span className="text-muted">Max strategy notional</span>
                        <span className="font-mono-nums">{strategy.maxStrategyNotional ?? "unbounded"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Total followers (all-time)</span>
                        <span className="font-mono-nums">{strategy.positions.length}</span>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-panel p-6">
                    <h3 className="mb-4 text-sm font-semibold">Outcome Breakdown</h3>
                    <DonutChart
                      segments={[
                        { label: "Wins", value: wins, color: "#34d399" },
                        { label: "Losses", value: losses, color: "#f87171" },
                        { label: "Open", value: openPositions.length, color: "#d4ff72" },
                      ]}
                    />
                  </section>
                </div>
              ),
            },
            {
              id: "overview",
              label: "Capacity Analysis",
              content: (
                <section className="rounded-lg border border-border bg-panel p-6">
                  <h2 className="mb-1 text-lg font-semibold">Your Reproducible Capacity</h2>
                  <p className="mb-4 text-sm text-muted">
                    Live check: can your wallet still reproduce this entry, right now, at your own risk settings?
                  </p>
                  <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
                    <label className="flex flex-col gap-1">
                      <span className="text-muted">Wallet</span>
                      <WalletInput
                        name="wallet"
                        defaultValue={wallet}
                        className="w-64 rounded-sm border border-border-strong bg-bg px-3 py-2 font-mono-nums text-xs outline-none focus:border-accent"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-muted">Amount (quote)</span>
                      <input
                        name="amount"
                        defaultValue={amount}
                        className="w-28 rounded-sm border border-border-strong bg-bg px-3 py-2 font-mono-nums outline-none focus:border-accent"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-sm bg-accent px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90"
                    >
                      Analyze
                    </button>
                  </form>

                  {!wallet && (
                    <p className="text-sm text-muted">
                      Sign in, then Analyze to see your personal Reproducible Capacity — you&apos;ll be prompted to
                      follow first if you haven&apos;t already.
                    </p>
                  )}

                  {wallet && !(analysis && "evaluation" in analysis) && (
                    <QuickFollowButton strategyId={params.id} wallet={wallet} amount={amount} />
                  )}

                  {analysis && "error" in analysis && (
                    <p className="text-sm text-danger">
                      {analysis.error.includes("404")
                        ? "Not following this strategy yet — click Follow above, then Analyze again."
                        : analysis.error}
                    </p>
                  )}

                  {analysis && "evaluation" in analysis && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={analysis.evaluation.status} />
                        <span className="text-sm text-muted">{analysis.evaluation.reason}</span>
                      </div>
                      <div className="text-xs text-muted-dim">
                        Order book source: <span className="font-mono-nums text-ink">{analysis.orderBookSource}</span>
                        {analysis.orderBookSource === "synthetic-fallback" && (
                          <span className="ml-2 text-warning">
                            (no MONAD_RPC_URL configured — showing a labeled synthetic book, not live Kuru data)
                          </span>
                        )}
                      </div>

                      {analysis.evaluation.capacity && (
                        <div className="grid grid-cols-2 gap-5 rounded-lg border border-border bg-bg-elevated p-5 sm:grid-cols-4">
                          <Field label="Effective max price" value={analysis.evaluation.capacity.effectiveMaxPrice} mono />
                          <Field
                            label="Expected avg price"
                            value={analysis.evaluation.capacity.expectedAveragePrice ?? "—"}
                            mono
                          />
                          <Field
                            label="Expected deviation"
                            value={
                              analysis.evaluation.capacity.expectedDeviationBps !== null
                                ? `${analysis.evaluation.capacity.expectedDeviationBps.toFixed(1)} bps`
                                : "—"
                            }
                            mono
                          />
                          <Field
                            label="Reproducible Capacity"
                            value={analysis.evaluation.capacity.reproducibleCapacityNotional.toFixed(0)}
                            mono
                            accent="success"
                          />
                        </div>
                      )}

                      {wallet && analysis.follower.tradingWalletAddress && (
                        <TradingWalletPanel
                          strategyId={params.id}
                          wallet={wallet}
                          defaultPrice={strategy.currentPrice ?? strategy.breakoutLevel}
                        />
                      )}

                      {analysis.evaluation.capacity && wallet && (
                        <CopyActionPanel
                          strategyId={params.id}
                          wallet={wallet}
                          amount={amount}
                          capacity={analysis.evaluation.capacity}
                        />
                      )}

                      {curveBars && curveBars.length > 1 && (
                        <div>
                          <h3 className="mb-3 text-sm font-medium text-muted">
                            Capacity curve — execution price as your size grows
                          </h3>
                          <div className="rounded-lg border border-border-strong bg-bg-elevated/80 p-4">
                            <LiveTradingChart data={curveBars} height={280} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              ),
            },
            {
              id: "positions",
              label: `Positions (${strategy.positions.length})`,
              content: (
                <section className="rounded-lg border border-border bg-panel p-6">
                  {strategy.positions.length === 0 ? (
                    <p className="text-sm text-muted">No positions recorded yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-dim">
                        <tr>
                          <th className="pb-3">Follower</th>
                          <th className="pb-3">State</th>
                          <th className="pb-3">Entry</th>
                          <th className="pb-3">Exit</th>
                          <th className="pb-3">Realized PnL</th>
                          <th className="pb-3">Leader fee (10%)</th>
                          <th className="pb-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategy.positions.map((p) => (
                          <tr key={p.id} className="border-t border-border">
                            <td className="py-3 font-mono-nums text-xs text-muted">
                              {p.follower}
                              {p.entryTxHash && (
                                <div className="mt-0.5 text-[10px] text-success">
                                  <a href={`${EXPLORER_TX}${p.entryTxHash}`} target="_blank" rel="noreferrer" className="underline">
                                    entry tx: {p.entryTxHash.slice(0, 10)}…
                                  </a>
                                </div>
                              )}
                              {p.exitTxHash && (
                                <div className="mt-0.5 text-[10px] text-success">
                                  <a href={`${EXPLORER_TX}${p.exitTxHash}`} target="_blank" rel="noreferrer" className="underline">
                                    exit tx: {p.exitTxHash.slice(0, 10)}…
                                  </a>
                                </div>
                              )}
                            </td>
                            <td className="py-3">
                              <StatusBadge status={p.state} />
                            </td>
                            <td className="py-3 font-mono-nums">{p.entryAvgPrice}</td>
                            <td className="py-3 font-mono-nums">{p.exitAvgPrice ?? "—"}</td>
                            <td
                              className={`py-3 font-mono-nums ${
                                p.realizedPnlQuote !== undefined
                                  ? p.realizedPnlQuote > 0
                                    ? "text-success"
                                    : p.realizedPnlQuote < 0
                                      ? "text-danger"
                                      : ""
                                  : ""
                              }`}
                            >
                              {p.realizedPnlQuote ?? "—"}
                            </td>
                            <td className="py-3 font-mono-nums">{p.leaderFeeQuote ?? "—"}</td>
                            <td className="py-3">
                              {p.state !== "CLOSED" && (
                                <ClosePositionButton
                                  strategyId={params.id}
                                  positionId={p.id}
                                  follower={p.follower}
                                  baseAmount={p.baseAmount}
                                  quoteSpent={p.quoteSpent}
                                  currentPrice={strategy.currentPrice}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  truncate,
  accent,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  truncate?: boolean;
  accent?: "accent" | "success" | "danger";
}) {
  const accentClass = accent === "accent" ? "text-accent" : accent === "success" ? "text-success" : accent === "danger" ? "text-danger" : "";
  return (
    <div>
      <div className="text-xs text-muted-dim">{label}</div>
      <div className={`${mono ? "font-mono-nums" : "font-medium"} ${truncate ? "truncate text-xs" : ""} ${accentClass}`}>
        {value}
      </div>
    </div>
  );
}
