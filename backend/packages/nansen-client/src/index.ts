import type { Address, MarketRef, NansenSmartMoneyTrade } from "@mirrorcap/shared-types";

const NANSEN_API_BASE = "https://api.nansen.ai/api/v1";

export interface SmartMoneyDexTradesFilters {
  include_smart_money_labels?: string[];
  trade_value_usd?: { min?: number; max?: number };
  token_bought_address?: string;
  token_sold_address?: string;
}

export interface SmartMoneyDexTradesRequest {
  /** Nansen's current Monad chain slug. Re-verify against docs.nansen.ai/api/smart-money before demo. */
  chains: string[];
  filters?: SmartMoneyDexTradesFilters;
  pagination?: { page?: number; per_page?: number };
  order_by?: Array<{ field: string; direction: "ASC" | "DESC" }>;
}

interface RawSmartMoneyDexTrade {
  chain: string;
  block_timestamp: string;
  transaction_hash: string;
  trader_address: string;
  trader_address_label: string;
  token_bought_address: string;
  token_sold_address: string;
  token_bought_symbol: string;
  token_sold_symbol: string;
  token_bought_age_days?: number;
  token_sold_age_days?: number;
  trade_value_usd?: number;
}

interface RawSmartMoneyDexTradesResponse {
  data: RawSmartMoneyDexTrade[];
  pagination?: { page: number; per_page: number; is_last_page: boolean };
}

function toDomain(raw: RawSmartMoneyDexTrade): NansenSmartMoneyTrade {
  return {
    chain: raw.chain,
    blockTimestamp: raw.block_timestamp,
    transactionHash: raw.transaction_hash,
    traderAddress: raw.trader_address as Address,
    traderAddressLabel: raw.trader_address_label,
    tokenBoughtAddress: raw.token_bought_address as Address,
    tokenSoldAddress: raw.token_sold_address as Address,
    tokenBoughtSymbol: raw.token_bought_symbol,
    tokenSoldSymbol: raw.token_sold_symbol,
    tokenBoughtAgeDays: raw.token_bought_age_days,
    tokenSoldAgeDays: raw.token_sold_age_days,
    tradeValueUsd: raw.trade_value_usd,
  };
}

/**
 * Smart Money DEX Trades — the primary opportunity-discovery call
 * (OVERALL.md #20, #23). NOTE: Nansen only indexes the trailing 24 hours for
 * this endpoint; there is no date-range parameter. Never claim a longer
 * window in the UI.
 */
export async function fetchSmartMoneyDexTrades(
  apiKey: string,
  request: SmartMoneyDexTradesRequest,
): Promise<NansenSmartMoneyTrade[]> {
  const response = await fetch(`${NANSEN_API_BASE}/smart-money/dex-trades`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Nansen dex-trades request failed (${response.status}): ${body}`);
  }

  const parsed = (await response.json()) as RawSmartMoneyDexTradesResponse;
  return parsed.data.map(toDomain);
}

/**
 * Maps a Smart Money trade's bought token to a Kuru market this product
 * supports. Nansen surfaces WHICH opportunity to look at; this is the first
 * step of turning that into something MirrorCap can actually evaluate
 * (OVERALL.md #20) — a signal with no supported market is opportunity
 * discovery only, not actionable here.
 */
export function mapTradeToSupportedMarket(
  trade: NansenSmartMoneyTrade,
  supportedMarkets: MarketRef[],
): MarketRef | undefined {
  return supportedMarkets.find(
    (market) => market.symbol.split("-")[0].toUpperCase() === trade.tokenBoughtSymbol.toUpperCase(),
  );
}
