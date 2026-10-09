import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { CapacityCurveChart } from "@/components/CapacityCurveChart";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{strategy.market.symbol} — Momentum Breakout</h1>
          <p className="text-sm text-[var(--muted)]">{strategy.description}</p>
        </div>
        <StatusBadge status={strategy.lifecycleState} />
      </div>

      <section className="grid grid-cols-2 gap-4 rounded border border-[var(--border)] bg-[var(--panel)] p-5 sm:grid-cols-4">
        <Field label="Breakout level" value={strategy.breakoutLevel} />
        <Field label="Entry range" value={`${strategy.entryMin} – ${strategy.entryMax}`} />
        <Field label="Target" value={strategy.targetMin ? `${strategy.targetMin} – ${strategy.targetMax ?? ""}` : "—"} />
        <Field label="Stop" value={strategy.stopLevel ?? "—"} />
        <Field label="Entry expiry" value={new Date(strategy.entryExpiresAt).toLocaleString()} />
        <Field label="Live Kuru market" value={strategy.market.marketAddress} mono />
        <Field label="Network" value={strategy.market.network} />
        <Field label="Current price" value={strategy.currentPrice ?? "—"} />
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="mb-3 font-medium">Your Reproducible Capacity</h2>
        <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Wallet</span>
            <input
              name="wallet"
              defaultValue={wallet}
              placeholder="0x..."
              className="rounded border border-[var(--border)] bg-black/30 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Amount (quote)</span>
            <input
              name="amount"
              defaultValue={amount}
              className="w-28 rounded border border-[var(--border)] bg-black/30 px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-slate-600 px-3 py-1.5 font-medium hover:bg-slate-500">
            Analyze
          </button>
        </form>

        {!wallet && (
          <p className="text-sm text-[var(--muted)]">
            Enter a wallet (must already be following this strategy via <code>mm mirrorcap follow</code> or{" "}
            <code>POST /strategies/:id/follow</code>) to see your personal Reproducible Capacity.
          </p>
        )}

        {analysis && "error" in analysis && (
          <p className="text-sm text-rose-400">{analysis.error}</p>
        )}

        {analysis && "evaluation" in analysis && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={analysis.evaluation.status} />
              <span className="text-sm text-[var(--muted)]">{analysis.evaluation.reason}</span>
            </div>
            <div className="text-xs text-[var(--muted)]">
              Order book source: <span className="font-mono">{analysis.orderBookSource}</span>
              {analysis.orderBookSource === "synthetic-fallback" && (
                <span className="ml-2 text-amber-400">
                  (no MONAD_RPC_URL configured — showing a labeled synthetic book, not live Kuru data)
                </span>
              )}
            </div>

            {analysis.evaluation.capacity && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Effective max price" value={analysis.evaluation.capacity.effectiveMaxPrice} />
                <Field
                  label="Expected avg price"
                  value={analysis.evaluation.capacity.expectedAveragePrice ?? "—"}
                />
                <Field
                  label="Expected deviation"
                  value={
                    analysis.evaluation.capacity.expectedDeviationBps !== null
                      ? `${analysis.evaluation.capacity.expectedDeviationBps.toFixed(1)} bps`
                      : "—"
                  }
                />
                <Field
                  label="Reproducible Capacity"
                  value={analysis.evaluation.capacity.reproducibleCapacityNotional.toFixed(0)}
                />
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-medium text-[var(--muted)]">Capacity curve</h3>
              <CapacityCurveChart points={analysis.capacityCurve} />
            </div>

            <div className="rounded border border-[var(--border)] bg-black/30 p-3 font-mono text-xs">
              {analysis.suggestedCliCommand}
            </div>
          </div>
        )}
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="mb-3 font-medium">Positions</h2>
        {strategy.positions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No positions recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="pb-2">Follower</th>
                <th className="pb-2">State</th>
                <th className="pb-2">Entry</th>
                <th className="pb-2">Exit</th>
                <th className="pb-2">Realized PnL</th>
                <th className="pb-2">Leader fee (10%)</th>
              </tr>
            </thead>
            <tbody>
              {strategy.positions.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="py-2 font-mono text-xs">{p.follower}</td>
                  <td className="py-2">
                    <StatusBadge status={p.state} />
                  </td>
                  <td className="py-2">{p.entryAvgPrice}</td>
                  <td className="py-2">{p.exitAvgPrice ?? "—"}</td>
                  <td className="py-2">{p.realizedPnlQuote ?? "—"}</td>
                  <td className="py-2">{p.leaderFeeQuote ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={mono ? "truncate font-mono text-xs" : "font-medium"}>{value}</div>
    </div>
  );
}
