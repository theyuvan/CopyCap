import type {
  CapacityInput,
  CapacityResult,
  OrderBookLevel,
  SellCapacityInput,
  SellCapacityResult,
} from "@mirrorcap/shared-types";

/**
 * Reproducible Capacity — the BUY-side algorithm.
 *
 * Design choices made explicit (the product spec describes the steps but not
 * the exact numeric formula, so these are pinned down here and covered by
 * tests rather than left implicit):
 *
 * - referencePrice = strategyEntryMin (the KOL's most favorable/"ideal" entry
 *   boundary). Both the follower's drift tolerance and the reported
 *   deviation are measured from this anchor.
 * - followerBoundPrice = referencePrice * (1 + maxDriftBps / 10000)
 * - effectiveMaxPrice = min(strategyEntryMax, followerBoundPrice)
 *     -> "use the stricter limit between KOL strategy maximum and follower
 *        execution deviation" (OVERALL.md #28).
 * - reproducibleCapacityNotional = total notional fillable across the book
 *   at prices <= effectiveMaxPrice. This is follower-specific because
 *   effectiveMaxPrice is follower-specific; it is NOT a universal number.
 * - expectedAveragePrice / expectedDeviationBps are computed over only the
 *   levels needed to fill min(requestedNotional, reproducibleCapacityNotional)
 *   — i.e. what THIS follower's requested size would actually pay, not the
 *   whole book's average.
 * - DEGRADING vs COPYABLE: if the fill is fully reproducible but consumes
 *   more than DEGRADING_USAGE_RATIO of the allowed drift budget, we still
 *   allow it but flag it as degrading quality rather than clean.
 */

const DEGRADING_USAGE_RATIO = 0.6;

export function calculateEffectiveMaxPrice(
  strategyEntryMin: number,
  strategyEntryMax: number,
  followerMaxDriftBps: number,
): number {
  const referencePrice = strategyEntryMin;
  const followerBoundPrice = referencePrice * (1 + followerMaxDriftBps / 10000);
  return Math.min(strategyEntryMax, followerBoundPrice);
}

interface WalkResult {
  filledNotional: number;
  filledBase: number;
  levelsConsumed: number;
}

/** Walks ascending asks, only counting liquidity at or below `maxPrice`, up to `capNotional`. */
function walkAsks(asks: OrderBookLevel[], maxPrice: number, capNotional: number): WalkResult {
  let filledNotional = 0;
  let filledBase = 0;
  let levelsConsumed = 0;

  const PRICE_EPSILON = 1e-9;
  for (const level of asks) {
    if (level.price > maxPrice + PRICE_EPSILON) break;
    if (filledNotional >= capNotional) break;

    const levelNotional = level.price * level.size;
    const remainingCap = capNotional - filledNotional;

    if (levelNotional <= remainingCap) {
      filledNotional += levelNotional;
      filledBase += level.size;
      levelsConsumed += 1;
    } else {
      // Partial consumption of this level to exactly hit the cap.
      const partialBase = remainingCap / level.price;
      filledNotional += remainingCap;
      filledBase += partialBase;
      levelsConsumed += 1;
    }
  }

  return { filledNotional, filledBase, levelsConsumed };
}

export function calculateBuyCapacity(input: CapacityInput): CapacityResult {
  const { strategyEntryMin, strategyEntryMax, followerMaxDriftBps, requestedNotional, asks } = input;

  if (strategyEntryMax < strategyEntryMin) {
    throw new Error("strategyEntryMax must be >= strategyEntryMin");
  }
  if (requestedNotional <= 0) {
    throw new Error("requestedNotional must be > 0");
  }

  const effectiveMaxPrice = calculateEffectiveMaxPrice(
    strategyEntryMin,
    strategyEntryMax,
    followerMaxDriftBps,
  );

  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

  // Total reproducible capacity across the WHOLE book inside the bound (follower-specific ceiling).
  const fullBookWalk = walkAsks(sortedAsks, effectiveMaxPrice, Number.POSITIVE_INFINITY);
  const reproducibleCapacityNotional = fullBookWalk.filledNotional;

  if (sortedAsks.length === 0 || sortedAsks[0].price > effectiveMaxPrice + 1e-9) {
    return {
      side: "BUY",
      effectiveMaxPrice,
      expectedAveragePrice: null,
      expectedDeviationBps: null,
      reproducibleCapacityNotional: 0,
      canFullyExecute: false,
      executableNotional: 0,
      status: "OUTSIDE_POLICY",
      reason:
        "No liquidity is currently available inside your effective maximum price. The market has moved beyond your configured boundary.",
      levelsConsumed: 0,
    };
  }

  // What THIS follower's requested size would actually pay.
  const requestedWalk = walkAsks(sortedAsks, effectiveMaxPrice, requestedNotional);
  const canFullyExecute = requestedWalk.filledNotional >= requestedNotional - 1e-9;
  const executableNotional = Math.min(requestedWalk.filledNotional, requestedNotional);

  const expectedAveragePrice =
    requestedWalk.filledBase > 0 ? requestedWalk.filledNotional / requestedWalk.filledBase : null;

  const referencePrice = strategyEntryMin;
  const expectedDeviationBps =
    expectedAveragePrice !== null
      ? ((expectedAveragePrice - referencePrice) / referencePrice) * 10000
      : null;

  const driftBudgetBps = ((effectiveMaxPrice - referencePrice) / referencePrice) * 10000;
  const usageRatio =
    expectedDeviationBps !== null && driftBudgetBps > 0
      ? Math.max(0, expectedDeviationBps) / driftBudgetBps
      : 0;

  let status: CapacityResult["status"];
  let reason: string;

  if (canFullyExecute) {
    if (usageRatio <= DEGRADING_USAGE_RATIO) {
      status = "COPYABLE";
      reason = "Full requested size is reproducible comfortably inside your execution boundary.";
    } else {
      status = "DEGRADING";
      reason =
        "Full requested size is reproducible, but execution would land near the edge of your allowed deviation. The opportunity is degrading.";
    }
  } else {
    status = "LIMITED_CAPACITY";
    reason = `Only ${reproducibleCapacityNotional.toFixed(2)} of your requested ${requestedNotional.toFixed(2)} is reproducible inside your effective maximum price of ${effectiveMaxPrice.toFixed(4)}.`;
  }

  return {
    side: "BUY",
    effectiveMaxPrice,
    expectedAveragePrice,
    expectedDeviationBps,
    reproducibleCapacityNotional,
    canFullyExecute,
    executableNotional,
    status,
    reason,
    levelsConsumed: requestedWalk.levelsConsumed,
  };
}

/** Builds the capacity curve used by the "capacity curve" UI widget (OVERALL.md #32). */
export function buildCapacityCurve(
  input: Omit<CapacityInput, "requestedNotional">,
  notionalPoints: number[],
): Array<{ requestedNotional: number } & CapacityResult> {
  return notionalPoints.map((requestedNotional) => ({
    requestedNotional,
    ...calculateBuyCapacity({ ...input, requestedNotional }),
  }));
}

/**
 * Reproducible Capacity — the SELL-side mirror of `calculateBuyCapacity`,
 * used when a follower closes a position with a real on-chain market sell.
 *
 * There is no KOL entry range to bound against here (closing is the
 * follower's own decision, not a copied signal), so the bound is instead the
 * follower's own `maxDriftBps` applied as slippage tolerance below the best
 * live bid at evaluation time:
 *
 * - effectiveMinPrice = referencePrice * (1 - followerMaxDriftBps / 10000)
 * - reproducibleCapacityBase = total base size fillable across the book at
 *   prices >= effectiveMinPrice.
 * - expectedAveragePrice is computed over only the levels needed to fill
 *   min(requestedSize, reproducibleCapacityBase) — what THIS follower's
 *   requested close would actually realize, not the whole book's average.
 */
export function calculateEffectiveMinPrice(referencePrice: number, followerMaxDriftBps: number): number {
  return referencePrice * (1 - followerMaxDriftBps / 10000);
}

/** Walks descending bids, only counting liquidity at or above `minPrice`, up to `capBase` base units. */
function walkBids(bids: OrderBookLevel[], minPrice: number, capBase: number): WalkResult {
  let filledNotional = 0;
  let filledBase = 0;
  let levelsConsumed = 0;

  const PRICE_EPSILON = 1e-9;
  for (const level of bids) {
    if (level.price < minPrice - PRICE_EPSILON) break;
    if (filledBase >= capBase) break;

    const remainingCap = capBase - filledBase;

    if (level.size <= remainingCap) {
      filledNotional += level.price * level.size;
      filledBase += level.size;
      levelsConsumed += 1;
    } else {
      // Partial consumption of this level to exactly hit the cap.
      filledNotional += level.price * remainingCap;
      filledBase += remainingCap;
      levelsConsumed += 1;
    }
  }

  return { filledNotional, filledBase, levelsConsumed };
}

export function calculateSellCapacity(input: SellCapacityInput): SellCapacityResult {
  const { followerMaxDriftBps, referencePrice, requestedSize, bids } = input;

  if (requestedSize <= 0) {
    throw new Error("requestedSize must be > 0");
  }

  const effectiveMinPrice = calculateEffectiveMinPrice(referencePrice, followerMaxDriftBps);
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);

  // Total reproducible capacity across the WHOLE book inside the bound (follower-specific floor).
  const fullBookWalk = walkBids(sortedBids, effectiveMinPrice, Number.POSITIVE_INFINITY);
  const reproducibleCapacityBase = fullBookWalk.filledBase;

  if (sortedBids.length === 0 || sortedBids[0].price < effectiveMinPrice - 1e-9) {
    return {
      side: "SELL",
      effectiveMinPrice,
      expectedAveragePrice: null,
      expectedDeviationBps: null,
      reproducibleCapacityBase: 0,
      canFullyExecute: false,
      executableSize: 0,
      status: "OUTSIDE_POLICY",
      reason:
        "No bids are currently available inside your effective minimum price. The market has moved beyond your configured slippage tolerance.",
      levelsConsumed: 0,
    };
  }

  // What THIS follower's requested close would actually realize.
  const requestedWalk = walkBids(sortedBids, effectiveMinPrice, requestedSize);
  const canFullyExecute = requestedWalk.filledBase >= requestedSize - 1e-9;
  const executableSize = Math.min(requestedWalk.filledBase, requestedSize);

  const expectedAveragePrice =
    requestedWalk.filledBase > 0 ? requestedWalk.filledNotional / requestedWalk.filledBase : null;

  const expectedDeviationBps =
    expectedAveragePrice !== null ? ((referencePrice - expectedAveragePrice) / referencePrice) * 10000 : null;

  const driftBudgetBps = ((referencePrice - effectiveMinPrice) / referencePrice) * 10000;
  const usageRatio =
    expectedDeviationBps !== null && driftBudgetBps > 0
      ? Math.max(0, expectedDeviationBps) / driftBudgetBps
      : 0;

  let status: SellCapacityResult["status"];
  let reason: string;

  if (canFullyExecute) {
    if (usageRatio <= DEGRADING_USAGE_RATIO) {
      status = "COPYABLE";
      reason = "Full requested size can be sold comfortably inside your slippage tolerance.";
    } else {
      status = "DEGRADING";
      reason =
        "Full requested size can be sold, but execution would land near the edge of your allowed slippage. The opportunity is degrading.";
    }
  } else {
    status = "LIMITED_CAPACITY";
    reason = `Only ${reproducibleCapacityBase.toFixed(6)} of your requested ${requestedSize.toFixed(6)} MON is reproducible inside your effective minimum price of ${effectiveMinPrice.toFixed(6)}.`;
  }

  return {
    side: "SELL",
    effectiveMinPrice,
    expectedAveragePrice,
    expectedDeviationBps,
    reproducibleCapacityBase,
    canFullyExecute,
    executableSize,
    status,
    reason,
    levelsConsumed: requestedWalk.levelsConsumed,
  };
}
