import { applyLifecycleEvent } from "@mirrorcap/strategy-engine";
import type { Strategy } from "@mirrorcap/shared-types";
import { getOrderBookForMarket } from "./orderbook.js";
import { upsertStrategy } from "./store.js";

/**
 * Advances a strategy's lifecycle using the current best ask as the "current
 * price" signal (BUY-side MVP — OVERALL.md #41 scope control), then persists
 * if it changed. Called lazily whenever a strategy is read rather than on a
 * background timer, which keeps the MVP's state transitions easy to reason
 * about and demo deterministically.
 */
export async function tickStrategy(strategy: Strategy): Promise<{ strategy: Strategy; currentPrice: number | null }> {
  if (strategy.lifecycleState === "CLOSED" || strategy.lifecycleState === "EXPIRED") {
    return { strategy, currentPrice: null };
  }

  const book = await getOrderBookForMarket(strategy.market, strategy.breakoutLevel);
  const currentPrice = book.asks[0]?.price ?? null;
  if (currentPrice === null) return { strategy, currentPrice: null };

  const nextState = applyLifecycleEvent(strategy, { type: "TICK", currentPrice, now: new Date() });
  if (nextState !== strategy.lifecycleState) {
    const updated: Strategy = { ...strategy, lifecycleState: nextState };
    upsertStrategy(updated);
    return { strategy: updated, currentPrice };
  }
  return { strategy, currentPrice };
}
