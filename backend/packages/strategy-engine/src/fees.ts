const LEADER_FEE_RATE = 0.1; // 10% of realized follower profit (OVERALL.md #33). Never of capital.

export interface RealizedCloseResult {
  realizedPnlQuote: number;
  leaderFeeQuote: number;
  followerNetProfitQuote: number;
}

/**
 * Simple performance-fee model: 10% of realized profit to the leader, 0 on
 * flat/negative outcomes. Applied only when a position actually closes.
 */
export function calculateRealizedClose(
  entryQuoteSpent: number,
  exitQuoteReceived: number,
): RealizedCloseResult {
  const realizedPnlQuote = exitQuoteReceived - entryQuoteSpent;
  const leaderFeeQuote = realizedPnlQuote > 0 ? realizedPnlQuote * LEADER_FEE_RATE : 0;
  const followerNetProfitQuote = realizedPnlQuote - leaderFeeQuote;

  return { realizedPnlQuote, leaderFeeQuote, followerNetProfitQuote };
}
