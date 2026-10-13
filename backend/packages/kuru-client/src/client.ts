import * as KuruSdk from "@kuru-labs/kuru-sdk";
import { ethers } from "ethers";
import type { Address, OrderBookLevel } from "@mirrorcap/shared-types";

export function createProvider(rpcUrl: string): ethers.providers.JsonRpcProvider {
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

export async function getMarketParams(
  provider: ethers.providers.JsonRpcProvider,
  marketAddress: Address,
): Promise<KuruSdk.MarketParams> {
  return KuruSdk.ParamFetcher.getMarketParams(provider, marketAddress);
}

export interface LiveOrderBook {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  blockNumber: number;
}

const ORDER_BOOK_ABI = ["function getL2Book() view returns (bytes)"];

function decimalsOf(precision: ethers.BigNumber): number {
  return precision.toString().length - 1;
}

/**
 * Decodes the raw L2 book bytes the same way `@kuru-labs/kuru-sdk`'s
 * `OrderBook.getL2OrderBook` does, except entirely in `BigNumber` rather
 * than via `parseInt(hex, 16)`. The SDK's `parseInt` silently loses
 * precision on large 256-bit values, then crashes when that lossy JS
 * number is re-wrapped by `ethers.utils.formatUnits` (which rejects any
 * non-safe-integer number as an overflow). Testnet's two small resting
 * orders never hit this; a real mainnet book does.
 */
function decodeL2Book(hex: string, priceDecimals: number, sizeDecimals: number) {
  let offset = 66; // skip "0x" + the leading 32-byte block number
  const blockNumber = ethers.BigNumber.from(`0x${hex.slice(2, 66)}`).toNumber();

  function readSide(): OrderBookLevel[] {
    const levels: OrderBookLevel[] = [];
    while (offset < hex.length) {
      const price = ethers.BigNumber.from(`0x${hex.slice(offset, offset + 64)}`);
      offset += 64;
      if (price.isZero()) break;
      const size = ethers.BigNumber.from(`0x${hex.slice(offset, offset + 64)}`);
      offset += 64;
      levels.push({
        price: Number.parseFloat(ethers.utils.formatUnits(price, priceDecimals)),
        size: Number.parseFloat(ethers.utils.formatUnits(size, sizeDecimals)),
      });
    }
    return levels;
  }

  return { blockNumber, bids: readSide(), asks: readSide() };
}

/** The AMM vault's own implied price ladder, same geometric-spread model as the SDK, from already-safe BigNumbers. */
function ammVaultLevels(
  vault: KuruSdk.VaultParams,
  sizeDecimals: number,
): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  if (vault.kuruAmmVault === ethers.constants.AddressZero || vault.vaultBidOrderSize.isZero()) {
    return { bids, asks };
  }
  const spreadConstant = vault.spread.div(10);
  let bid = vault.vaultBestBid;
  let bidSize = vault.vaultBidOrderSize;
  const firstBidSize = vault.vaultBidOrderSize.sub(vault.bidPartiallyFilledSize);
  for (let i = 0; i < 300 && !bid.isZero(); i++) {
    bids.push({
      price: Number.parseFloat(ethers.utils.formatUnits(bid, 18)),
      size: Number.parseFloat(ethers.utils.formatUnits(i === 0 ? firstBidSize : bidSize, sizeDecimals)),
    });
    bid = bid.mul(1000).div(ethers.BigNumber.from(1000).add(spreadConstant));
    bidSize = bidSize.mul(ethers.BigNumber.from(2000).add(spreadConstant)).div(2000);
  }
  let ask = vault.vaultBestAsk;
  let askSize = vault.vaultAskOrderSize;
  const firstAskSize = vault.vaultAskOrderSize.sub(vault.askPartiallyFilledSize);
  for (let i = 0; i < 300 && !ask.gte(ethers.constants.MaxUint256); i++) {
    asks.push({
      price: Number.parseFloat(ethers.utils.formatUnits(ask, 18)),
      size: Number.parseFloat(ethers.utils.formatUnits(i === 0 ? firstAskSize : askSize, sizeDecimals)),
    });
    ask = ask.mul(ethers.BigNumber.from(1000).add(spreadConstant)).div(1000);
    askSize = askSize.mul(2000).div(ethers.BigNumber.from(2000).add(spreadConstant));
  }
  return { bids, asks };
}

function mergeLevels(a: OrderBookLevel[], b: OrderBookLevel[]): OrderBookLevel[] {
  const byPrice = new Map<number, number>();
  for (const { price, size } of [...a, ...b]) byPrice.set(price, (byPrice.get(price) ?? 0) + size);
  return [...byPrice.entries()].map(([price, size]) => ({ price, size }));
}

/** Reads live L2 depth (resting limit orders + the AMM vault's implied ladder) straight from the order book contract. */
export async function getLiveOrderBook(
  provider: ethers.providers.JsonRpcProvider,
  marketAddress: Address,
  marketParams: KuruSdk.MarketParams,
): Promise<LiveOrderBook> {
  const orderbook = new ethers.Contract(marketAddress, ORDER_BOOK_ABI, provider);
  const [raw, vault] = await Promise.all([
    orderbook.getL2Book({ from: ethers.constants.AddressZero }) as Promise<string>,
    KuruSdk.VaultParamFetcher.getVaultParams(provider, marketAddress),
  ]);

  const priceDecimals = decimalsOf(marketParams.pricePrecision);
  const sizeDecimals = decimalsOf(marketParams.sizePrecision);
  const resting = decodeL2Book(raw, priceDecimals, sizeDecimals);
  const vaultLevels = ammVaultLevels(vault, sizeDecimals);

  return {
    blockNumber: resting.blockNumber,
    // Callers rely on asks[0] / bids[0] being the best price.
    asks: mergeLevels(resting.asks, vaultLevels.asks).sort((a, b) => a.price - b.price),
    bids: mergeLevels(resting.bids, vaultLevels.bids).sort((a, b) => b.price - a.price),
  };
}

/** Estimates base tokens received for a given quote spend — used for UI preview, not the final bound. */
export async function estimateMarketBuy(
  provider: ethers.providers.JsonRpcProvider,
  marketAddress: Address,
  marketParams: KuruSdk.MarketParams,
  quoteAmount: number,
): Promise<number> {
  return KuruSdk.CostEstimator.estimateMarketBuy(provider, marketAddress, marketParams, quoteAmount);
}
