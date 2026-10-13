"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { api, ApiError, type CapacityResult } from "@/lib/api";

const EXPLORER_TX = "https://testnet.monadexplorer.com/tx/";

/**
 * Executes the copy. The backend re-runs the same pre-trade gate, then the
 * follower's Privy trading wallet signs the bounded Kuru order — no wallet
 * popup — and Privy checks it against the wallet's policy before signing.
 *
 * If the real attempt is refused (e.g. no quote-token balance on a thin
 * testnet market), a clearly-labeled "Simulate" fallback is offered — never
 * silently, and never dressed up to look like a real transaction. The
 * simulated numbers are still derived from the real, live capacity
 * evaluation below; only the execution step itself is mocked.
 */
export function CopyActionPanel({
  strategyId,
  wallet,
  amount,
  capacity,
}: {
  strategyId: string;
  wallet: string;
  amount: number;
  capacity: CapacityResult;
}) {
  const { address, getAccessToken } = useWallet();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "executing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<{ baseAmount: number; price: number } | null>(null);

  const isOwner = !!address && address.toLowerCase() === wallet.toLowerCase();
  const canCopy = capacity.executableNotional > 0 && capacity.expectedAveragePrice !== null;

  async function handleCopy() {
    setError(null);
    setTxHash(null);
    setSimulated(null);
    setStatus("executing");
    try {
      const result = await api.copy(await getAccessToken(), strategyId, { wallet, notional: amount });
      setTxHash(result.txHash);
      setStatus("done");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed.";
      setError(err instanceof ApiError && err.code === "PRIVY_POLICY_DENIED" ? `Blocked by your Privy policy. ${message}` : message);
      setStatus("idle");
    }
  }

  /** Mocks the execution step only — the price/size come from the real, live capacity evaluation above. */
  function handleSimulate() {
    if (!capacity.expectedAveragePrice) return;
    setSimulated({ baseAmount: amount / capacity.expectedAveragePrice, price: capacity.expectedAveragePrice });
  }

  if (simulated) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 font-mono-nums text-[10px] font-semibold text-warning">
            SIMULATED
          </span>
          <p className="text-xs text-muted-dim">Not a real transaction — no wallet signed anything, nothing moved on-chain.</p>
        </div>
        <p className="mt-2 text-xs text-ink">
          Would buy <span className="font-mono-nums">{simulated.baseAmount.toFixed(4)}</span> MON at{" "}
          <span className="font-mono-nums">{simulated.price.toFixed(4)}</span>, spending{" "}
          <span className="font-mono-nums">{amount.toFixed(2)}</span> — figures from the real, live order book above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-ink">Act on this analysis</p>
          <p className="text-xs text-muted-dim">
            {isOwner
              ? `Your trading wallet buys up to ${capacity.executableNotional.toFixed(2)} on Kuru, bounded at ${capacity.effectiveMaxPrice}.`
              : address
                ? "This analysis belongs to a different wallet than the one you're signed in with."
                : "Sign in to execute this copy."}
          </p>
        </div>
        <button
          onClick={handleCopy}
          disabled={status !== "idle" || !canCopy || !isOwner}
          title={!canCopy ? "No reproducible capacity at this amount right now" : undefined}
          className="rounded-sm bg-accent px-4 py-2 text-xs font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "executing" ? "Executing on Kuru…" : status === "done" ? "Executed ✓" : "Copy now"}
        </button>
      </div>
      {error && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-danger">{error}</p>
          <button onClick={handleSimulate} className="text-xs text-warning underline decoration-dotted underline-offset-2">
            Simulate this instead (demo, clearly not real)
          </button>
        </div>
      )}
      {txHash && (
        <p className="mt-2 font-mono-nums text-xs text-success">
          <a href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer" className="underline">
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>{" "}
          — filled and recorded. Check the Positions tab.
        </p>
      )}
    </div>
  );
}
