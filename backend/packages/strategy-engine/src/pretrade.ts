import { calculateBuyCapacity } from "@mirrorcap/capacity-engine";
import type {
  CapacityResult,
  CopyStatus,
  FollowerPolicy,
  OrderBookLevel,
  Strategy,
} from "@mirrorcap/shared-types";
import { isEntryWindowOpen, isWithinEntryRange } from "./lifecycle.js";

export interface ConditionCheck {
  valid: boolean;
  reason: string;
}

/** Layer 1 of the final execution condition (OVERALL.md #9): is the KOL strategy itself still valid? */
export function checkKolStrategyCondition(
  strategy: Strategy,
  currentPrice: number,
  now: Date,
): ConditionCheck {
  if (strategy.lifecycleState === "CLOSED") {
    return { valid: false, reason: "Strategy is closed." };
  }
  if (strategy.lifecycleState === "EXPIRED") {
    return { valid: false, reason: "Strategy entry window has expired; no auto-entry allowed." };
  }
  if (!isEntryWindowOpen(strategy, now)) {
    return { valid: false, reason: "Entry window has expired; the original thesis may no longer hold." };
  }
  if (strategy.stopLevel !== undefined && currentPrice <= strategy.stopLevel) {
    return { valid: false, reason: "Price has breached the strategy stop level; thesis invalidated." };
  }
  if (!isWithinEntryRange(strategy, currentPrice)) {
    return {
      valid: false,
      reason: `Current price ${currentPrice} is outside the KOL's entry range [${strategy.entryMin}, ${strategy.entryMax}].`,
    };
  }
  return { valid: true, reason: "KOL strategy condition satisfied." };
}

/** Layer 2: is the follower's own risk configuration still valid for this request? */
export function checkFollowerRiskCondition(
  follower: FollowerPolicy,
  requestedNotional: number,
  dailyOutflowSoFarQuote: number,
): ConditionCheck & { clampedNotional: number } {
  if (follower.unfollowedAt) {
    return {
      valid: false,
      reason: "Follower has unfollowed this KOL; no new strategies are considered.",
      clampedNotional: 0,
    };
  }
  if (requestedNotional <= 0) {
    return { valid: false, reason: "Requested notional must be positive.", clampedNotional: 0 };
  }

  const clampedNotional = Math.min(requestedNotional, follower.maxTradeNotional);

  if (dailyOutflowSoFarQuote + clampedNotional > follower.maxDailyOutflow) {
    const remaining = Math.max(0, follower.maxDailyOutflow - dailyOutflowSoFarQuote);
    if (remaining <= 0) {
      return {
        valid: false,
        reason: "Daily outflow cap already reached for this follower.",
        clampedNotional: 0,
      };
    }
    return {
      valid: true,
      reason: `Clamped to remaining daily outflow cap (${remaining.toFixed(2)}).`,
      clampedNotional: remaining,
    };
  }

  return { valid: true, reason: "Follower risk condition satisfied.", clampedNotional };
}

export interface CopyEvaluation {
  status: CopyStatus;
  reason: string;
  kolCondition: ConditionCheck;
  followerCondition: ConditionCheck & { clampedNotional: number };
  capacity?: CapacityResult;
}

/**
 * Composes layers 1-3 of the final execution condition (OVERALL.md #9).
 * Layer 4 (Agent Wallet policy / signing / MFA) is intentionally external —
 * it happens inside the agent-plugin's wallet-submit path, never here.
 */
export function evaluateCopyability(params: {
  strategy: Strategy;
  follower: FollowerPolicy;
  currentPrice: number;
  now: Date;
  requestedNotional: number;
  dailyOutflowSoFarQuote: number;
  asks: OrderBookLevel[];
}): CopyEvaluation {
  const { strategy, follower, currentPrice, now, requestedNotional, dailyOutflowSoFarQuote, asks } =
    params;

  if (strategy.lifecycleState === "WAITING_FOR_ENTRY") {
    return {
      status: "WAITING",
      reason: "Breakout has not yet occurred; price has not entered the KOL's entry range.",
      kolCondition: { valid: false, reason: "Not yet in entry range." },
      followerCondition: { valid: true, reason: "Not evaluated.", clampedNotional: 0 },
    };
  }
  if (strategy.lifecycleState === "EXPIRED") {
    return {
      status: "EXPIRED",
      reason: "Entry window has expired; this strategy can no longer be auto-entered.",
      kolCondition: { valid: false, reason: "Entry window expired." },
      followerCondition: { valid: true, reason: "Not evaluated.", clampedNotional: 0 },
    };
  }
  if (strategy.lifecycleState === "POSITION_ACTIVE" || strategy.lifecycleState === "EXIT_ACTIVE") {
    return {
      status: "EXIT_ACTIVE",
      reason: "Position already entered; this is now an exit-management decision, not a new entry.",
      kolCondition: { valid: false, reason: "Not an entry decision." },
      followerCondition: { valid: true, reason: "Not evaluated.", clampedNotional: 0 },
    };
  }
  if (strategy.lifecycleState === "CLOSED") {
    return {
      status: "EXPIRED",
      reason: "Strategy is closed.",
      kolCondition: { valid: false, reason: "Strategy closed." },
      followerCondition: { valid: true, reason: "Not evaluated.", clampedNotional: 0 },
    };
  }

  const kolCondition = checkKolStrategyCondition(strategy, currentPrice, now);
  if (!kolCondition.valid) {
    return {
      status: "OUTSIDE_POLICY",
      reason: kolCondition.reason,
      kolCondition,
      followerCondition: { valid: true, reason: "Not evaluated.", clampedNotional: 0 },
    };
  }

  const followerCondition = checkFollowerRiskCondition(follower, requestedNotional, dailyOutflowSoFarQuote);
  if (!followerCondition.valid) {
    return {
      status: "OUTSIDE_POLICY",
      reason: followerCondition.reason,
      kolCondition,
      followerCondition,
    };
  }

  const capacity = calculateBuyCapacity({
    side: "BUY",
    strategyEntryMin: strategy.entryMin,
    strategyEntryMax: strategy.entryMax,
    followerMaxDriftBps: follower.maxDriftBps,
    requestedNotional: followerCondition.clampedNotional,
    asks,
  });

  return {
    status: capacity.status,
    reason: capacity.reason,
    kolCondition,
    followerCondition,
    capacity,
  };
}
