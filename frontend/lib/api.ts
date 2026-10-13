const API_BASE = process.env.MIRRORCAP_API_URL ?? "http://localhost:4000";
// process.env.NEXT_PUBLIC_API_URL is inlined at build time, so this is the browser-safe base
// used by client components (wallet-connected actions) — server components use API_BASE above.
const CLIENT_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function clientRequest<T>(method: "GET" | "POST", path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${CLIENT_API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, code } = data as { error?: string; code?: string };
    throw new ApiError(error ?? `API ${path} failed: ${res.status}`, res.status, code);
  }
  return data as T;
}

/** POST as the signed-in Privy user. */
function post<T>(path: string, body: unknown, token: string): Promise<T> {
  return clientRequest<T>("POST", path, body, token);
}

export interface StrategySummary {
  id: string;
  creator: string;
  market: { symbol: string; network: string; marketAddress: string };
  strategyType: string;
  breakoutLevel: number;
  entryMin: number;
  entryMax: number;
  targetMin?: number;
  targetMax?: number;
  stopLevel?: number;
  entryExpiresAt: string;
  strategyExpiresAt?: string;
  description?: string;
  maxStrategyNotional?: number;
  maxFollowers?: number;
  createdAt: string;
  lifecycleState: string;
  currentPrice: number | null;
}

export interface StrategyDetail extends StrategySummary {
  positions: Array<{
    id: string;
    follower: string;
    state: string;
    entryExecutedAt: string;
    entryAvgPrice: number;
    baseAmount: number;
    quoteSpent: number;
    entryTxHash?: string;
    exitExecutedAt?: string;
    exitAvgPrice?: number;
    quoteReceived?: number;
    realizedPnlQuote?: number;
    leaderFeeQuote?: number;
    exitTxHash?: string;
  }>;
}

export interface CapacityResult {
  effectiveMaxPrice: number;
  expectedAveragePrice: number | null;
  expectedDeviationBps: number | null;
  reproducibleCapacityNotional: number;
  canFullyExecute: boolean;
  executableNotional: number;
  status: string;
  reason: string;
}

export interface AnalyzeResponse {
  strategy: StrategySummary;
  follower: FollowerPolicy;
  currentPrice: number | null;
  orderBookSource: "live-kuru" | "synthetic-fallback";
  evaluation: {
    status: string;
    reason: string;
    capacity?: CapacityResult;
  };
  capacityCurve: Array<{ requestedNotional: number } & CapacityResult>;
}

export interface TradingWallet {
  address: string;
  network: string;
  quote: { symbol: string; address: string; decimals: number; balance: number };
  native: { symbol: "MON"; balance: number };
  privyPolicyId?: string;
  rules: Array<{ name: string; action: string }>;
}

export interface PortfolioEntry {
  strategy: StrategySummary;
  position: StrategyDetail["positions"][number];
}

export interface FollowerPolicy {
  wallet: string;
  strategyId: string;
  maxTradeNotional: number;
  maxDailyOutflow: number;
  maxDriftBps: number;
  allowPartialFill: boolean;
  autoExecute: boolean;
  followedKolAt: string;
  unfollowedAt?: string;
  tradingWalletAddress?: string;
  privyPolicyId?: string;
}

export interface Position {
  id: string;
  strategyId: string;
  follower: string;
  entryExecutedAt: string;
  entryAvgPrice: number;
  baseAmount: number;
  quoteSpent: number;
  entryTxHash?: string;
  state: string;
  exitExecutedAt?: string;
  exitAvgPrice?: number;
  quoteReceived?: number;
  realizedPnlQuote?: number;
  leaderFeeQuote?: number;
  exitTxHash?: string;
}

export interface OverviewStats {
  activeStrategies: number;
  totalPositions: number;
  openPositions: number;
  totalRealizedPnlQuote: number;
  winRate: number | null;
  details: StrategyDetail[];
}

export const api = {
  listStrategies: () => get<StrategySummary[]>("/strategies"),
  getStrategy: (id: string) => get<StrategyDetail>(`/strategies/${id}`),
  analyze: (id: string, wallet: string, amount: number) =>
    get<AnalyzeResponse>(`/strategies/${id}/analyze?wallet=${wallet}&notional=${amount}`),
  smartMoney: () =>
    get<{ source: string; note: string; opportunities: Array<Record<string, unknown>> }>(
      "/smart-money/opportunities",
    ),
  /** Aggregates every position for a wallet across all strategies. */
  async getPortfolio(wallet: string): Promise<PortfolioEntry[]> {
    const strategies = await get<StrategySummary[]>("/strategies");
    const details = await Promise.all(strategies.map((s) => get<StrategyDetail>(`/strategies/${s.id}`)));
    const entries: PortfolioEntry[] = [];
    for (const detail of details) {
      for (const position of detail.positions) {
        if (position.follower.toLowerCase() === wallet.toLowerCase()) {
          entries.push({ strategy: detail, position });
        }
      }
    }
    return entries.sort((a, b) => b.position.entryExecutedAt?.localeCompare(a.position.entryExecutedAt ?? "") ?? 0);
  },
  /** Real aggregate stats across every strategy — feeds the top stat bar, no fabricated numbers. */
  async getOverview(): Promise<OverviewStats> {
    const strategies = await get<StrategySummary[]>("/strategies");
    const details = await Promise.all(strategies.map((s) => get<StrategyDetail>(`/strategies/${s.id}`)));
    let totalPositions = 0;
    let openPositions = 0;
    let totalRealizedPnlQuote = 0;
    let wins = 0;
    let closedWithPnl = 0;
    for (const detail of details) {
      for (const position of detail.positions) {
        totalPositions += 1;
        if (position.state !== "CLOSED") openPositions += 1;
        if (position.realizedPnlQuote !== undefined) {
          totalRealizedPnlQuote += position.realizedPnlQuote;
          closedWithPnl += 1;
          if (position.realizedPnlQuote > 0) wins += 1;
        }
      }
    }
    const activeStrategies = details.filter((d) =>
      ["WAITING_FOR_ENTRY", "ENTRY_ACTIVE", "POSITION_ACTIVE", "EXIT_ACTIVE"].includes(d.lifecycleState),
    ).length;
    return {
      activeStrategies,
      totalPositions,
      openPositions,
      totalRealizedPnlQuote,
      winRate: closedWithPnl > 0 ? (wins / closedWithPnl) * 100 : null,
      details,
    };
  },
  /**
   * Follows (or updates risk settings). The backend provisions a Privy
   * trading wallet for this follow and compiles these limits into the
   * Privy policy that wallet signs under.
   */
  follow: (
    token: string,
    strategyId: string,
    body: {
      wallet: string;
      maxTradeNotional: number;
      maxDailyOutflow?: number;
      maxDriftBps: number;
      allowPartialFill?: boolean;
    },
  ) => post<FollowerPolicy>(`/strategies/${strategyId}/follow`, body, token),
  /** The follow's trading wallet with live balances and the Privy policy rules it signs under. */
  tradingWallet: (strategyId: string, wallet: string) =>
    clientRequest<TradingWallet>("GET", `/strategies/${strategyId}/follow/wallet?wallet=${wallet}`),
  /** Executes the copy server-side: the trading wallet signs through Privy, inside its policy. */
  copy: (token: string, strategyId: string, body: { wallet: string; notional: number }) =>
    post<{ position: Position; txHash: string }>(`/strategies/${strategyId}/copy`, body, token),
  /** Sends everything in the trading wallet back to the follower — the only destination its policy allows. */
  withdraw: (token: string, strategyId: string, wallet: string) =>
    post<{ quoteTxHash?: string; nativeTxHash?: string }>(`/strategies/${strategyId}/follow/withdraw`, { wallet }, token),
  /**
   * Manually sells native MON out of the trading wallet for the market's
   * quote token — a real on-chain sell, not tied to a position. Lets a
   * wallet that only holds MON fund a first real buy without a faucet.
   */
  sellForQuote: (token: string, strategyId: string, body: { wallet: string; size: number }) =>
    post<{ txHash: string; size: number; quoteReceived: number; averagePrice: number }>(
      `/strategies/${strategyId}/follow/sell`,
      body,
      token,
    ),
  /**
   * Places a REAL GTC limit sell — confirmed on-chain at placement
   * regardless of book depth, unlike `sellForQuote` (a market order, which
   * needs live bids to fill). Use when the book's bid side is empty.
   */
  limitSell: (token: string, strategyId: string, body: { wallet: string; size: number; price: number }) =>
    post<{ txHash: string; size: number; price: number }>(`/strategies/${strategyId}/follow/limit-sell`, body, token),
  /** Asks Privy to sign an over-cap approve; its policy engine should refuse. */
  guardrailTest: (token: string, strategyId: string, wallet: string) =>
    post<{ refused: boolean; message: string; txHash?: string }>(
      `/strategies/${strategyId}/follow/guardrail-test`,
      { wallet },
      token,
    ),
  /** "Be a Lead Trader" — posts a new momentum-breakout strategy. The creator becomes its leader. */
  createStrategy: (token: string, body: {
    creator: string;
    market: StrategySummary["market"] & { baseToken: string; quoteToken: string };
    breakoutLevel?: number;
    entryMin: number;
    entryMax: number;
    targetMin?: number;
    targetMax?: number;
    stopLevel?: number;
    entryExpiresAt: string;
    strategyExpiresAt?: string;
    description?: string;
    maxStrategyNotional?: number;
    maxFollowers?: number;
  }) => post<StrategySummary>("/strategies", body, token),
  /**
   * Closes an open position with a REAL on-chain market sell: the trading
   * wallet sells the position's base amount through Kuru, and the realized
   * PnL / 10% leader fee (calculateRealizedClose in
   * backend/packages/strategy-engine/src/fees.ts) are computed from the
   * actual quote proceeds read back off that transaction's own logs — never
   * from a client-supplied price.
   */
  closePosition: (token: string, strategyId: string, positionId: string) =>
    post<Position & { txHash: string }>(`/strategies/${strategyId}/positions/${positionId}/close`, {}, token),
};
