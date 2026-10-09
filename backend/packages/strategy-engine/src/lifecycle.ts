import type { Strategy, StrategyLifecycleState } from "@mirrorcap/shared-types";

export function isEntryWindowOpen(strategy: Strategy, now: Date): boolean {
  return now.getTime() <= new Date(strategy.entryExpiresAt).getTime();
}

export function isStrategyExpired(strategy: Strategy, now: Date): boolean {
  if (!strategy.strategyExpiresAt) return false;
  return now.getTime() > new Date(strategy.strategyExpiresAt).getTime();
}

export function isWithinEntryRange(strategy: Strategy, currentPrice: number): boolean {
  return currentPrice >= strategy.entryMin && currentPrice <= strategy.entryMax;
}

export function isExitConditionMet(strategy: Strategy, currentPrice: number): boolean {
  const hitTarget = strategy.targetMin !== undefined && currentPrice >= strategy.targetMin;
  const hitStop = strategy.stopLevel !== undefined && currentPrice <= strategy.stopLevel;
  return hitTarget || hitStop;
}

export type LifecycleEvent =
  | { type: "TICK"; currentPrice: number; now: Date }
  | { type: "ENTRY_EXECUTED" }
  | { type: "EXIT_CONDITION_MET" }
  | { type: "MANUAL_CLOSE" };

/**
 * Pure state-machine transition for the strategy-level (aggregate) lifecycle.
 *
 * Deliberately event-driven rather than re-derived purely from price: whether
 * an entry or exit actually EXECUTED is an action that happened (a trade),
 * not something price alone implies — see OVERALL.md #34. Price/time only
 * drive the WAITING_FOR_ENTRY -> ENTRY_ACTIVE and -> EXPIRED edges.
 */
export function applyLifecycleEvent(
  strategy: Strategy,
  event: LifecycleEvent,
): StrategyLifecycleState {
  const state = strategy.lifecycleState;

  // Terminal states never move.
  if (state === "CLOSED" || state === "EXPIRED") return state;

  switch (event.type) {
    case "TICK": {
      if (state === "WAITING_FOR_ENTRY") {
        if (!isEntryWindowOpen(strategy, event.now)) return "EXPIRED";
        if (isWithinEntryRange(strategy, event.currentPrice)) return "ENTRY_ACTIVE";
        return "WAITING_FOR_ENTRY";
      }
      if (state === "ENTRY_ACTIVE") {
        // Never auto-enter after the window closes (OVERALL.md #34 rule 1).
        if (!isEntryWindowOpen(strategy, event.now)) return "EXPIRED";
        return "ENTRY_ACTIVE";
      }
      if (state === "POSITION_ACTIVE") {
        if (isExitConditionMet(strategy, event.currentPrice)) return "EXIT_ACTIVE";
        return "POSITION_ACTIVE";
      }
      return state;
    }
    case "ENTRY_EXECUTED": {
      // A real entry executed -> the position now outlives the entry window.
      if (state === "ENTRY_ACTIVE" || state === "WAITING_FOR_ENTRY") return "POSITION_ACTIVE";
      return state;
    }
    case "EXIT_CONDITION_MET": {
      if (state === "POSITION_ACTIVE") return "EXIT_ACTIVE";
      return state;
    }
    case "MANUAL_CLOSE": {
      // Only an explicit action can close — strategies never invent a market
      // exit on expiry (OVERALL.md #34 rule E).
      if (state === "POSITION_ACTIVE" || state === "EXIT_ACTIVE") return "CLOSED";
      return state;
    }
    default:
      return state;
  }
}
