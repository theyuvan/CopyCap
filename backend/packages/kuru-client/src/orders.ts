import { GTC } from "@kuru-labs/kuru-sdk";
import type * as KuruSdk from "@kuru-labs/kuru-sdk";
import { ethers, type ContractReceipt } from "ethers";
import type { Address, BoundedOrderParams, BoundedSellOrderParams } from "@mirrorcap/shared-types";

/**
 * The market-buy signature deployed Kuru order books actually expose
 * (selector 0x7c51d6cf). @kuru-labs/kuru-sdk 1.0.6 still encodes a `uint32`
 * quote size (0x64216b0f), which the deployed contracts don't have, so buys
 * are encoded here rather than through `IOC.placeMarket`.
 */
export const MARKET_BUY_ABI_FRAGMENT = {
  type: "function" as const,
  name: "placeAndExecuteMarketBuy",
  inputs: [
    { name: "_quoteSize", type: "uint96" },
    { name: "_minAmountOut", type: "uint256" },
    { name: "_isMargin", type: "bool" },
    { name: "_isFillOrKill", type: "bool" },
  ],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "payable",
};

const orderBook = new ethers.utils.Interface([MARKET_BUY_ABI_FRAGMENT]);
const erc20 = new ethers.utils.Interface([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/**
 * The market-sell signature deployed Kuru order books actually expose
 * (selector 0x532c46db) — verified on-chain against this market's
 * implementation. Unlike the buy side, this happens to match what
 * @kuru-labs/kuru-sdk 1.0.6 itself encodes, but it's encoded here directly
 * (rather than through `IOC.placeMarket`) for the same reason the buy side
 * is: one encode path, one place that's been checked against deployed bytecode.
 */
export const MARKET_SELL_ABI_FRAGMENT = {
  type: "function" as const,
  name: "placeAndExecuteMarketSell",
  inputs: [
    { name: "_size", type: "uint96" },
    { name: "_minAmountOut", type: "uint256" },
    { name: "_isMargin", type: "bool" },
    { name: "_isFillOrKill", type: "bool" },
  ],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "payable",
};

const sellOrderBook = new ethers.utils.Interface([MARKET_SELL_ABI_FRAGMENT]);

/**
 * The GTC limit-sell signature deployed Kuru order books expose. Exported
 * (param names and all) purely so `compileTradingPolicy` can scope a Privy
 * policy rule to exactly this function — the actual call is placed through
 * `placeLimitSellOrder` below, via the SDK's own (already-correct) encoding.
 */
export const LIMIT_SELL_ABI_FRAGMENT = {
  type: "function" as const,
  name: "addSellOrder",
  inputs: [
    { name: "_price", type: "uint32" },
    { name: "size", type: "uint96" },
    { name: "_postOnly", type: "bool" },
  ],
  outputs: [],
  stateMutability: "nonpayable",
};

const verifiedMarkets = new Set<string>();
const verifiedSellMarkets = new Set<string>();

async function codeIncludesSelector(
  provider: ethers.providers.Provider,
  marketAddress: Address,
  selector: string,
): Promise<boolean> {
  let code = (await provider.getCode(marketAddress)).toLowerCase();
  // EIP-1967 implementation slot: Kuru markets are proxies.
  const slot = await provider.getStorageAt(
    marketAddress,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  );
  if (slot !== ethers.constants.HashZero) {
    code += (await provider.getCode(ethers.utils.getAddress(`0x${slot.slice(26)}`))).toLowerCase();
  }
  return code.includes(selector.slice(2).toLowerCase());
}

/** Fails before any gas is spent if the market (or its proxy implementation) lacks the buy function we encode. */
export async function assertMarketSupportsBuy(provider: ethers.providers.Provider, marketAddress: Address): Promise<void> {
  const key = marketAddress.toLowerCase();
  if (verifiedMarkets.has(key)) return;
  const selector = orderBook.getSighash(MARKET_BUY_ABI_FRAGMENT.name);
  if (!(await codeIncludesSelector(provider, marketAddress, selector))) {
    throw new Error(`Kuru market ${marketAddress} does not expose ${MARKET_BUY_ABI_FRAGMENT.name} (${selector}).`);
  }
  verifiedMarkets.add(key);
}

/** Fails before any gas is spent if the market (or its proxy implementation) lacks the sell function we encode. */
export async function assertMarketSupportsSell(provider: ethers.providers.Provider, marketAddress: Address): Promise<void> {
  const key = marketAddress.toLowerCase();
  if (verifiedSellMarkets.has(key)) return;
  const selector = sellOrderBook.getSighash(MARKET_SELL_ABI_FRAGMENT.name);
  if (!(await codeIncludesSelector(provider, marketAddress, selector))) {
    throw new Error(`Kuru market ${marketAddress} does not expose ${MARKET_SELL_ABI_FRAGMENT.name} (${selector}).`);
  }
  verifiedSellMarkets.add(key);
}

function decimalsOf(precision: ethers.BigNumber): number {
  return precision.toString().length - 1;
}

/** Quote amounts are encoded with both the token's decimals and the price precision; floor to the coarser. */
export function quoteAmountDecimals(marketParams: KuruSdk.MarketParams): number {
  return Math.min(marketParams.quoteAssetDecimals.toNumber(), decimalsOf(marketParams.pricePrecision));
}

/** Base (sell size) amounts are encoded with both the token's decimals and the size precision; floor to the coarser. */
export function baseAmountDecimals(marketParams: KuruSdk.MarketParams): number {
  return Math.min(marketParams.baseAssetDecimals.toNumber(), decimalsOf(marketParams.sizePrecision));
}

function floorTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // The epsilon keeps binary float error (0.29 * 100 = 28.999…) from flooring a whole unit away.
  return Math.floor(value * factor + 1e-9) / factor;
}

function toUnits(value: number, decimals: number): ethers.BigNumber {
  return ethers.utils.parseUnits(value.toFixed(decimals), decimals);
}

/** The per-trade quote cap in both on-chain encodings: the ERC-20 approve amount and the market's quote size. */
export function encodeQuoteCap(
  marketParams: KuruSdk.MarketParams,
  quoteAmount: number,
): { approveUnits: bigint; quoteSizeUnits: bigint } {
  const amount = floorTo(quoteAmount, quoteAmountDecimals(marketParams));
  return {
    approveUnits: toUnits(amount, marketParams.quoteAssetDecimals.toNumber()).toBigInt(),
    quoteSizeUnits: toUnits(amount, decimalsOf(marketParams.pricePrecision)).toBigInt(),
  };
}

/** Rounds a bounded order to encodable amounts, in the follower's favour (spend down, floor down). */
export function normalizeBoundedBuy(
  marketParams: KuruSdk.MarketParams,
  bounded: BoundedOrderParams,
): BoundedOrderParams {
  const requestedQuoteNotional = floorTo(bounded.requestedQuoteNotional, quoteAmountDecimals(marketParams));
  const baseDecimals = Math.min(marketParams.baseAssetDecimals.toNumber(), 8);
  const minAmountOut = floorTo(requestedQuoteNotional / bounded.maxPrice, baseDecimals);
  return { ...bounded, requestedQuoteNotional, minAmountOut };
}

/** SELL-side mirror of `normalizeBoundedBuy`: rounds the size down to what's encodable, floor-down protection. */
export function normalizeBoundedSell(
  marketParams: KuruSdk.MarketParams,
  bounded: BoundedSellOrderParams,
): BoundedSellOrderParams {
  const size = floorTo(bounded.size, baseAmountDecimals(marketParams));
  const minAmountOut = floorTo(size * bounded.minPrice, quoteAmountDecimals(marketParams));
  return { ...bounded, size, minAmountOut };
}

/**
 * Submits the bounded BUY built by `@mirrorcap/strategy-engine`'s
 * `buildBoundedOrderParams`: approve the exact quote amount if needed, then
 * a market buy whose `minAmountOut` is the hard price bound the order book
 * enforces itself. The buy is simulated first, so a book that has moved
 * rejects here instead of costing gas.
 */
export async function submitBoundedBuyOrder(
  signer: ethers.Signer,
  marketAddress: Address,
  marketParams: KuruSdk.MarketParams,
  bounded: BoundedOrderParams,
): Promise<ContractReceipt> {
  const provider = signer.provider;
  if (!provider) throw new Error("Signer must be connected to a provider.");
  await assertMarketSupportsBuy(provider, marketAddress);

  const owner = await signer.getAddress();
  const quoteDecimals = marketParams.quoteAssetDecimals.toNumber();
  const approveAmount = toUnits(bounded.requestedQuoteNotional, quoteDecimals);

  const allowance = ethers.BigNumber.from(
    await provider.call({
      to: marketParams.quoteAssetAddress,
      data: erc20.encodeFunctionData("allowance", [owner, marketAddress]),
    }),
  );
  if (allowance.lt(approveAmount)) {
    const approval = await signer.sendTransaction({
      to: marketParams.quoteAssetAddress,
      data: erc20.encodeFunctionData("approve", [marketAddress, approveAmount]),
    });
    await approval.wait(1);
  }

  const data = orderBook.encodeFunctionData(MARKET_BUY_ABI_FRAGMENT.name, [
    toUnits(bounded.requestedQuoteNotional, decimalsOf(marketParams.pricePrecision)),
    ethers.utils.parseUnits(
      bounded.minAmountOut.toFixed(Math.min(marketParams.baseAssetDecimals.toNumber(), 8)),
      marketParams.baseAssetDecimals,
    ),
    false,
    bounded.fillOrKill,
  ]);

  let gasLimit: ethers.BigNumber;
  try {
    gasLimit = await provider.estimateGas({ from: owner, to: marketAddress, data });
  } catch (err) {
    const reason = (err as { reason?: string; error?: { message?: string } }).reason ?? (err as Error).message;
    throw new Error(`Kuru would reject this order (simulated before sending): ${reason}`);
  }

  const tx = await signer.sendTransaction({ to: marketAddress, data, gasLimit: gasLimit.mul(12).div(10) });
  return tx.wait(1);
}

/**
 * Submits the bounded SELL built by `@mirrorcap/strategy-engine`'s
 * `buildBoundedSellOrderParams`: a market sell whose `minAmountOut` is the
 * hard price-floor bound the order book enforces itself. This market's base
 * asset is the native token, so the sold amount travels as `value` on the
 * call itself rather than an ERC-20 transfer — there is no approve step.
 * Simulated first, so a book that has moved rejects here instead of costing gas.
 */
export async function submitBoundedSellOrder(
  signer: ethers.Signer,
  marketAddress: Address,
  marketParams: KuruSdk.MarketParams,
  bounded: BoundedSellOrderParams,
): Promise<ContractReceipt> {
  const provider = signer.provider;
  if (!provider) throw new Error("Signer must be connected to a provider.");
  if (marketParams.baseAssetAddress !== ethers.constants.AddressZero) {
    throw new Error("submitBoundedSellOrder only supports markets whose base asset is the native token.");
  }
  await assertMarketSupportsSell(provider, marketAddress);

  const owner = await signer.getAddress();
  const baseDecimals = marketParams.baseAssetDecimals.toNumber();
  // What actually moves: the full-precision native amount being sold, sent as msg.value.
  const nativeValue = toUnits(bounded.size, baseDecimals);
  // The uint96 order-book parameter, encoded at the market's (coarser) size precision.
  const encodedSize = toUnits(bounded.size, decimalsOf(marketParams.sizePrecision));
  const minAmountOutUnits = toUnits(bounded.minAmountOut, marketParams.quoteAssetDecimals.toNumber());

  const data = sellOrderBook.encodeFunctionData(MARKET_SELL_ABI_FRAGMENT.name, [
    encodedSize,
    minAmountOutUnits,
    false,
    bounded.fillOrKill,
  ]);

  let gasLimit: ethers.BigNumber;
  try {
    gasLimit = await provider.estimateGas({ from: owner, to: marketAddress, data, value: nativeValue });
  } catch (err) {
    const reason = (err as { reason?: string; error?: { message?: string } }).reason ?? (err as Error).message;
    throw new Error(`Kuru would reject this order (simulated before sending): ${reason}`);
  }

  const tx = await signer.sendTransaction({
    to: marketAddress,
    data,
    value: nativeValue,
    gasLimit: gasLimit.mul(12).div(10),
  });
  return tx.wait(1);
}

/**
 * Places a real GTC limit sell — a resting maker order, confirmed on-chain
 * the moment it's placed, independent of whether it's ever matched. Unlike
 * `submitBoundedSellOrder` (an IOC market sell, which needs live bid depth
 * to fill), this succeeds even when the book's other side is empty: it just
 * rests there, same as any maker order. `@kuru-labs/kuru-sdk`'s own
 * `addSellOrder(uint32,uint96,bool)` encoding is used as-is here — unlike
 * the market-buy path, this one does match what's deployed.
 */
export async function placeLimitSellOrder(
  signer: ethers.Signer,
  marketAddress: Address,
  marketParams: KuruSdk.MarketParams,
  order: { price: number; size: number; postOnly?: boolean },
): Promise<ContractReceipt> {
  return GTC.placeLimit(signer, marketAddress, marketParams, {
    price: order.price,
    size: order.size,
    isBuy: false,
    postOnly: order.postOnly ?? false,
  });
}
