"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { api } from "@/lib/api";

// The only real, live Kuru market this project has (verified — see
// backend/scripts/check-mainnet-markets.ts). Not user-selectable: letting
// someone type an arbitrary market would create a strategy Kuru can't
// actually price or execute.
const MARKET = {
  marketAddress: "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9",
  symbol: "MON-USDC",
  baseToken: "0x0000000000000000000000000000000000000000",
  quoteToken: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570",
  network: "monad-testnet" as const,
};

function toIso(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

export function CreateStrategyForm() {
  const { address, connect, getAccessToken } = useWallet();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address) {
      setError("Sign in first — your wallet becomes this strategy's leader.");
      return;
    }
    const form = new FormData(e.currentTarget);
    const entryMin = Number(form.get("entryMin"));
    const entryMax = Number(form.get("entryMax"));
    const breakoutLevel = form.get("breakoutLevel") ? Number(form.get("breakoutLevel")) : undefined;
    const targetMin = form.get("targetMin") ? Number(form.get("targetMin")) : undefined;
    const targetMax = form.get("targetMax") ? Number(form.get("targetMax")) : undefined;
    const stopLevel = form.get("stopLevel") ? Number(form.get("stopLevel")) : undefined;
    const maxStrategyNotional = form.get("maxStrategyNotional") ? Number(form.get("maxStrategyNotional")) : undefined;
    const maxFollowers = form.get("maxFollowers") ? Number(form.get("maxFollowers")) : undefined;
    const entryExpiresAt = form.get("entryExpiresAt") as string;
    const strategyExpiresAtRaw = form.get("strategyExpiresAt") as string;
    const description = (form.get("description") as string) || undefined;

    if (entryMin >= entryMax) {
      setError("Entry max must be greater than entry min.");
      return;
    }
    if (!entryExpiresAt) {
      setError("Entry expiry is required — every strategy needs its own entry-validity window.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const strategy = await api.createStrategy(await getAccessToken(), {
        creator: address,
        market: MARKET,
        breakoutLevel,
        entryMin,
        entryMax,
        targetMin,
        targetMax,
        stopLevel,
        entryExpiresAt: toIso(entryExpiresAt),
        strategyExpiresAt: strategyExpiresAtRaw ? toIso(strategyExpiresAtRaw) : undefined,
        description,
        maxStrategyNotional,
        maxFollowers,
      });
      router.push(`/strategies/${strategy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create strategy.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border border-border bg-panel p-5">
        <h2 className="mb-1 text-sm font-semibold">Leader</h2>
        {address ? (
          <p className="font-mono-nums text-xs text-muted">
            Strategies you create will be attributed to <span className="text-accent">{address}</span>.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Sign in — your wallet becomes this strategy's leader address.</p>
            <button
              type="button"
              onClick={connect}
              className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        <h2 className="mb-1 text-sm font-semibold">Market</h2>
        <p className="text-xs text-muted">
          <span className="font-mono-nums text-ink">{MARKET.symbol}</span> · {MARKET.network.replace("monad-", "")} —
          the only live Kuru market this build has real order-book depth for, so it's fixed rather than freely typed.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        <h2 className="mb-4 text-sm font-semibold">Setup</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Breakout level" name="breakoutLevel" step="0.0001" placeholder="defaults to entry min" />
          <Field label="Entry min *" name="entryMin" step="0.0001" required />
          <Field label="Entry max *" name="entryMax" step="0.0001" required />
          <Field label="Target min" name="targetMin" step="0.0001" />
          <Field label="Target max" name="targetMax" step="0.0001" />
          <Field label="Stop level" name="stopLevel" step="0.0001" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        <h2 className="mb-4 text-sm font-semibold">Windows &amp; limits</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Entry expires at *</span>
            <input
              type="datetime-local"
              name="entryExpiresAt"
              required
              className="rounded-sm border border-border-strong bg-bg px-3 py-2 font-mono-nums text-xs outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Strategy expires at</span>
            <input
              type="datetime-local"
              name="strategyExpiresAt"
              className="rounded-sm border border-border-strong bg-bg px-3 py-2 font-mono-nums text-xs outline-none focus:border-accent"
            />
          </label>
          <Field label="Max strategy notional" name="maxStrategyNotional" step="1" placeholder="unbounded" />
          <Field label="Max followers" name="maxFollowers" step="1" placeholder="uncapped" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Description</span>
          <textarea
            name="description"
            rows={3}
            placeholder="What's the setup — why this breakout, why this target/stop?"
            className="rounded-sm border border-border-strong bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-sm bg-accent py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Posting…" : "Post strategy"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  step,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  step?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        name={name}
        step={step}
        required={required}
        placeholder={placeholder}
        className="rounded-sm border border-border-strong bg-bg px-3 py-2 font-mono-nums text-xs outline-none focus:border-accent"
      />
    </label>
  );
}
