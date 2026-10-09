import { fetchSmartMoneyDexTrades, mapTradeToSupportedMarket } from "@mirrorcap/nansen-client";
import type { MarketRef, NansenSmartMoneyTrade, SmartMoneyOpportunity } from "@mirrorcap/shared-types";
import { getOrderBookForMarket } from "./orderbook.js";
import { calculateBuyCapacity } from "@mirrorcap/capacity-engine";

const SUPPORTED_MARKETS: MarketRef[] = [
  {
    marketAddress: (process.env.MONAD_TESTNET_MARKET_ADDRESS ??
      "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9") as `0x${string}`,
    symbol: "MON-USDC",
    baseToken: "0x0000000000000000000000000000000000000000",
    quoteToken: "0x0000000000000000000000000000000000000000",
    network: "monad-testnet",
  },
];

/**
 * A handful of representative Monad Smart Money trades, used ONLY when
 * NANSEN_API_KEY is not configured. Clearly labeled via `source` on the
 * caller's response — see OVERALL.md #22 on never conflating environments.
 */
function syntheticSmartMoneyTrades(): NansenSmartMoneyTrade[] {
  const now = new Date().toISOString();
  return [
    {
      chain: "monad",
      blockTimestamp: now,
      transactionHash: "0xsynthetic0000000000000000000000000000000000000000000000000001",
      traderAddress: "0x1111111111111111111111111111111111111111",
      traderAddressLabel: "Smart Trader (90D)",
      tokenBoughtAddress: "0x0000000000000000000000000000000000000000",
      tokenSoldAddress: "0x0000000000000000000000000000000000000001",
      tokenBoughtSymbol: "MON",
      tokenSoldSymbol: "USDC",
      tradeValueUsd: 42000,
    },
  ];
}

export async function getSmartMoneyOpportunities(): Promise<{
  opportunities: SmartMoneyOpportunity[];
  source: "live-nansen" | "synthetic-fallback";
}> {
  const apiKey = process.env.NANSEN_API_KEY;

  let trades: NansenSmartMoneyTrade[];
  let source: "live-nansen" | "synthetic-fallback";

  if (!apiKey) {
    trades = syntheticSmartMoneyTrades();
    source = "synthetic-fallback";
  } else {
    try {
      trades = await fetchSmartMoneyDexTrades(apiKey, {
        chains: ["monad"],
        pagination: { page: 1, per_page: 10 },
        order_by: [{ field: "trade_value_usd", direction: "DESC" }],
      });
      source = "live-nansen";
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[nansen] live request failed, falling back to synthetic:", err);
      trades = syntheticSmartMoneyTrades();
      source = "synthetic-fallback";
    }
  }

  const opportunities: SmartMoneyOpportunity[] = await Promise.all(
    trades.map(async (trade) => {
      const market = mapTradeToSupportedMarket(trade, SUPPORTED_MARKETS);
      if (!market) return { trade };

      const book = await getOrderBookForMarket(market, 1.0);
      const capacity = calculateBuyCapacity({
        side: "BUY",
        strategyEntryMin: 1.0,
        strategyEntryMax: 1.02,
        followerMaxDriftBps: 100,
        requestedNotional: 500,
        asks: book.asks,
      });

      return { trade, market, capacity };
    }),
  );

  return { opportunities, source };
}
