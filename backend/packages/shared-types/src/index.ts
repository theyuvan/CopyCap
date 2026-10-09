// Shared domain types for MirrorCap.
// Kept deliberately offchain/simple for the MVP (see OVERALL.md #26-#30, #34).

export type Address = `0x${string}`;

/**
 * Only MOMENTUM_BREAKOUT is implemented for the MVP. The field exists so the
 * capacity/strategy engines stay extensible without diluting the demo.
 */
export type StrategyType = "MOMENTUM_BREAKOUT";

export type StrategyLifecycleState =
  | "WAITING_FOR_ENTRY"
  | "ENTRY_ACTIVE"
  | "POSITION_ACTIVE"
  | "EXIT_ACTIVE"
  | "CLOSED"
  | "EXPIRED"; // entry window closed with no entry executed

export type CopyStatus =
  | "WAITING"
  | "COPYABLE"
  | "LIMITED_CAPACITY"
  | "DEGRADING"
  | "OUTSIDE_POLICY"
  | "EXPIRED"
  | "EXIT_ACTIVE";

export interface MarketRef {
  /** Kuru market/orderbook contract address */
  marketAddress: Address;
  /** Human label, e.g. "MON-USDC" */
  symbol: string;
  baseToken: Address;
  quoteToken: Address;
  /** "mainnet" | "testnet" so UI/README never conflate environments */
  network: "monad-mainnet" | "monad-testnet";
}

export interface Strategy {
  id: string;
  creator: Address;
  market: MarketRef;
  strategyType: StrategyType;
  breakoutLevel: number;
  entryMin: number;
  entryMax: number;
  targetMin?: number;
  targetMax?: number;
  stopLevel?: number;
  /** ISO timestamp. After this, no new entries are taken even if price re-enters the range. */
  entryExpiresAt: string;
  /** ISO timestamp. Overall strategy validity; independent from open-position duration. */
  strategyExpiresAt?: string;
  description?: string;
  maxStrategyNotional?: number;
  createdAt: string;
  lifecycleState: StrategyLifecycleState;
}

export interface FollowerPolicy {
  wallet: Address;
  strategyId: string;
  maxTradeNotional: number;
  maxDailyOutflow: number;
  /** Max acceptable execution deviation from strategy entryMax, in basis points. */
  maxDriftBps: number;
  allowPartialFill: boolean;
  autoExecute: boolean;
  followedKolAt: string;
  /** Set when the follower unfollows the KOL; stops NEW strategies, not open positions. */
  unfollowedAt?: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export type Side = "BUY" | "SELL";

export interface CapacityInput {
  side: Side;
  strategyEntryMin: number;
  strategyEntryMax: number;
  followerMaxDriftBps: number;
  requestedNotional: number;
  /** Live ask levels, ascending by price. Required for BUY. */
  asks: OrderBookLevel[];
  /** Live bid levels, descending by price. Required for SELL (phase 2). */
  bids?: OrderBookLevel[];
}

export interface CapacityResult {
  side: Side;
  /** The stricter of (strategy max, follower effective max given drift). */
  effectiveMaxPrice: number;
  /** Weighted-average price the requested notional would clear at, bounded by effectiveMaxPrice. */
  expectedAveragePrice: number | null;
  /** Deviation of expectedAveragePrice from strategyEntryMax, in bps. Null if no liquidity. */
  expectedDeviationBps: number | null;
  /** Total notional reproducible inside effectiveMaxPrice across the book (follower-specific ceiling). */
  reproducibleCapacityNotional: number;
  /** Can the requested notional be fully filled inside effectiveMaxPrice? */
  canFullyExecute: boolean;
  /** Portion of requestedNotional that IS reproducible inside the bound (<= requestedNotional). */
  executableNotional: number;
  status: CopyStatus;
  reason: string;
  levelsConsumed: number;
}

export type ExecutionMode = "FOK" | "IOC";

export interface BoundedOrderParams {
  marketAddress: Address;
  isBuy: true;
  /** Quote notional requested by follower, pre-bound. */
  requestedQuoteNotional: number;
  /** Hard price ceiling — never silently widened. */
  maxPrice: number;
  /** Base-asset amount expected at maxPrice, used as minAmountOut for IOC. */
  minAmountOut: number;
  mode: ExecutionMode;
  fillOrKill: boolean;
}

export interface Position {
  id: string;
  strategyId: string;
  follower: Address;
  entryExecutedAt: string;
  entryAvgPrice: number;
  baseAmount: number;
  quoteSpent: number;
  state: StrategyLifecycleState;
  exitExecutedAt?: string;
  exitAvgPrice?: number;
  quoteReceived?: number;
  realizedPnlQuote?: number;
  leaderFeeQuote?: number;
}

export interface NansenSmartMoneyTrade {
  chain: string;
  blockTimestamp: string;
  transactionHash: string;
  traderAddress: Address;
  traderAddressLabel: string;
  tokenBoughtAddress: Address;
  tokenSoldAddress: Address;
  tokenBoughtSymbol: string;
  tokenSoldSymbol: string;
  tokenBoughtAgeDays?: number;
  tokenSoldAgeDays?: number;
  tradeValueUsd?: number;
}

export interface SmartMoneyOpportunity {
  trade: NansenSmartMoneyTrade;
  /** Kuru market this token maps to, if any supported market exists. */
  market?: MarketRef;
  /** Set once capacity has been evaluated against the mapped Kuru market. */
  capacity?: CapacityResult;
}
