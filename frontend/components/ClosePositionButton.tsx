"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { api, ApiError } from "@/lib/api";

const EXPLORER_TX = "https://testnet.monadexplorer.com/tx/";
const LEADER_FEE_RATE = 0.1; // mirrors backend/packages/strategy-engine/src/fees.ts — display only, never trusted for a real close

/**
 * Closes a position with a REAL on-chain market sell — the trading wallet
 * sells the position's base amount through Kuru, and the realized PnL / 10%
 * leader fee are computed from the actual proceeds, not a typed-in price.
 * Only the connected wallet matching this position's follower can close it.
 *
 * If the real sell is refused (e.g. no live bids on a thin testnet market),
 * a clearly-labeled "Simulate" fallback is offered — the PnL math is real
 * (`quoteSpent` and `currentPrice` are the position's and market's actual
 * values), only the execution itself is mocked, and it's never shown as a
 * real transaction.
 */
export function ClosePositionButton({
  strategyId,
  positionId,
  follower,
  baseAmount,
  quoteSpent,
  currentPrice,
}: {
  strategyId: string;
  positionId: string;
  follower: string;
  /** Used only for the simulated fallback's PnL math — the real close reads these from the chain itself. */
  baseAmount?: number;
  quoteSpent?: number;
  currentPrice?: number | null;
}) {
  const { address, getAccessToken } = useWallet();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "confirm" | "executing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ realizedPnlQuote: number; leaderFeeQuote: number; txHash: string } | null>(
    null,
  );
  const [simulated, setSimulated] = useState<{ realizedPnlQuote: number; leaderFeeQuote: number; exitPrice: number } | null>(
    null,
  );

  const isOwner = address && address.toLowerCase() === follower.toLowerCase();

  if (!isOwner) {
    return <span className="text-xs text-muted-dim">—</span>;
  }

  if (simulated) {
    return (
      <span className="font-mono-nums text-xs">
        <span className="mr-1.5 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
          SIMULATED
        </span>
        <span className={simulated.realizedPnlQuote >= 0 ? "text-success" : "text-danger"}>
          {simulated.realizedPnlQuote >= 0 ? "+" : ""}
          {simulated.realizedPnlQuote.toFixed(2)} PnL, {simulated.leaderFeeQuote.toFixed(2)} fee to leader
        </span>{" "}
        <span className="text-muted-dim">— not a real transaction, at live price {simulated.exitPrice.toFixed(4)}</span>
      </span>
    );
  }

  if (result) {
    return (
      <span className={`font-mono-nums text-xs ${result.realizedPnlQuote >= 0 ? "text-success" : "text-danger"}`}>
        Closed: {result.realizedPnlQuote >= 0 ? "+" : ""}
        {result.realizedPnlQuote.toFixed(2)} PnL, {result.leaderFeeQuote.toFixed(2)} fee to leader{" "}
        <a href={`${EXPLORER_TX}${result.txHash}`} target="_blank" rel="noreferrer" className="underline">
          view tx
        </a>
      </span>
    );
  }

  async function handleClose() {
    setStatus("executing");
    setError(null);
    try {
      const res = await api.closePosition(await getAccessToken(), strategyId, positionId);
      setResult({ realizedPnlQuote: res.realizedPnlQuote ?? 0, leaderFeeQuote: res.leaderFeeQuote ?? 0, txHash: res.txHash });
      setStatus("done");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Close failed.";
      setError(err instanceof ApiError && err.code === "PRIVY_POLICY_DENIED" ? `Blocked by your Privy policy. ${message}` : message);
      setStatus("confirm");
    }
  }

  /** Mocks the execution step only — quoteSpent and currentPrice are the position's/market's real, live values. */
  function handleSimulate() {
    const exitPrice = currentPrice ?? undefined;
    if (!baseAmount || quoteSpent === undefined || !exitPrice) return;
    const quoteReceived = baseAmount * exitPrice;
    const realizedPnlQuote = quoteReceived - quoteSpent;
    const leaderFeeQuote = realizedPnlQuote > 0 ? realizedPnlQuote * LEADER_FEE_RATE : 0;
    setSimulated({ realizedPnlQuote, leaderFeeQuote, exitPrice });
  }

  if (status === "idle") {
    return (
      <button
        onClick={() => setStatus("confirm")}
        className="rounded-sm border border-border-strong bg-white/5 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-white/10"
      >
        Close position
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={handleClose}
        disabled={status === "executing"}
        className="rounded-sm bg-accent px-2.5 py-1 text-xs font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "executing" ? "Selling on Kuru…" : "Confirm real sell"}
      </button>
      {error && (
        <>
          <span className="text-xs text-danger">{error}</span>
          {baseAmount !== undefined && quoteSpent !== undefined && currentPrice != null && (
            <button onClick={handleSimulate} className="text-xs text-warning underline decoration-dotted underline-offset-2">
              Simulate this instead (demo, clearly not real)
            </button>
          )}
        </>
      )}
    </div>
  );
}
