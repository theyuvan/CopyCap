import { Router } from "express";
import { randomUUID } from "node:crypto";
import { buildCapacityCurve } from "@mirrorcap/capacity-engine";
import { applyLifecycleEvent, calculateRealizedClose, evaluateCopyability } from "@mirrorcap/strategy-engine";
import type { FollowerPolicy, Position, Strategy } from "@mirrorcap/shared-types";
import {
  addDailyOutflow,
  getDailyOutflow,
  getFollowerPolicy,
  getFollowersForStrategy,
  getPosition,
  getPositionsForStrategy,
  getStrategies,
  getStrategy,
  upsertFollowerPolicy,
  upsertPosition,
  upsertStrategy,
} from "../lib/store.js";
import { getOrderBookForMarket } from "../lib/orderbook.js";
import { tickStrategy } from "../lib/tick.js";

export const strategiesRouter = Router();

strategiesRouter.post("/", (req, res) => {
  const body = req.body as Partial<Strategy>;

  if (!body.creator || !body.market || body.entryMin === undefined || body.entryMax === undefined) {
    return res.status(400).json({ error: "creator, market, entryMin and entryMax are required." });
  }
  if (!body.entryExpiresAt) {
    return res.status(400).json({ error: "entryExpiresAt is required (OVERALL.md #34: every strategy needs its own entry-validity window)." });
  }

  const strategy: Strategy = {
    id: randomUUID(),
    creator: body.creator,
    market: body.market,
    strategyType: "MOMENTUM_BREAKOUT",
    breakoutLevel: body.breakoutLevel ?? body.entryMin,
    entryMin: body.entryMin,
    entryMax: body.entryMax,
    targetMin: body.targetMin,
    targetMax: body.targetMax,
    stopLevel: body.stopLevel,
    entryExpiresAt: body.entryExpiresAt,
    strategyExpiresAt: body.strategyExpiresAt,
    description: body.description,
    maxStrategyNotional: body.maxStrategyNotional,
    createdAt: new Date().toISOString(),
    lifecycleState: "WAITING_FOR_ENTRY",
  };

  upsertStrategy(strategy);
  res.status(201).json(strategy);
});

strategiesRouter.get("/", async (_req, res) => {
  const strategies = getStrategies();
  const ticked = await Promise.all(strategies.map((s) => tickStrategy(s)));
  res.json(ticked.map(({ strategy, currentPrice }) => ({ ...strategy, currentPrice })));
});

strategiesRouter.get("/:id", async (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });

  const { strategy: ticked, currentPrice } = await tickStrategy(strategy);
  const positions = getPositionsForStrategy(ticked.id);
  res.json({ ...ticked, currentPrice, positions });
});

strategiesRouter.post("/:id/follow", (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });

  const body = req.body as Partial<FollowerPolicy>;
  if (!body.wallet || body.maxTradeNotional === undefined || body.maxDriftBps === undefined) {
    return res.status(400).json({ error: "wallet, maxTradeNotional and maxDriftBps are required." });
  }

  const existing = getFollowerPolicy(strategy.id, body.wallet);
  const policy: FollowerPolicy = {
    wallet: body.wallet,
    strategyId: strategy.id,
    maxTradeNotional: body.maxTradeNotional,
    maxDailyOutflow: body.maxDailyOutflow ?? body.maxTradeNotional,
    maxDriftBps: body.maxDriftBps,
    allowPartialFill: body.allowPartialFill ?? true,
    autoExecute: body.autoExecute ?? false,
    followedKolAt: existing?.followedKolAt ?? new Date().toISOString(),
    unfollowedAt: undefined,
  };

  upsertFollowerPolicy(policy);
  res.status(201).json(policy);
});

strategiesRouter.post("/:id/unfollow", (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });

  const { wallet } = req.body as { wallet?: string };
  if (!wallet) return res.status(400).json({ error: "wallet is required." });

  const existing = getFollowerPolicy(strategy.id, wallet);
  if (!existing) return res.status(404).json({ error: "Follower policy not found." });

  // Stops NEW strategies immediately; does not touch open positions (OVERALL.md #34 rule D).
  upsertFollowerPolicy({ ...existing, unfollowedAt: new Date().toISOString() });
  res.json({ ok: true });
});

strategiesRouter.get("/:id/analyze", async (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });

  const wallet = req.query.wallet as string | undefined;
  const requestedNotional = Number(req.query.notional ?? 0);

  if (!wallet) return res.status(400).json({ error: "wallet query param is required." });
  const follower = getFollowerPolicy(strategy.id, wallet);
  if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });
  if (!requestedNotional || requestedNotional <= 0) {
    return res.status(400).json({ error: "notional query param must be a positive number." });
  }

  const { strategy: ticked, currentPrice } = await tickStrategy(strategy);
  const book = await getOrderBookForMarket(ticked.market, ticked.breakoutLevel);
  const now = new Date();
  const dailyOutflowSoFar = getDailyOutflow(wallet, now);

  const evaluation = evaluateCopyability({
    strategy: ticked,
    follower,
    currentPrice: currentPrice ?? ticked.breakoutLevel,
    now,
    requestedNotional,
    dailyOutflowSoFarQuote: dailyOutflowSoFar,
    asks: book.asks,
  });

  const curvePoints = [100, 500, 1000, 5000, 10000, 20000].filter(
    (n) => n <= follower.maxTradeNotional * 4,
  );
  const capacityCurve = buildCapacityCurve(
    {
      side: "BUY",
      strategyEntryMin: ticked.entryMin,
      strategyEntryMax: ticked.entryMax,
      followerMaxDriftBps: follower.maxDriftBps,
      asks: book.asks,
    },
    curvePoints.length > 0 ? curvePoints : [requestedNotional],
  );

  res.json({
    strategy: ticked,
    follower,
    currentPrice,
    orderBookSource: book.source,
    evaluation,
    capacityCurve,
    suggestedCliCommand: `mm mirrorcap copy ${ticked.id} --amount ${requestedNotional}`,
  });
});

/**
 * Records a fill that already executed through MetaMask Agent Wallet.
 * Called by the agent-plugin's `copy` command AFTER `ctx.walletExecutor`
 * confirms the Kuru transaction — this endpoint never signs or submits
 * anything itself (OVERALL.md #17).
 */
strategiesRouter.post("/:id/positions", (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });

  const body = req.body as Partial<Position> & { wallet?: string };
  if (!body.wallet || body.entryAvgPrice === undefined || body.quoteSpent === undefined) {
    return res.status(400).json({ error: "wallet, entryAvgPrice and quoteSpent are required." });
  }

  const position: Position = {
    id: randomUUID(),
    strategyId: strategy.id,
    follower: body.wallet as `0x${string}`,
    entryExecutedAt: new Date().toISOString(),
    entryAvgPrice: body.entryAvgPrice,
    baseAmount: body.baseAmount ?? body.quoteSpent / body.entryAvgPrice,
    quoteSpent: body.quoteSpent,
    state: "POSITION_ACTIVE",
  };
  upsertPosition(position);
  addDailyOutflow(body.wallet, new Date(), body.quoteSpent);

  const nextState = applyLifecycleEvent(strategy, { type: "ENTRY_EXECUTED" });
  if (nextState !== strategy.lifecycleState) upsertStrategy({ ...strategy, lifecycleState: nextState });

  res.status(201).json(position);
});

strategiesRouter.post("/:id/positions/:positionId/close", (req, res) => {
  const position = getPosition(req.params.positionId);
  if (!position || position.strategyId !== req.params.id) {
    return res.status(404).json({ error: "Position not found." });
  }
  const { exitAvgPrice, quoteReceived } = req.body as { exitAvgPrice?: number; quoteReceived?: number };
  if (exitAvgPrice === undefined || quoteReceived === undefined) {
    return res.status(400).json({ error: "exitAvgPrice and quoteReceived are required." });
  }

  const { realizedPnlQuote, leaderFeeQuote } = calculateRealizedClose(position.quoteSpent, quoteReceived);
  const updated: Position = {
    ...position,
    exitExecutedAt: new Date().toISOString(),
    exitAvgPrice,
    quoteReceived,
    realizedPnlQuote,
    leaderFeeQuote,
    state: "CLOSED",
  };
  upsertPosition(updated);
  res.json(updated);
});

/** Explicit strategy-level close — never invented automatically on expiry (OVERALL.md #34 rule E). */
strategiesRouter.post("/:id/close", (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });

  const nextState = applyLifecycleEvent(strategy, { type: "MANUAL_CLOSE" });
  const updated = { ...strategy, lifecycleState: nextState };
  upsertStrategy(updated);
  res.json(updated);
});

strategiesRouter.get("/:id/followers", (req, res) => {
  res.json(getFollowersForStrategy(req.params.id));
});
