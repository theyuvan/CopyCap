"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import { api, type TradingWallet } from "@/lib/api";
import { shortAddress } from "@/lib/identity";

const EXPLORER_TX = "https://testnet.monadexplorer.com/tx/";
const ERC20 = new ethers.utils.Interface(["function transfer(address to, uint256 amount)"]);

/**
 * The follow's Privy trading wallet: fund it from the signed-in user's
 * embedded wallet, see the policy Privy enforces on it, prove the cap holds,
 * and pull everything back out.
 */
export function TradingWalletPanel({
  strategyId,
  wallet,
  defaultPrice,
}: {
  strategyId: string;
  wallet: string;
  /** Prefills the limit-sell price field — typically the strategy's current/breakout price. */
  defaultPrice?: number;
}) {
  const { address, getAccessToken, sendTransaction } = useWallet();
  const [view, setView] = useState<TradingWallet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("10");
  const [limitPrice, setLimitPrice] = useState(defaultPrice ? String(defaultPrice) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string; tx?: string } | null>(null);

  const isOwner = !!address && address.toLowerCase() === wallet.toLowerCase();

  const refresh = useCallback(async () => {
    try {
      setView(await api.tradingWallet(strategyId, wallet));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the trading wallet.");
    }
  }, [strategyId, wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : `${label} failed.` });
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  const fundQuote = () =>
    run("fund", async () => {
      if (!view) return;
      const units = ethers.utils.parseUnits(fundAmount || "0", view.quote.decimals);
      if (units.lte(0)) throw new Error("Enter an amount to send.");
      const hash = await sendTransaction({
        to: view.quote.address,
        data: ERC20.encodeFunctionData("transfer", [view.address, units]),
        description: `Move ${fundAmount} ${view.quote.symbol} into your CopyCap trading wallet`,
      });
      setNotice({ tone: "ok", text: `Sent ${fundAmount} ${view.quote.symbol} to your trading wallet.`, tx: hash });
    });

  const fundGas = () =>
    run("gas", async () => {
      if (!view) return;
      const hash = await sendTransaction({
        to: view.address,
        value: ethers.utils.parseEther("0.05").toBigInt(),
        description: "Send 0.05 MON for gas to your CopyCap trading wallet",
      });
      setNotice({ tone: "ok", text: "Sent 0.05 MON for gas.", tx: hash });
    });

  /** Sends a custom MON amount (typed in `fundAmount`) — e.g. enough to fund a sell below. */
  const sendMon = () =>
    run("send-mon", async () => {
      if (!view) return;
      const units = ethers.utils.parseEther(fundAmount || "0");
      if (units.lte(0)) throw new Error("Enter an amount to send.");
      const hash = await sendTransaction({
        to: view.address,
        value: units.toBigInt(),
        description: `Send ${fundAmount} MON to your CopyCap trading wallet`,
      });
      setNotice({ tone: "ok", text: `Sent ${fundAmount} MON to your trading wallet.`, tx: hash });
    });

  /**
   * Sells native MON straight out of the trading wallet for this market's
   * quote token — a REAL on-chain sell (same mechanics as closing a
   * position), not tied to one. For a wallet that only holds MON, this is
   * what turns some of it into spendable {quote.symbol} for a first real buy.
   */
  const sellMon = () =>
    run("sell-mon", async () => {
      const size = Number(fundAmount);
      if (!size || size <= 0) throw new Error("Enter a MON amount to sell.");
      const result = await api.sellForQuote(await getAccessToken(), strategyId, { wallet, size });
      setNotice({
        tone: "ok",
        text: `Sold ${result.size.toFixed(4)} MON for ${result.quoteReceived.toFixed(2)} ${view?.quote.symbol ?? "quote"} at avg ${result.averagePrice.toFixed(4)}.`,
        tx: result.txHash,
      });
    });

  /**
   * Places a REAL GTC limit sell — confirmed on-chain the moment it's
   * placed, regardless of whether the book has a bid to match it against.
   * Use this when "Sell MON → quote" refuses with "no live bids": a limit
   * order just rests, same as a maker order on any exchange.
   */
  const limitSell = () =>
    run("limit-sell", async () => {
      const size = Number(fundAmount);
      const price = Number(limitPrice);
      if (!size || size <= 0) throw new Error("Enter a MON amount to sell.");
      if (!price || price <= 0) throw new Error("Enter a price to rest the order at.");
      const result = await api.limitSell(await getAccessToken(), strategyId, { wallet, size, price });
      setNotice({
        tone: "ok",
        text: `Placed a real limit sell: ${result.size.toFixed(4)} MON at ${result.price}. Resting on-chain until matched.`,
        tx: result.txHash,
      });
    });

  const testGuardrail = () =>
    run("guardrail", async () => {
      const result = await api.guardrailTest(await getAccessToken(), strategyId, wallet);
      setNotice(
        result.refused
          ? { tone: "ok", text: `Privy refused to sign an over-cap trade: ${result.message}` }
          : { tone: "warn", text: result.message, tx: result.txHash },
      );
    });

  const withdraw = () =>
    run("withdraw", async () => {
      const result = await api.withdraw(await getAccessToken(), strategyId, wallet);
      setNotice({
        tone: "ok",
        text: "Everything in the trading wallet was sent back to your wallet.",
        tx: result.quoteTxHash ?? result.nativeTxHash,
      });
    });

  if (loadError) return <p className="text-xs text-danger">{loadError}</p>;
  if (!view) return <p className="text-xs text-muted-dim">Loading trading wallet…</p>;

  const button =
    "rounded-sm border border-border-strong bg-white/5 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-white/10 disabled:opacity-50";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-bg-elevated p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Your trading wallet</p>
          <p className="text-xs text-muted-dim">
            A Privy wallet that holds only what you move into it. It can buy on this Kuru market or send funds back
            to you — Privy refuses to sign anything else.
          </p>
          <button
            onClick={() => navigator.clipboard?.writeText(view.address)}
            className="mt-1 font-mono-nums text-xs text-accent hover:underline"
            title="Copy address"
          >
            {shortAddress(view.address)} ⧉
          </button>
        </div>
        <div className="flex gap-5 text-right">
          <div>
            <div className="text-xs text-muted-dim">{view.quote.symbol}</div>
            <div className="font-mono-nums text-lg">{view.quote.balance.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-dim">MON (gas)</div>
            <div className="font-mono-nums text-lg">{view.native.balance.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            inputMode="decimal"
            className="w-24 rounded-sm border border-border-strong bg-bg px-2 py-1.5 font-mono-nums text-xs outline-none focus:border-accent"
          />
          <button onClick={fundQuote} disabled={!!busy} className={button}>
            {busy === "fund" ? "Sending…" : `Add ${view.quote.symbol}`}
          </button>
          <button onClick={fundGas} disabled={!!busy} className={button}>
            {busy === "gas" ? "Sending…" : "Add 0.05 MON gas"}
          </button>
          <button onClick={sendMon} disabled={!!busy} className={button}>
            {busy === "send-mon" ? "Sending…" : "Send MON"}
          </button>
          <button
            onClick={sellMon}
            disabled={!!busy}
            title="Real on-chain market sell: needs a live bid to fill into. If the book is thin, use the limit sell below instead."
            className={button}
          >
            {busy === "sell-mon" ? "Selling on Kuru…" : `Sell MON → ${view.quote.symbol}`}
          </button>
          <input
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder="price"
            inputMode="decimal"
            className="w-20 rounded-sm border border-border-strong bg-bg px-2 py-1.5 font-mono-nums text-xs outline-none focus:border-accent"
          />
          <button
            onClick={limitSell}
            disabled={!!busy}
            title="Real on-chain GTC limit sell: confirms immediately whether or not it's matched, even on a book with no live bids."
            className={button}
          >
            {busy === "limit-sell" ? "Placing on Kuru…" : "Limit sell (real, any liquidity)"}
          </button>
          <button onClick={withdraw} disabled={!!busy} className={button}>
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw all"}
          </button>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-dim">Enforced by Privy at signing</p>
          {isOwner && (
            <button onClick={testGuardrail} disabled={!!busy} className={button}>
              {busy === "guardrail" ? "Asking Privy…" : "Try an over-cap trade"}
            </button>
          )}
        </div>
        <ul className="space-y-1 text-xs">
          {view.rules.map((rule) => (
            <li key={rule.name} className="flex items-center gap-2 text-muted">
              <span className="rounded-sm bg-success/10 px-1.5 py-0.5 font-mono-nums text-[10px] text-success">
                {rule.action}
              </span>
              {rule.name}
            </li>
          ))}
          <li className="flex items-center gap-2 text-muted">
            <span className="rounded-sm bg-danger/10 px-1.5 py-0.5 font-mono-nums text-[10px] text-danger">DENY</span>
            Everything else
          </li>
        </ul>
      </div>

      {notice && (
        <p
          className={`text-xs ${notice.tone === "ok" ? "text-success" : notice.tone === "warn" ? "text-warning" : "text-danger"}`}
        >
          {notice.text}
          {notice.tx && (
            <a href={`${EXPLORER_TX}${notice.tx}`} target="_blank" rel="noreferrer" className="ml-1 underline">
              view tx
            </a>
          )}
        </p>
      )}
    </div>
  );
}
