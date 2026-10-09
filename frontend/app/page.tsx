import Link from "next/link";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

export default async function StrategyFeedPage() {
  const strategies = await api.listStrategies().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Strategy Feed</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Momentum-breakout strategies from KOLs and gated communities. Status reflects live market
          reproducibility, not just whether price touched the range.
        </p>
      </div>

      {strategies.length === 0 && (
        <div className="rounded border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
          No strategies yet. Create one via <code>POST /strategies</code> on the MirrorCap API, or run the
          demo script in the repo README.
        </div>
      )}

      <div className="grid gap-4">
        {strategies.map((s) => (
          <Link
            key={s.id}
            href={`/strategies/${s.id}`}
            className="block rounded border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:border-slate-500"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{s.market.symbol} — Momentum Breakout</div>
              <StatusBadge status={s.lifecycleState} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-[var(--muted)] sm:grid-cols-4">
              <div>Breakout: {s.breakoutLevel}</div>
              <div>
                Entry: {s.entryMin}–{s.entryMax}
              </div>
              <div>Current: {s.currentPrice ?? "—"}</div>
              <div>Network: {s.market.network}</div>
            </div>
            {s.description && <p className="mt-2 text-sm text-[var(--muted)]">{s.description}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
