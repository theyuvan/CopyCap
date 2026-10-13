import { Router } from "express";
import { randomUUID } from "node:crypto";
import { buildCapacityCurve } from "@mirrorcap/capacity-engine";
import { applyLifecycleEvent } from "@mirrorcap/strategy-engine";
import type { FollowerPolicy, Strategy } from "@mirrorcap/shared-types";
import {
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
import { tickStrategy } from "../lib/tick.js";
import { actingWallet, requirePrivyUser } from "../lib/auth.js";
import { asyncRoute } from "../lib/http.js";
import {
  evaluateForFollower,
  executeClose,
  executeCopy,
  getTradingWalletView,
  placeLimitSell,
  probePolicyGuardrail,
  provisionTradingWallet,
  sellNativeForQuote,
  withdrawToFollower,
} from "../lib/execution.js";

export const strategiesRouter = Router();

/** Strips the follower's Privy DID before a policy leaves the server. */
function publicFollower({ privyUserId: _privyUserId, ...rest }: FollowerPolicy) {
  return rest;
}

function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

strategiesRouter.post("/", requirePrivyUser, (req, res) => {
  const body = req.body as Partial<Strategy>;
  const creator = actingWallet(req, body.creator);
  if (!creator) return res.status(403).json({ error: "You can only create strategies as a wallet you control." });

  if (!body.market || body.entryMin === undefined || body.entryMax === undefined) {
    return res.status(400).json({ error: "market, entryMin and entryMax are required." });
  }
  if (!body.entryExpiresAt) {
    return res.status(400).json({ error: "entryExpiresAt is required: every strategy needs its own entry-validity window." });
  }

  const strategy: Strategy = {
    id: randomUUID(),
    creator,
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
    maxFollowers: body.maxFollowers,
    createdAt: new Date().toISOString(),
    lifecycleState: "WAITING_FOR_ENTRY",
  };

  upsertStrategy(strategy);
  res.status(201).json(strategy);
});

strategiesRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const ticked = await Promise.all(getStrategies().map((s) => tickStrategy(s)));
    res.json(ticked.map(({ strategy, currentPrice }) => ({ ...strategy, currentPrice })));
  }),
);

strategiesRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });

    const { strategy: ticked, currentPrice } = await tickStrategy(strategy);
    res.json({ ...ticked, currentPrice, positions: getPositionsForStrategy(ticked.id) });
  }),
);

/**
 * Follow (or update risk settings). Provisions the follower's Privy trading
 * wallet on first follow and (re)compiles its Privy policy from these limits,
 * so the limits are enforced at signing time, not only by this API.
 */
strategiesRouter.post(
  "/:id/follow",
  requirePrivyUser,
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });

    const body = req.body as Partial<FollowerPolicy>;
    const wallet = actingWallet(req, body.wallet);
    if (!wallet) return res.status(403).json({ error: "You can only follow as a wallet you control." });

    const maxTradeNotional = positiveNumber(body.maxTradeNotional);
    const maxDriftBps = Number(body.maxDriftBps);
    if (!maxTradeNotional || !Number.isFinite(maxDriftBps) || maxDriftBps < 0) {
      return res.status(400).json({ error: "maxTradeNotional must be positive and maxDriftBps non-negative." });
    }
    const maxDailyOutflow = body.maxDailyOutflow === undefined ? maxTradeNotional : positiveNumber(body.maxDailyOutflow);
    if (!maxDailyOutflow) return res.status(400).json({ error: "maxDailyOutflow must be positive." });

    const existing = getFollowerPolicy(strategy.id, wallet);
    if ((!existing || existing.unfollowedAt) && strategy.maxFollowers !== undefined) {
      const activeFollowerCount = getFollowersForStrategy(strategy.id).filter((f) => !f.unfollowedAt).length;
      if (activeFollowerCount >= strategy.maxFollowers) {
        return res.status(409).json({ error: `This strategy is full (${strategy.maxFollowers} follower cap reached).` });
      }
    }

    const policy: FollowerPolicy = {
      ...existing,
      wallet,
      strategyId: strategy.id,
      maxTradeNotional,
      maxDailyOutflow,
      maxDriftBps,
      allowPartialFill: body.allowPartialFill ?? existing?.allowPartialFill ?? true,
      autoExecute: body.autoExecute ?? existing?.autoExecute ?? false,
      followedKolAt: existing?.followedKolAt ?? new Date().toISOString(),
      unfollowedAt: undefined,
    };

    const provisioned = await provisionTradingWallet(strategy, policy, req.privyUser!.userId);
    res.status(existing ? 200 : 201).json(publicFollower(provisioned));
  }),
);

strategiesRouter.post("/:id/unfollow", requirePrivyUser, (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });

  const wallet = actingWallet(req, (req.body as { wallet?: string }).wallet);
  if (!wallet) return res.status(403).json({ error: "You can only unfollow as a wallet you control." });

  const existing = getFollowerPolicy(strategy.id, wallet);
  if (!existing) return res.status(404).json({ error: "Follower policy not found." });

  // Stops NEW entries immediately; open positions and the trading wallet's funds stay put.
  upsertFollowerPolicy({ ...existing, unfollowedAt: new Date().toISOString() });
  res.json({ ok: true });
});

strategiesRouter.get(
  "/:id/analyze",
  asyncRoute(async (req, res) => {
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

    const { strategy: ticked, currentPrice, book, evaluation } = await evaluateForFollower(
      strategy,
      follower,
      requestedNotional,
    );

    const curvePoints = [100, 500, 1000, 5000, 10000, 20000].filter((n) => n <= follower.maxTradeNotional * 4);
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
      follower: publicFollower(follower),
      currentPrice,
      orderBookSource: book.source,
      evaluation,
      capacityCurve,
    });
  }),
);

/** The follow's Privy trading wallet: address, live balances, and the policy rules Privy enforces on it. */
strategiesRouter.get(
  "/:id/follow/wallet",
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });
    const wallet = req.query.wallet as string | undefined;
    if (!wallet) return res.status(400).json({ error: "wallet query param is required." });
    const follower = getFollowerPolicy(strategy.id, wallet);
    if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });

    res.json(await getTradingWalletView(strategy, follower));
  }),
);

/** Executes the copy server-side from the follower's Privy trading wallet — no wallet popup, no local key. */
strategiesRouter.post(
  "/:id/copy",
  requirePrivyUser,
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });

    const { wallet: requested, notional } = req.body as { wallet?: string; notional?: number };
    const wallet = actingWallet(req, requested);
    if (!wallet) return res.status(403).json({ error: "You can only copy as a wallet you control." });
    const requestedNotional = positiveNumber(notional);
    if (!requestedNotional) return res.status(400).json({ error: "notional must be a positive number." });

    const follower = getFollowerPolicy(strategy.id, wallet);
    if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });

    res.status(201).json(await executeCopy(strategy, follower, requestedNotional));
  }),
);

/**
 * Manually sells native MON straight out of the trading wallet for the
 * market's quote token — a real on-chain sell, same mechanics as closing a
 * position, but not tied to one. Exists to turn idle MON into spendable
 * quote balance (e.g. before a first real `/copy` buy) without a faucet.
 */
strategiesRouter.post(
  "/:id/follow/sell",
  requirePrivyUser,
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });

    const { wallet: requested, size } = req.body as { wallet?: string; size?: number };
    const wallet = actingWallet(req, requested);
    if (!wallet) return res.status(403).json({ error: "You can only sell as a wallet you control." });
    const requestedSize = positiveNumber(size);
    if (!requestedSize) return res.status(400).json({ error: "size must be a positive number." });

    const follower = getFollowerPolicy(strategy.id, wallet);
    if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });

    res.status(201).json(await sellNativeForQuote(strategy, follower, requestedSize));
  }),
);

/**
 * Places a REAL GTC limit sell from the trading wallet — confirmed on-chain
 * at placement regardless of book depth, unlike `/follow/sell` (a market
 * order, which needs live bids to fill). Use this when the book's bid side
 * is empty: the order rests, same as any maker order.
 */
strategiesRouter.post(
  "/:id/follow/limit-sell",
  requirePrivyUser,
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });

    const { wallet: requested, size, price } = req.body as { wallet?: string; size?: number; price?: number };
    const wallet = actingWallet(req, requested);
    if (!wallet) return res.status(403).json({ error: "You can only sell as a wallet you control." });
    const requestedSize = positiveNumber(size);
    if (!requestedSize) return res.status(400).json({ error: "size must be a positive number." });
    const requestedPrice = positiveNumber(price);
    if (!requestedPrice) return res.status(400).json({ error: "price must be a positive number." });

    const follower = getFollowerPolicy(strategy.id, wallet);
    if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });

    res.status(201).json(await placeLimitSell(strategy, follower, { size: requestedSize, price: requestedPrice }));
  }),
);

strategiesRouter.post(
  "/:id/follow/withdraw",
  requirePrivyUser,
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });
    const wallet = actingWallet(req, (req.body as { wallet?: string }).wallet);
    if (!wallet) return res.status(403).json({ error: "You can only withdraw to a wallet you control." });
    const follower = getFollowerPolicy(strategy.id, wallet);
    if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });

    res.json(await withdrawToFollower(strategy, follower));
  }),
);

/** Proves the cap is enforced by Privy itself: asks it to sign an approve one unit over the cap. */
strategiesRouter.post(
  "/:id/follow/guardrail-test",
  requirePrivyUser,
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });
    const wallet = actingWallet(req, (req.body as { wallet?: string }).wallet);
    if (!wallet) return res.status(403).json({ error: "You can only test a wallet you control." });
    const follower = getFollowerPolicy(strategy.id, wallet);
    if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });

    res.json(await probePolicyGuardrail(strategy, follower));
  }),
);

/** Closes a position with a real on-chain market sell from the follower's Privy trading wallet — no client-supplied fill price. */
strategiesRouter.post(
  "/:id/positions/:positionId/close",
  requirePrivyUser,
  asyncRoute(async (req, res) => {
    const strategy = getStrategy(req.params.id);
    if (!strategy) return res.status(404).json({ error: "Strategy not found." });
    const position = getPosition(req.params.positionId);
    if (!position || position.strategyId !== req.params.id) {
      return res.status(404).json({ error: "Position not found." });
    }
    if (!actingWallet(req, position.follower)) {
      return res.status(403).json({ error: "Only the follower who opened this position can close it." });
    }
    const follower = getFollowerPolicy(strategy.id, position.follower);
    if (!follower) return res.status(404).json({ error: "This wallet is not following this strategy." });

    const { position: updated, txHash } = await executeClose(strategy, follower, position);
    res.json({ ...updated, txHash });
  }),
);

/** Explicit strategy-level close by its creator — never invented automatically on expiry. */
strategiesRouter.post("/:id/close", requirePrivyUser, (req, res) => {
  const strategy = getStrategy(req.params.id);
  if (!strategy) return res.status(404).json({ error: "Strategy not found." });
  if (!actingWallet(req, strategy.creator)) {
    return res.status(403).json({ error: "Only the strategy's creator can close it." });
  }

  const updated = { ...strategy, lifecycleState: applyLifecycleEvent(strategy, { type: "MANUAL_CLOSE" }) };
  upsertStrategy(updated);
  res.json(updated);
});

strategiesRouter.get("/:id/followers", (req, res) => {
  res.json(getFollowersForStrategy(req.params.id).map(publicFollower));
});
