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

function toLevels(rows: number[][]): OrderBookLevel[] {
  return rows.map(([price, size]) => ({ price, size }));
}

/** Reads live L2 depth straight from the Kuru order book contract. */
export async function getLiveOrderBook(
  provider: ethers.providers.JsonRpcProvider,
  marketAddress: Address,
  marketParams: KuruSdk.MarketParams,
): Promise<LiveOrderBook> {
  const book = await KuruSdk.OrderBook.getL2OrderBook(provider, marketAddress, marketParams);
  return {
    asks: toLevels(book.asks),
    bids: toLevels(book.bids),
    blockNumber: book.blockNumber,
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
