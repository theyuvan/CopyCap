import * as KuruSdk from "@kuru-labs/kuru-sdk";
import type { ContractReceipt, ethers } from "ethers";
import type { Address, BoundedOrderParams } from "@mirrorcap/shared-types";

/**
 * Submits the bounded BUY order built by `@mirrorcap/strategy-engine`'s
 * `buildBoundedOrderParams`. `size` is the quote notional to spend;
 * `minAmountOut` is the minimum base received — this is the hard contract-
 * level price bound (OVERALL.md #15): if the market has moved, the contract
 * itself rejects (fillOrKill) or partially fills (IOC), it never silently
 * executes at a worse price than the follower configured.
 */
export async function submitBoundedBuyOrder(
  signer: ethers.Signer,
  marketAddress: Address,
  marketParams: KuruSdk.MarketParams,
  bounded: BoundedOrderParams,
): Promise<ContractReceipt> {
  return KuruSdk.IOC.placeMarket(signer, marketAddress, marketParams, {
    approveTokens: true,
    isBuy: true,
    size: bounded.requestedQuoteNotional,
    minAmountOut: bounded.minAmountOut,
    isMargin: false,
    fillOrKill: bounded.fillOrKill,
  });
}
