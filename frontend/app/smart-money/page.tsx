import { Reveal, RevealStagger } from "@/components/Reveal";
import { SmartMoneyRow } from "@/components/SmartMoneyRow";
import { StatTile } from "@/components/StatTile";
import { api } from "@/lib/api";

export default async function SmartMoneyFeedPage() {
  const data = await api.smartMoney();
  const opportunities = data.opportunities as any[];

  const withMarket = opportunities.filter((o) => o.market).length;
  const totalValue = opportunities.reduce((sum, o) => sum + (o.trade.tradeValueUsd ?? 0), 0);
  const copyable = opportunities.filter((o) => o.capacity?.status === "COPYABLE" || o.capacity?.status === "LIMITED_CAPACITY").length;

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Smart Money Feed</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">{data.note}</p>
        <p className="mt-2 text-xs text-muted-dim">
          Source: <span className="font-mono-nums text-ink">{data.source}</span>
          {data.source === "synthetic-fallback" && (
            <span className="ml-2 text-warning">
              (NANSEN_API_KEY not configured — showing a labeled synthetic Smart Money trade)
            </span>
          )}
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-3 gap-6 rounded-lg border border-border bg-panel p-6">
          <StatTile label="Trades (24h window)" value={String(opportunities.length)} />
          <StatTile label="Mapped to a Kuru market" value={`${withMarket} / ${opportunities.length}`} accent="accent" />
          <StatTile label="Currently copyable" value={String(copyable)} accent="success" />
        </section>
      </Reveal>

      {opportunities.length === 0 ? (
        <Reveal delay={0.1}>
          <div className="rounded-lg border border-dashed border-border-strong bg-panel p-8 text-center text-sm text-muted">
            No Smart Money trades in the trailing 24h window right now.
          </div>
        </Reveal>
      ) : (
        <RevealStagger className="grid gap-4">
          {opportunities.map((opp, i) => (
            <SmartMoneyRow key={i} opp={opp} />
          ))}
        </RevealStagger>
      )}
    </div>
  );
}
