import type { Address, BoundedOrderParams, CapacityResult, FollowerPolicy } from "@mirrorcap/shared-types";

/**
 * Turns a CapacityResult into the bounded order parameters that will be
 * handed to the Kuru SDK. This never widens the follower's tolerance:
 * maxPrice is always `capacity.effectiveMaxPrice`, and the order mode
 * follows the follower's own partial-fill preference (OVERALL.md #14).
 *
 * The displayed Reproducible Capacity is an estimate, not a reservation
 * (OVERALL.md #15) — the hard protection is this maxPrice/minAmountOut
 * bound enforced by the Kuru contract itself at submission time.
 */
export function buildBoundedOrderParams(
  capacity: CapacityResult,
  marketAddress: Address,
  follower: Pick<FollowerPolicy, "allowPartialFill">,
): BoundedOrderParams {
  if (!capacity.expectedAveragePrice) {
    throw new Error("Cannot build an order: no reproducible capacity inside the effective bound.");
  }

  const requestedQuoteNotional = capacity.executableNotional;
  const minAmountOut = requestedQuoteNotional / capacity.effectiveMaxPrice;

  return {
    marketAddress,
    isBuy: true,
    requestedQuoteNotional,
    maxPrice: capacity.effectiveMaxPrice,
    minAmountOut,
    mode: follower.allowPartialFill ? "IOC" : "FOK",
    fillOrKill: !follower.allowPartialFill,
  };
}
