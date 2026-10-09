import { describe, expect, it } from "vitest";
import type { FollowerPolicy, OrderBookLevel, Strategy } from "@mirrorcap/shared-types";
import { applyLifecycleEvent } from "../src/lifecycle.js";
import { calculateRealizedClose } from "../src/fees.js";
import { buildBoundedOrderParams } from "../src/execution.js";
import { checkFollowerRiskCondition, checkKolStrategyCondition, evaluateCopyability } from "../src/pretrade.js";

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  const now = new Date("2026-10-09T10:00:00Z");
  return {
    id: "strat-1",
    creator: "0xKOL0000000000000000000000000000000000",
    market: {
      marketAddress: "0xMarket0000000000000000000000000000000",
      symbol: "MON-USDC",
      baseToken: "0xBase00000000000000000000000000000000000",
      quoteToken: "0xQuote0000000000000000000000000000000000",
      network: "monad-testnet",
    },
    strategyType: "MOMENTUM_BREAKOUT",
    breakoutLevel: 10.0,
    entryMin: 10.0,
    entryMax: 10.2,
    targetMin: 11.0,
    targetMax: 11.5,
    stopLevel: 9.7,
    entryExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    strategyExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
    lifecycleState: "WAITING_FOR_ENTRY",
    ...overrides,
  };
}

function makeFollower(overrides: Partial<FollowerPolicy> = {}): FollowerPolicy {
  return {
    wallet: "0xFollower000000000000000000000000000000",
    strategyId: "strat-1",
    maxTradeNotional: 1000,
    maxDailyOutflow: 5000,
    maxDriftBps: 200,
    allowPartialFill: true,
    autoExecute: true,
    followedKolAt: new Date("2026-10-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

const ASKS: OrderBookLevel[] = [
  { price: 10.05, size: 3000 / 10.05 },
  { price: 10.08, size: 4000 / 10.08 },
  { price: 10.1, size: 5000 / 10.1 },
  { price: 10.15, size: 4000 / 10.15 },
  { price: 10.2, size: 4000 / 10.2 },
];

describe("lifecycle state machine", () => {
  it("stays WAITING_FOR_ENTRY while price has not broken out", () => {
    const strategy = makeStrategy();
    const next = applyLifecycleEvent(strategy, {
      type: "TICK",
      currentPrice: 9.9,
      now: new Date("2026-10-09T10:30:00Z"),
    });
    expect(next).toBe("WAITING_FOR_ENTRY");
  });

  it("moves to ENTRY_ACTIVE once price enters the KOL's range", () => {
    const strategy = makeStrategy();
    const next = applyLifecycleEvent(strategy, {
      type: "TICK",
      currentPrice: 10.1,
      now: new Date("2026-10-09T10:30:00Z"),
    });
    expect(next).toBe("ENTRY_ACTIVE");
  });

  it("expires WAITING_FOR_ENTRY once the entry window passes without a breakout", () => {
    const strategy = makeStrategy();
    const next = applyLifecycleEvent(strategy, {
      type: "TICK",
      currentPrice: 9.9,
      now: new Date("2026-10-09T13:00:00Z"), // past entryExpiresAt (12:00)
    });
    expect(next).toBe("EXPIRED");
  });

  it("does NOT auto-enter after the entry window expires even if price re-enters range", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    const next = applyLifecycleEvent(strategy, {
      type: "TICK",
      currentPrice: 10.1,
      now: new Date("2026-10-09T13:00:00Z"), // past entryExpiresAt
    });
    expect(next).toBe("EXPIRED");
  });

  it("moves to POSITION_ACTIVE only on an explicit ENTRY_EXECUTED event", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    expect(applyLifecycleEvent(strategy, { type: "ENTRY_EXECUTED" })).toBe("POSITION_ACTIVE");
  });

  it("allows POSITION_ACTIVE to persist past the original entry window", () => {
    const strategy = makeStrategy({ lifecycleState: "POSITION_ACTIVE" });
    const next = applyLifecycleEvent(strategy, {
      type: "TICK",
      currentPrice: 10.3,
      now: new Date("2026-10-09T13:00:00Z"), // well past entryExpiresAt
    });
    expect(next).toBe("POSITION_ACTIVE");
  });

  it("moves POSITION_ACTIVE to EXIT_ACTIVE when target or stop is hit", () => {
    const strategy = makeStrategy({ lifecycleState: "POSITION_ACTIVE" });
    expect(
      applyLifecycleEvent(strategy, { type: "TICK", currentPrice: 11.1, now: new Date() }),
    ).toBe("EXIT_ACTIVE");
    expect(
      applyLifecycleEvent(strategy, { type: "TICK", currentPrice: 9.5, now: new Date() }),
    ).toBe("EXIT_ACTIVE");
  });

  it("never force-closes automatically — only MANUAL_CLOSE moves to CLOSED", () => {
    const strategy = makeStrategy({ lifecycleState: "EXIT_ACTIVE" });
    const stillOpen = applyLifecycleEvent(strategy, {
      type: "TICK",
      currentPrice: 11.1,
      now: new Date(),
    });
    expect(stillOpen).toBe("EXIT_ACTIVE");
    expect(applyLifecycleEvent(strategy, { type: "MANUAL_CLOSE" })).toBe("CLOSED");
  });

  it("terminal states (CLOSED/EXPIRED) never move again", () => {
    const closed = makeStrategy({ lifecycleState: "CLOSED" });
    expect(applyLifecycleEvent(closed, { type: "ENTRY_EXECUTED" })).toBe("CLOSED");
    const expired = makeStrategy({ lifecycleState: "EXPIRED" });
    expect(applyLifecycleEvent(expired, { type: "TICK", currentPrice: 10.1, now: new Date() })).toBe(
      "EXPIRED",
    );
  });
});

describe("checkKolStrategyCondition", () => {
  it("fails once the stop level is breached", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    const result = checkKolStrategyCondition(strategy, 9.6, new Date("2026-10-09T10:30:00Z"));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/stop/i);
  });

  it("fails once the entry window has expired", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    const result = checkKolStrategyCondition(strategy, 10.1, new Date("2026-10-09T13:00:00Z"));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("passes when price is inside range and window is open", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    const result = checkKolStrategyCondition(strategy, 10.1, new Date("2026-10-09T10:30:00Z"));
    expect(result.valid).toBe(true);
  });
});

describe("checkFollowerRiskCondition", () => {
  it("rejects a follower who has unfollowed the KOL", () => {
    const follower = makeFollower({ unfollowedAt: new Date().toISOString() });
    const result = checkFollowerRiskCondition(follower, 100, 0);
    expect(result.valid).toBe(false);
  });

  it("clamps requested notional to the follower's max trade amount", () => {
    const follower = makeFollower({ maxTradeNotional: 100 });
    const result = checkFollowerRiskCondition(follower, 500, 0);
    expect(result.valid).toBe(true);
    expect(result.clampedNotional).toBe(100);
  });

  it("clamps to the remaining daily outflow cap", () => {
    const follower = makeFollower({ maxTradeNotional: 1000, maxDailyOutflow: 300 });
    const result = checkFollowerRiskCondition(follower, 500, 250);
    expect(result.valid).toBe(true);
    expect(result.clampedNotional).toBe(50);
  });

  it("rejects when the daily cap is already exhausted", () => {
    const follower = makeFollower({ maxDailyOutflow: 300 });
    const result = checkFollowerRiskCondition(follower, 100, 300);
    expect(result.valid).toBe(false);
  });
});

describe("evaluateCopyability (composed layers 1-3)", () => {
  it("returns WAITING before the breakout occurs", () => {
    const strategy = makeStrategy({ lifecycleState: "WAITING_FOR_ENTRY" });
    const follower = makeFollower();
    const result = evaluateCopyability({
      strategy,
      follower,
      currentPrice: 9.9,
      now: new Date("2026-10-09T10:30:00Z"),
      requestedNotional: 100,
      dailyOutflowSoFarQuote: 0,
      asks: ASKS,
    });
    expect(result.status).toBe("WAITING");
  });

  it("returns COPYABLE for a small request inside a healthy book", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    const follower = makeFollower();
    const result = evaluateCopyability({
      strategy,
      follower,
      currentPrice: 10.08,
      now: new Date("2026-10-09T10:30:00Z"),
      requestedNotional: 100,
      dailyOutflowSoFarQuote: 0,
      asks: ASKS,
    });
    expect(result.status).toBe("COPYABLE");
    expect(result.capacity?.canFullyExecute).toBe(true);
  });

  it("returns OUTSIDE_POLICY once price breaches the stop, even with deep liquidity", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    const follower = makeFollower();
    const result = evaluateCopyability({
      strategy,
      follower,
      currentPrice: 9.5,
      now: new Date("2026-10-09T10:30:00Z"),
      requestedNotional: 100,
      dailyOutflowSoFarQuote: 0,
      asks: ASKS,
    });
    expect(result.status).toBe("OUTSIDE_POLICY");
  });

  it("returns EXIT_ACTIVE (not a new-entry decision) once a position is already active", () => {
    const strategy = makeStrategy({ lifecycleState: "POSITION_ACTIVE" });
    const follower = makeFollower();
    const result = evaluateCopyability({
      strategy,
      follower,
      currentPrice: 10.3,
      now: new Date("2026-10-09T10:30:00Z"),
      requestedNotional: 100,
      dailyOutflowSoFarQuote: 0,
      asks: ASKS,
    });
    expect(result.status).toBe("EXIT_ACTIVE");
  });
});

describe("buildBoundedOrderParams", () => {
  it("never widens the follower's bound and picks FOK/IOC from partial-fill preference", () => {
    const strategy = makeStrategy({ lifecycleState: "ENTRY_ACTIVE" });
    const follower = makeFollower({ allowPartialFill: false });
    const evaluation = evaluateCopyability({
      strategy,
      follower,
      currentPrice: 10.08,
      now: new Date("2026-10-09T10:30:00Z"),
      requestedNotional: 100,
      dailyOutflowSoFarQuote: 0,
      asks: ASKS,
    });
    expect(evaluation.capacity).toBeDefined();
    const order = buildBoundedOrderParams(evaluation.capacity!, strategy.market.marketAddress, follower);
    expect(order.maxPrice).toBe(evaluation.capacity!.effectiveMaxPrice);
    expect(order.mode).toBe("FOK");
    expect(order.fillOrKill).toBe(true);
  });
});

describe("calculateRealizedClose (10% performance fee)", () => {
  it("charges 10% of positive realized profit", () => {
    const result = calculateRealizedClose(1000, 1100);
    expect(result.realizedPnlQuote).toBeCloseTo(100, 6);
    expect(result.leaderFeeQuote).toBeCloseTo(10, 6);
    expect(result.followerNetProfitQuote).toBeCloseTo(90, 6);
  });

  it("charges zero fee on a loss", () => {
    const result = calculateRealizedClose(1000, 900);
    expect(result.realizedPnlQuote).toBeCloseTo(-100, 6);
    expect(result.leaderFeeQuote).toBe(0);
  });

  it("charges zero fee on exactly breakeven", () => {
    const result = calculateRealizedClose(1000, 1000);
    expect(result.leaderFeeQuote).toBe(0);
  });

  it("never takes a fee from capital, only from profit", () => {
    const result = calculateRealizedClose(10000, 10050);
    // fee is 10% of the $50 profit, not 10% of the $10,000 capital.
    expect(result.leaderFeeQuote).toBeCloseTo(5, 6);
  });
});
