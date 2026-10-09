const API_BASE = process.env.MIRRORCAP_API_URL ?? "http://localhost:4000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
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
  lifecycleState: string;
  currentPrice: number | null;
}

export interface StrategyDetail extends StrategySummary {
  positions: Array<{
    id: string;
    follower: string;
    state: string;
    entryAvgPrice: number;
    quoteSpent: number;
    exitAvgPrice?: number;
    realizedPnlQuote?: number;
    leaderFeeQuote?: number;
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
  follower: { maxTradeNotional: number; maxDriftBps: number; allowPartialFill: boolean };
  currentPrice: number | null;
  orderBookSource: "live-kuru" | "synthetic-fallback";
  evaluation: {
    status: string;
    reason: string;
    capacity?: CapacityResult;
  };
  capacityCurve: Array<{ requestedNotional: number } & CapacityResult>;
  suggestedCliCommand: string;
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
};
