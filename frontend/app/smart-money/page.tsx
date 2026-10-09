import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";

export default async function SmartMoneyFeedPage() {
  const data = await api.smartMoney();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Smart Money Feed</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{data.note}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Source: <span className="font-mono">{data.source}</span>
          {data.source === "synthetic-fallback" && (
            <span className="ml-2 text-amber-400">
              (NANSEN_API_KEY not configured — showing a labeled synthetic Smart Money trade)
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-4">
        {data.opportunities.map((opp: any, i: number) => (
          <div key={i} className="rounded border border-[var(--border)] bg-[var(--panel)] p-5">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {opp.trade.traderAddressLabel} bought {opp.trade.tokenBoughtSymbol}
              </div>
              {opp.capacity && <StatusBadge status={opp.capacity.status} />}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-[var(--muted)] sm:grid-cols-4">
              <div>Trader: {opp.trade.traderAddress}</div>
              <div>Trade value: ${opp.trade.tradeValueUsd?.toLocaleString() ?? "—"}</div>
              <div>Chain: {opp.trade.chain}</div>
              <div>Time: {new Date(opp.trade.blockTimestamp).toLocaleString()}</div>
            </div>
            {opp.market ? (
              <div className="mt-3 text-sm">
                Mapped to Kuru market <span className="font-mono">{opp.market.symbol}</span>
                {opp.capacity && (
                  <span className="ml-2 text-[var(--muted)]">
                    — current copyability: {opp.capacity.reason}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-3 text-sm text-[var(--muted)]">
                No supported Kuru market for this token yet — opportunity discovery only.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
