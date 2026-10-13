import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { StatTile } from "@/components/StatTile";
import { Reveal } from "@/components/Reveal";
import { WalletInput } from "@/components/WalletInput";

export default async function PortfolioPage({ searchParams }: { searchParams: { wallet?: string } }) {
  const wallet = searchParams.wallet;
  const entries = wallet ? await api.getPortfolio(wallet).catch(() => []) : [];

  const closed = entries.filter((e) => e.position.state === "CLOSED");
  const wins = closed.filter((e) => (e.position.realizedPnlQuote ?? 0) > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null;
  const totalPnl = closed.reduce((sum, e) => sum + (e.position.realizedPnlQuote ?? 0), 0);
  const totalFees = closed.reduce((sum, e) => sum + (e.position.leaderFeeQuote ?? 0), 0);

  return (
    <div className="space-y-8">
      <Reveal>
        <h1 className="text-2xl font-bold tracking-tight">My Copies</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every position opened across strategies you follow, with realized PnL and the 10% leader fee paid out
          on close.
        </p>
        <form method="GET" className="mt-5 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Wallet</span>
            <WalletInput
              name="wallet"
              defaultValue={wallet}
              className="w-80 rounded-sm border border-border-strong bg-bg px-3 py-2 font-mono-nums text-xs outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            className="rounded-sm bg-accent px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90"
          >
            View
          </button>
        </form>
      </Reveal>

      {!wallet && (
        <Reveal delay={0.05}>
          <div className="rounded-lg border border-dashed border-border-strong bg-panel p-8 text-center text-sm text-muted">
            Sign in, or enter a wallet address that has followed at least one strategy, to see its copy-trading
            history.
          </div>
        </Reveal>
      )}

      {wallet && entries.length === 0 && (
        <Reveal delay={0.05}>
          <div className="rounded-lg border border-dashed border-border-strong bg-panel p-8 text-center text-sm text-muted">
            No positions found for <span className="font-mono-nums text-ink">{wallet}</span>.
          </div>
        </Reveal>
      )}

      {wallet && entries.length > 0 && (
        <>
          <Reveal delay={0.05}>
            <section className="grid grid-cols-2 gap-6 rounded-lg border border-border bg-panel p-6 sm:grid-cols-4">
              <StatTile label="Open copies" value={String(entries.filter((e) => e.position.state !== "CLOSED").length)} accent="accent" />
              <StatTile label="Closed copies" value={String(closed.length)} />
              <StatTile
                label="Realized PnL"
                value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`}
                accent={totalPnl > 0 ? "success" : totalPnl < 0 ? "danger" : undefined}
              />
              <StatTile label="Win rate" value={winRate !== null ? `${winRate.toFixed(0)}%` : "—"} accent="success" />
            </section>
          </Reveal>

          <Reveal delay={0.1}>
            <section className="rounded-lg border border-border bg-panel p-6">
              <h2 className="mb-4 text-lg font-semibold">Positions</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-dim">
                  <tr>
                    <th className="pb-3">Strategy</th>
                    <th className="pb-3">State</th>
                    <th className="pb-3">Entry</th>
                    <th className="pb-3">Exit</th>
                    <th className="pb-3">Realized PnL</th>
                    <th className="pb-3">Leader fee</th>
                    <th className="pb-3">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.position.id} className="border-t border-border">
                      <td className="py-3">
                        <a href={`/strategies/${e.strategy.id}`} className="font-medium text-accent hover:underline">
                          {e.strategy.market.symbol}
                        </a>
                      </td>
                      <td className="py-3">
                        <StatusBadge status={e.position.state} />
                      </td>
                      <td className="py-3 font-mono-nums">{e.position.entryAvgPrice}</td>
                      <td className="py-3 font-mono-nums">{e.position.exitAvgPrice ?? "—"}</td>
                      <td
                        className={`py-3 font-mono-nums ${
                          e.position.realizedPnlQuote !== undefined
                            ? e.position.realizedPnlQuote > 0
                              ? "text-success"
                              : e.position.realizedPnlQuote < 0
                                ? "text-danger"
                                : ""
                            : ""
                        }`}
                      >
                        {e.position.realizedPnlQuote ?? "—"}
                      </td>
                      <td className="py-3 font-mono-nums">{e.position.leaderFeeQuote ?? "—"}</td>
                      <td className="py-3 font-mono-nums text-xs text-muted-dim">
                        {e.position.entryExecutedAt ? new Date(e.position.entryExecutedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalFees > 0 && (
                <p className="mt-4 text-xs text-muted-dim">
                  Total leader fees paid across closed positions:{" "}
                  <span className="font-mono-nums text-ink">{totalFees.toFixed(2)}</span>
                </p>
              )}
            </section>
          </Reveal>
        </>
      )}
    </div>
  );
}
