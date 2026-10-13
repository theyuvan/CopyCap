import Link from "next/link";
import { api } from "@/lib/api";
import { Reveal } from "@/components/Reveal";
import { FeedTabs } from "@/components/FeedTabs";

export default async function AllStrategiesPage() {
  const overview = await api.getOverview().catch(() => null);
  const strategies = overview?.details.map((d) => ({ ...d })) ?? [];

  const followerCounts: Record<string, number> = {};
  for (const d of overview?.details ?? []) followerCounts[d.id] = d.positions.length;

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Strategy Feed</h1>
            <p className="mt-2 text-sm text-muted">
              Status reflects live market reproducibility, not just whether price touched the range.
            </p>
          </div>
          <Link
            href="/strategies/new"
            className="btn-invert-accent flex items-center gap-2 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide"
          >
            Be a Lead Trader
          </Link>
        </div>
      </Reveal>

      {strategies.length === 0 ? (
        <Reveal delay={0.05}>
          <div className="rounded-lg border border-dashed border-border-strong bg-panel p-8 text-center text-sm text-muted">
            No strategies yet. Create one via <code className="text-accent">POST /strategies</code> on
            the CopyCap API, or run the demo script in the repo README.
          </div>
        </Reveal>
      ) : (
        <FeedTabs strategies={strategies} followerCounts={followerCounts} />
      )}
    </div>
  );
}
