"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { api } from "@/lib/api";

/**
 * Follow with explicit risk limits. Following creates the follower's Privy
 * trading wallet, and these limits become the Privy policy it signs under.
 */
export function QuickFollowButton({ strategyId, wallet, amount }: { strategyId: string; wallet: string; amount: number }) {
  const router = useRouter();
  const { address, getAccessToken } = useWallet();
  const [maxTrade, setMaxTrade] = useState(String(amount || 100));
  const [maxDaily, setMaxDaily] = useState(String((amount || 100) * 2));
  const [maxDriftBps, setMaxDriftBps] = useState("300");
  const [status, setStatus] = useState<"idle" | "following" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const isOwner = !!address && address.toLowerCase() === wallet.toLowerCase();

  async function handleFollow() {
    setError(null);
    setStatus("following");
    try {
      await api.follow(await getAccessToken(), strategyId, {
        wallet,
        maxTradeNotional: Number(maxTrade),
        maxDailyOutflow: Number(maxDaily),
        maxDriftBps: Number(maxDriftBps),
        allowPartialFill: true,
      });
      setStatus("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow failed.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <p className="mb-4 text-sm text-success">
        Following — your trading wallet is ready and its Privy policy caps each trade at {maxTrade}.
      </p>
    );
  }

  const input =
    "w-24 rounded-sm border border-border-strong bg-bg px-2 py-1.5 font-mono-nums text-xs outline-none focus:border-accent";

  return (
    <div className="mb-4 space-y-3 rounded-sm border border-accent/30 bg-accent/5 px-4 py-3">
      <p className="text-sm text-muted">
        {isOwner
          ? "Not following yet. Set your limits — they're enforced by Privy on the wallet that trades for you."
          : "Sign in with the wallet above to follow this strategy."}
      </p>
      {isOwner && (
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted-dim">Max per trade</span>
            <input value={maxTrade} onChange={(e) => setMaxTrade(e.target.value)} inputMode="decimal" className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-dim">Max per day</span>
            <input value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)} inputMode="decimal" className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-dim">Max drift (bps)</span>
            <input value={maxDriftBps} onChange={(e) => setMaxDriftBps(e.target.value)} inputMode="numeric" className={input} />
          </label>
          <button
            onClick={handleFollow}
            disabled={status === "following"}
            className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "following" ? "Creating trading wallet…" : "Follow"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
