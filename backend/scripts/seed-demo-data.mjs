// Replaces backend/data/store.json's leftover debug-session junk (every
// strategy was literally named "Edge case: ..." / "daily cap test", all on
// one market, all one fake creator) with a clean, varied demo dataset.
//
// Every strategy still uses the ONE real, live Kuru market this project has
// (Monad testnet MON-USDC, 0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9) —
// verified directly against mainnet MON-USDC (read fails, contract not
// live-compatible) and mainnet MON-AUSD (reads fine but has zero orders on
// either side) via scripts/check-mainnet-markets.ts, so there is no second
// real market to diversify onto yet. Variety instead comes from distinct
// creator "leaders", varied setups, dates and outcomes — not fabricated
// token symbols.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../data/store.json");

const MARKET = {
  marketAddress: "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9",
  symbol: "MON-USDC",
  baseToken: "0x0000000000000000000000000000000000000000",
  quoteToken: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570",
  network: "monad-testnet",
};

const LEADER_A = "0xA17c92D4e6B853F1c9A2D6E84B2F7C1A9D3E5B82";
const LEADER_B = "0xB29D4F1A7E3C8B5D2F9A6E1C4B8D3F7A2E9C5B61";
const LEADER_C = "0xC3A8E2F5D9B1C7A4E6F3D8B2A5E9C1F7D4B6A390";
const LEADER_D = "0xD4B9F3A6E2C8D1A5F7B3E9C6D2A8F4B1E5C9D7A2";
const LEADER_E = "0xE5C1A7F4B9D3E6A2C8F5B1D7A4E9C3F6B2D8A5E1";

const FOLLOWERS = [
  "0xF1a2B3c4D5e6F7A8b9C0d1E2f3A4b5C6d7E8F9a0",
  "0xF2b3C4d5E6f7A8b9C0d1e2F3a4B5c6D7e8F9A0b1",
  "0xF3c4D5e6F7a8B9c0D1e2F3a4b5C6d7E8f9A0B1c2",
  "0xF4d5E6f7A8b9C0d1E2f3A4b5C6d7e8F9a0B1c2D3",
  "0xF5e6F7a8B9c0D1e2f3A4b5C6d7E8f9A0b1C2d3E4",
  "0xF6f7A8b9C0d1E2f3a4B5c6D7e8F9a0B1c2D3e4F5",
  "0xF7a8B9c0D1e2F3a4b5C6d7E8f9A0b1C2d3E4f5A6",
  "0xF8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E4f5A6b7",
  "0xF9c0D1e2F3a4B5c6D7e8F9a0B1c2D3e4F5a6B7c8",
  "0xFAd1E2f3A4b5C6d7E8f9A0b1C2d3E4f5A6b7C8d9",
];

function daysAgo(n, hour = 12) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function closeFill(quoteSpent, exitAvgPrice, entryAvgPrice) {
  const baseAmount = quoteSpent / entryAvgPrice;
  const quoteReceived = baseAmount * exitAvgPrice;
  const realizedPnlQuote = Math.round((quoteReceived - quoteSpent) * 100) / 100;
  const leaderFeeQuote = realizedPnlQuote > 0 ? Math.round(realizedPnlQuote * 0.1 * 100) / 100 : 0;
  return { baseAmount, quoteReceived: Math.round(quoteReceived * 100) / 100, realizedPnlQuote, leaderFeeQuote };
}

const strategies = [];
const followers = [];
const positions = [];
const dailyOutflow = {};

function addStrategy(s) {
  strategies.push({ market: MARKET, strategyType: "MOMENTUM_BREAKOUT", ...s });
  return s.id;
}
function addFollower(f) {
  followers.push(f);
}
function addPosition(p) {
  positions.push(p);
}

// S1 — Leader A — live ENTRY_ACTIVE (current testnet price ~1.10 sits inside 1.08-1.10)
addStrategy({
  id: "s1-breakout-resistance",
  creator: LEADER_A,
  breakoutLevel: 1.08,
  entryMin: 1.08,
  entryMax: 1.1,
  targetMin: 1.22,
  targetMax: 1.28,
  stopLevel: 0.98,
  entryExpiresAt: daysFromNow(8),
  strategyExpiresAt: daysFromNow(30),
  description: "Breakout continuation above 1.08 resistance.",
  maxFollowers: 25,
  createdAt: daysAgo(18),
  lifecycleState: "ENTRY_ACTIVE",
});
addFollower({ wallet: FOLLOWERS[0], strategyId: "s1-breakout-resistance", maxTradeNotional: 1000, maxDailyOutflow: 2000, maxDriftBps: 150, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(17) });
addFollower({ wallet: FOLLOWERS[1], strategyId: "s1-breakout-resistance", maxTradeNotional: 500, maxDailyOutflow: 500, maxDriftBps: 300, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(16) });
addPosition({ id: "p-s1-1", strategyId: "s1-breakout-resistance", follower: FOLLOWERS[0], entryExecutedAt: daysAgo(16, 9), entryAvgPrice: 1.085, baseAmount: 1000 / 1.085, quoteSpent: 1000, state: "POSITION_ACTIVE" });
{
  // Earlier completed rounds for this strategy, before the current open entry —
  // a real win/loss/win zigzag (cumulative ROI genuinely crosses zero twice),
  // not just a smaller positive bump.
  const f1 = closeFill(400, 1.05, 1.0);
  const f2 = closeFill(600, 0.95, 1.05);
  const f3 = closeFill(500, 1.12, 0.97);
  addPosition({ id: "p-s1-2", strategyId: "s1-breakout-resistance", follower: FOLLOWERS[0], entryExecutedAt: daysAgo(17, 8), entryAvgPrice: 1.0, baseAmount: f1.baseAmount, quoteSpent: 400, state: "CLOSED", exitExecutedAt: daysAgo(17, 14), exitAvgPrice: 1.05, quoteReceived: f1.quoteReceived, realizedPnlQuote: f1.realizedPnlQuote, leaderFeeQuote: f1.leaderFeeQuote });
  addPosition({ id: "p-s1-3", strategyId: "s1-breakout-resistance", follower: FOLLOWERS[1], entryExecutedAt: daysAgo(17, 16), entryAvgPrice: 1.05, baseAmount: f2.baseAmount, quoteSpent: 600, state: "CLOSED", exitExecutedAt: daysAgo(16, 11), exitAvgPrice: 0.95, quoteReceived: f2.quoteReceived, realizedPnlQuote: f2.realizedPnlQuote, leaderFeeQuote: f2.leaderFeeQuote });
  addPosition({ id: "p-s1-4", strategyId: "s1-breakout-resistance", follower: FOLLOWERS[7], entryExecutedAt: daysAgo(16, 15), entryAvgPrice: 0.97, baseAmount: f3.baseAmount, quoteSpent: 500, state: "CLOSED", exitExecutedAt: daysAgo(16, 20), exitAvgPrice: 1.12, quoteReceived: f3.quoteReceived, realizedPnlQuote: f3.realizedPnlQuote, leaderFeeQuote: f3.leaderFeeQuote });
}

// S2 — Leader B — ENTRY_ACTIVE, price has drifted above entry zone but window still open
addStrategy({
  id: "s2-psych-level",
  creator: LEADER_B,
  breakoutLevel: 1.0,
  entryMin: 1.0,
  entryMax: 1.03,
  targetMin: 1.12,
  targetMax: 1.18,
  stopLevel: 0.92,
  entryExpiresAt: daysFromNow(5),
  strategyExpiresAt: daysFromNow(25),
  description: "Reclaim of the 1.00 psychological level.",
  maxFollowers: 50,
  createdAt: daysAgo(12),
  lifecycleState: "ENTRY_ACTIVE",
});
addFollower({ wallet: FOLLOWERS[2], strategyId: "s2-psych-level", maxTradeNotional: 2000, maxDailyOutflow: 2000, maxDriftBps: 200, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(11) });
addFollower({ wallet: FOLLOWERS[3], strategyId: "s2-psych-level", maxTradeNotional: 300, maxDailyOutflow: 300, maxDriftBps: 100, allowPartialFill: false, autoExecute: false, followedKolAt: daysAgo(10) });
addPosition({ id: "p-s2-1", strategyId: "s2-psych-level", follower: FOLLOWERS[2], entryExecutedAt: daysAgo(11, 14), entryAvgPrice: 1.012, baseAmount: 2000 / 1.012, quoteSpent: 2000, state: "POSITION_ACTIVE" });
addPosition({ id: "p-s2-2", strategyId: "s2-psych-level", follower: FOLLOWERS[3], entryExecutedAt: daysAgo(10, 10), entryAvgPrice: 1.02, baseAmount: 300 / 1.02, quoteSpent: 300, state: "POSITION_ACTIVE" });
{
  const f1 = closeFill(700, 1.09, 0.995);
  const f2 = closeFill(250, 1.1, 1.0);
  addPosition({ id: "p-s2-3", strategyId: "s2-psych-level", follower: FOLLOWERS[2], entryExecutedAt: daysAgo(11, 9), entryAvgPrice: 0.995, baseAmount: f1.baseAmount, quoteSpent: 700, state: "CLOSED", exitExecutedAt: daysAgo(10, 15), exitAvgPrice: 1.09, quoteReceived: f1.quoteReceived, realizedPnlQuote: f1.realizedPnlQuote, leaderFeeQuote: f1.leaderFeeQuote });
  addPosition({ id: "p-s2-4", strategyId: "s2-psych-level", follower: FOLLOWERS[3], entryExecutedAt: daysAgo(10, 8), entryAvgPrice: 1.0, baseAmount: f2.baseAmount, quoteSpent: 250, state: "CLOSED", exitExecutedAt: daysAgo(9, 12), exitAvgPrice: 1.1, quoteReceived: f2.quoteReceived, realizedPnlQuote: f2.realizedPnlQuote, leaderFeeQuote: f2.leaderFeeQuote });
}

// S3 — Leader C — POSITION_ACTIVE, target already <= current live price -> ticks to EXIT_ACTIVE live
addStrategy({
  id: "s3-range-expansion",
  creator: LEADER_C,
  breakoutLevel: 1.05,
  entryMin: 1.05,
  entryMax: 1.09,
  targetMin: 1.08,
  targetMax: 1.14,
  stopLevel: 0.9,
  entryExpiresAt: daysFromNow(15),
  strategyExpiresAt: daysFromNow(35),
  description: "Range-expansion breakout, wide drift tolerance.",
  maxFollowers: 15,
  createdAt: daysAgo(9),
  lifecycleState: "POSITION_ACTIVE",
});
addFollower({ wallet: FOLLOWERS[4], strategyId: "s3-range-expansion", maxTradeNotional: 1500, maxDailyOutflow: 1500, maxDriftBps: 400, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(8) });
addFollower({ wallet: FOLLOWERS[5], strategyId: "s3-range-expansion", maxTradeNotional: 750, maxDailyOutflow: 750, maxDriftBps: 250, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(7) });
addFollower({ wallet: FOLLOWERS[6], strategyId: "s3-range-expansion", maxTradeNotional: 5000, maxDailyOutflow: 5000, maxDriftBps: 500, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(6) });
addPosition({ id: "p-s3-1", strategyId: "s3-range-expansion", follower: FOLLOWERS[4], entryExecutedAt: daysAgo(7, 11), entryAvgPrice: 1.062, baseAmount: 1500 / 1.062, quoteSpent: 1500, state: "POSITION_ACTIVE" });
addPosition({ id: "p-s3-2", strategyId: "s3-range-expansion", follower: FOLLOWERS[5], entryExecutedAt: daysAgo(7, 15), entryAvgPrice: 1.07, baseAmount: 750 / 1.07, quoteSpent: 750, state: "POSITION_ACTIVE" });
addPosition({ id: "p-s3-3", strategyId: "s3-range-expansion", follower: FOLLOWERS[6], entryExecutedAt: daysAgo(6, 9), entryAvgPrice: 1.075, baseAmount: 5000 / 1.075, quoteSpent: 5000, state: "POSITION_ACTIVE" });
{
  const f1 = closeFill(900, 1.095, 1.04);
  addPosition({ id: "p-s3-4", strategyId: "s3-range-expansion", follower: FOLLOWERS[4], entryExecutedAt: daysAgo(8, 10), entryAvgPrice: 1.04, baseAmount: f1.baseAmount, quoteSpent: 900, state: "CLOSED", exitExecutedAt: daysAgo(7, 9), exitAvgPrice: 1.095, quoteReceived: f1.quoteReceived, realizedPnlQuote: f1.realizedPnlQuote, leaderFeeQuote: f1.leaderFeeQuote });
}

// S4 — Leader D — WAITING_FOR_ENTRY, price hasn't reached the zone yet
addStrategy({
  id: "s4-early-signal",
  creator: LEADER_D,
  breakoutLevel: 1.25,
  entryMin: 1.25,
  entryMax: 1.3,
  targetMin: 1.4,
  targetMax: 1.5,
  stopLevel: 1.15,
  entryExpiresAt: daysFromNow(20),
  strategyExpiresAt: daysFromNow(40),
  description: "Early signal — price hasn't reached the trigger zone yet.",
  maxFollowers: 100,
  createdAt: daysAgo(2),
  lifecycleState: "WAITING_FOR_ENTRY",
});
addFollower({ wallet: FOLLOWERS[0], strategyId: "s4-early-signal", maxTradeNotional: 1000, maxDailyOutflow: 1000, maxDriftBps: 200, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(1) });
addFollower({ wallet: FOLLOWERS[8], strategyId: "s4-early-signal", maxTradeNotional: 600, maxDailyOutflow: 600, maxDriftBps: 250, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(1) });

// S5 — Leader E — CLOSED, completed cycle, mostly profitable
addStrategy({
  id: "s5-completed-cycle",
  creator: LEADER_E,
  breakoutLevel: 0.95,
  entryMin: 0.95,
  entryMax: 0.98,
  targetMin: 1.08,
  targetMax: 1.12,
  stopLevel: 0.9,
  entryExpiresAt: daysAgo(15),
  strategyExpiresAt: daysAgo(10),
  description: "Completed momentum cycle, closed after target hit.",
  maxFollowers: 10,
  createdAt: daysAgo(25),
  lifecycleState: "CLOSED",
});
{
  const f1 = closeFill(800, 1.1, 0.965);
  const f2 = closeFill(1200, 1.09, 0.97);
  const f3 = closeFill(400, 0.94, 0.962); // stopped out
  addFollower({ wallet: FOLLOWERS[1], strategyId: "s5-completed-cycle", maxTradeNotional: 800, maxDailyOutflow: 800, maxDriftBps: 200, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(24), unfollowedAt: daysAgo(19) });
  addFollower({ wallet: FOLLOWERS[2], strategyId: "s5-completed-cycle", maxTradeNotional: 1200, maxDailyOutflow: 1200, maxDriftBps: 150, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(23), unfollowedAt: daysAgo(19) });
  addFollower({ wallet: FOLLOWERS[3], strategyId: "s5-completed-cycle", maxTradeNotional: 400, maxDailyOutflow: 400, maxDriftBps: 100, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(22), unfollowedAt: daysAgo(20) });
  addPosition({ id: "p-s5-1", strategyId: "s5-completed-cycle", follower: FOLLOWERS[1], entryExecutedAt: daysAgo(24, 10), entryAvgPrice: 0.965, baseAmount: f1.baseAmount, quoteSpent: 800, state: "CLOSED", exitExecutedAt: daysAgo(19, 16), exitAvgPrice: 1.1, quoteReceived: f1.quoteReceived, realizedPnlQuote: f1.realizedPnlQuote, leaderFeeQuote: f1.leaderFeeQuote });
  addPosition({ id: "p-s5-2", strategyId: "s5-completed-cycle", follower: FOLLOWERS[2], entryExecutedAt: daysAgo(23, 11), entryAvgPrice: 0.97, baseAmount: f2.baseAmount, quoteSpent: 1200, state: "CLOSED", exitExecutedAt: daysAgo(19, 16), exitAvgPrice: 1.09, quoteReceived: f2.quoteReceived, realizedPnlQuote: f2.realizedPnlQuote, leaderFeeQuote: f2.leaderFeeQuote });
  addPosition({ id: "p-s5-3", strategyId: "s5-completed-cycle", follower: FOLLOWERS[3], entryExecutedAt: daysAgo(22, 9), entryAvgPrice: 0.962, baseAmount: f3.baseAmount, quoteSpent: 400, state: "CLOSED", exitExecutedAt: daysAgo(20, 13), exitAvgPrice: 0.94, quoteReceived: f3.quoteReceived, realizedPnlQuote: f3.realizedPnlQuote, leaderFeeQuote: f3.leaderFeeQuote });
}

// S6 — Leader A (second strategy) — CLOSED at a loss, stopped out
addStrategy({
  id: "s6-stopped-out",
  creator: LEADER_A,
  breakoutLevel: 1.02,
  entryMin: 1.02,
  entryMax: 1.05,
  targetMin: 1.15,
  targetMax: 1.2,
  stopLevel: 0.97,
  entryExpiresAt: daysAgo(4),
  strategyExpiresAt: daysAgo(1),
  description: "Stop-loss discipline test — closed at a loss.",
  maxFollowers: 20,
  createdAt: daysAgo(14),
  lifecycleState: "CLOSED",
});
{
  const f1 = closeFill(600, 0.97, 1.035);
  const f2 = closeFill(900, 0.97, 1.04);
  addFollower({ wallet: FOLLOWERS[4], strategyId: "s6-stopped-out", maxTradeNotional: 600, maxDailyOutflow: 600, maxDriftBps: 200, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(13), unfollowedAt: daysAgo(9) });
  addFollower({ wallet: FOLLOWERS[5], strategyId: "s6-stopped-out", maxTradeNotional: 900, maxDailyOutflow: 900, maxDriftBps: 250, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(12), unfollowedAt: daysAgo(9) });
  addPosition({ id: "p-s6-1", strategyId: "s6-stopped-out", follower: FOLLOWERS[4], entryExecutedAt: daysAgo(13, 10), entryAvgPrice: 1.035, baseAmount: f1.baseAmount, quoteSpent: 600, state: "CLOSED", exitExecutedAt: daysAgo(9, 8), exitAvgPrice: 0.97, quoteReceived: f1.quoteReceived, realizedPnlQuote: f1.realizedPnlQuote, leaderFeeQuote: f1.leaderFeeQuote });
  addPosition({ id: "p-s6-2", strategyId: "s6-stopped-out", follower: FOLLOWERS[5], entryExecutedAt: daysAgo(12, 14), entryAvgPrice: 1.04, baseAmount: f2.baseAmount, quoteSpent: 900, state: "CLOSED", exitExecutedAt: daysAgo(9, 8), exitAvgPrice: 0.97, quoteReceived: f2.quoteReceived, realizedPnlQuote: f2.realizedPnlQuote, leaderFeeQuote: f2.leaderFeeQuote });
}

// S7 — Leader B (second strategy) — brand new, WAITING, no followers yet
addStrategy({
  id: "s7-fresh-signal",
  creator: LEADER_B,
  breakoutLevel: 1.12,
  entryMin: 1.12,
  entryMax: 1.15,
  targetMin: 1.25,
  targetMax: 1.32,
  stopLevel: 1.05,
  entryExpiresAt: daysFromNow(7),
  strategyExpiresAt: daysFromNow(27),
  description: "Fresh breakout signal, just posted.",
  maxFollowers: 200,
  createdAt: daysAgo(0, 3),
  lifecycleState: "WAITING_FOR_ENTRY",
});
addFollower({ wallet: FOLLOWERS[9], strategyId: "s7-fresh-signal", maxTradeNotional: 300, maxDailyOutflow: 300, maxDriftBps: 200, allowPartialFill: true, autoExecute: false, followedKolAt: daysAgo(0, 2) });

// today's daily-outflow bookkeeping for the still-open positions
for (const p of positions) {
  if (p.state !== "CLOSED") {
    const day = p.entryExecutedAt.slice(0, 10);
    const key = `${p.follower}:${day}`;
    dailyOutflow[key] = (dailyOutflow[key] ?? 0) + p.quoteSpent;
  }
}

const store = { strategies, followers, positions, dailyOutflow };
fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
console.log(`Wrote ${strategies.length} strategies, ${followers.length} followers, ${positions.length} positions to ${DATA_FILE}`);
