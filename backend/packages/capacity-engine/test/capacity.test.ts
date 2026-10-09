import { describe, expect, it } from "vitest";
import {
  buildCapacityCurve,
  calculateBuyCapacity,
  calculateEffectiveMaxPrice,
} from "../src/index.js";
import type { OrderBookLevel } from "@mirrorcap/shared-types";

// Synthetic order book mirroring OVERALL.md #7, extended with a far-away level.
const SYNTHETIC_ASKS: OrderBookLevel[] = [
  { price: 10.05, size: 3000 / 10.05 },
  { price: 10.08, size: 4000 / 10.08 },
  { price: 10.1, size: 5000 / 10.1 },
  { price: 10.15, size: 4000 / 10.15 },
  { price: 10.2, size: 4000 / 10.2 },
  { price: 10.35, size: 10000 / 10.35 },
];

describe("calculateEffectiveMaxPrice", () => {
  it("uses the stricter of KOL max and follower drift bound", () => {
    // Follower drift (1.5% of 10.00 = 10.15) is tighter than KOL max (10.20).
    expect(calculateEffectiveMaxPrice(10.0, 10.2, 150)).toBeCloseTo(10.15, 4);
  });

  it("falls back to KOL max when follower drift is looser", () => {
    // Follower drift (5% of 10.00 = 10.50) is looser than KOL max (10.20).
    expect(calculateEffectiveMaxPrice(10.0, 10.2, 500)).toBeCloseTo(10.2, 4);
  });

  it("equals the reference price when drift is zero", () => {
    expect(calculateEffectiveMaxPrice(10.0, 10.2, 0)).toBeCloseTo(10.0, 4);
  });
});

describe("calculateBuyCapacity", () => {
  it("reports full reproducible capacity across the book inside the bound", () => {
    // effectiveMaxPrice = min(10.20, 10.00*1.02=10.20) = 10.20 -> sums levels <=10.20: 3000+4000+5000+4000+4000 = 20000
    const result = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 200,
      requestedNotional: 100,
      asks: SYNTHETIC_ASKS,
    });

    expect(result.reproducibleCapacityNotional).toBeCloseTo(20000, 0);
  });

  it("returns COPYABLE and fills small requests near the best ask", () => {
    const result = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 200,
      requestedNotional: 100,
      asks: SYNTHETIC_ASKS,
    });

    expect(result.status).toBe("COPYABLE");
    expect(result.canFullyExecute).toBe(true);
    expect(result.expectedAveragePrice).toBeCloseTo(10.05, 3);
  });

  it("degrades a large-but-fillable request that eats most of the drift budget", () => {
    // followerMaxDriftBps=150 -> effectiveMaxPrice=min(10.20, 10.00*1.015)=10.15,
    // budget=150bps, reproducible capacity inside the bound = 16,000.
    // Requesting $15,000 (near the full 16,000 ceiling) pushes the weighted-average
    // deviation to ~91bps, i.e. >60% of the 150bps budget, while still fully filling.
    const result = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 150,
      requestedNotional: 15000,
      asks: SYNTHETIC_ASKS,
    });

    expect(result.canFullyExecute).toBe(true);
    expect(result.status).toBe("DEGRADING");
  });

  it("returns LIMITED_CAPACITY when requested size exceeds reproducible capacity", () => {
    const result = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 200,
      requestedNotional: 50000,
      asks: SYNTHETIC_ASKS,
    });

    expect(result.canFullyExecute).toBe(false);
    expect(result.status).toBe("LIMITED_CAPACITY");
    expect(result.executableNotional).toBeCloseTo(20000, 0);
    expect(result.reason).toMatch(/reproducible/i);
  });

  it("returns OUTSIDE_POLICY when best ask already exceeds the effective bound", () => {
    const result = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 0, // effectiveMaxPrice pinned to 10.00
      requestedNotional: 100,
      asks: SYNTHETIC_ASKS, // best ask 10.05 > 10.00
    });

    expect(result.status).toBe("OUTSIDE_POLICY");
    expect(result.canFullyExecute).toBe(false);
    expect(result.executableNotional).toBe(0);
    expect(result.expectedAveragePrice).toBeNull();
  });

  it("returns OUTSIDE_POLICY on an empty book", () => {
    const result = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 200,
      requestedNotional: 100,
      asks: [],
    });

    expect(result.status).toBe("OUTSIDE_POLICY");
  });

  it("is follower-specific: tighter drift yields strictly less capacity than looser drift", () => {
    const tight = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 50, // effectiveMax = 10.05
      requestedNotional: 100,
      asks: SYNTHETIC_ASKS,
    });
    const loose = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 200, // effectiveMax = 10.20
      requestedNotional: 100,
      asks: SYNTHETIC_ASKS,
    });

    expect(tight.reproducibleCapacityNotional).toBeLessThan(loose.reproducibleCapacityNotional);
  });

  it("never lets effectiveMaxPrice exceed the KOL strategy maximum (race-condition guard)", () => {
    const result = calculateBuyCapacity({
      side: "BUY",
      strategyEntryMin: 10.0,
      strategyEntryMax: 10.2,
      followerMaxDriftBps: 100000, // absurdly loose follower tolerance
      requestedNotional: 1,
      asks: SYNTHETIC_ASKS,
    });

    expect(result.effectiveMaxPrice).toBeCloseTo(10.2, 6);
  });

  it("rejects invalid ranges", () => {
    expect(() =>
      calculateBuyCapacity({
        side: "BUY",
        strategyEntryMin: 10.2,
        strategyEntryMax: 10.0,
        followerMaxDriftBps: 100,
        requestedNotional: 1,
        asks: SYNTHETIC_ASKS,
      }),
    ).toThrow();
  });
});

describe("buildCapacityCurve", () => {
  it("shows non-decreasing deviation as requested capital increases", () => {
    const curve = buildCapacityCurve(
      {
        side: "BUY",
        strategyEntryMin: 10.0,
        strategyEntryMax: 10.2,
        followerMaxDriftBps: 200,
        asks: SYNTHETIC_ASKS,
      },
      [100, 1000, 5000, 10000],
    );

    const deviations = curve.map((p) => p.expectedDeviationBps ?? 0);
    for (let i = 1; i < deviations.length; i++) {
      expect(deviations[i]).toBeGreaterThanOrEqual(deviations[i - 1]);
    }
  });
});
