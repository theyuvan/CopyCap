import { createHash, randomUUID } from "node:crypto";
import { ethers, type ContractReceipt } from "ethers";
import {
  LIMIT_SELL_ABI_FRAGMENT,
  MARKET_BUY_ABI_FRAGMENT,
  MARKET_SELL_ABI_FRAGMENT,
  MONAD_CHAIN_IDS,
  RelaySigner,
  createProvider,
  encodeQuoteCap,
  getMarketParams,
  normalizeBoundedBuy,
  normalizeBoundedSell,
  placeLimitSellOrder,
  submitBoundedBuyOrder,
  submitBoundedSellOrder,
  type MarketParams,
  type RelayTransaction,
} from "@mirrorcap/kuru-client";
import { calculateSellCapacity } from "@mirrorcap/capacity-engine";
import { PrivyApiError, compileTradingPolicy, type EvmTransaction } from "@mirrorcap/privy-client";
import {
  applyLifecycleEvent,
  buildBoundedOrderParams,
  buildBoundedSellOrderParams,
  calculateRealizedClose,
  evaluateCopyability,
} from "@mirrorcap/strategy-engine";
import type { Address, FollowerPolicy, MarketRef, Position, Strategy } from "@mirrorcap/shared-types";
import { getOrderBookForMarket, rpcUrlFor } from "./orderbook.js";
import { getPrivy } from "./privy.js";
import { addDailyOutflow, getDailyOutflow, upsertFollowerPolicy, upsertPosition, upsertStrategy } from "./store.js";
import { tickStrategy } from "./tick.js";

/** An expected refusal with a stable code and the HTTP status the API should answer with. */
export class ExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 409,
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

interface MarketContext {
  provider: ethers.providers.JsonRpcProvider;
  marketParams: MarketParams;
  chainId: number;
  quoteToken: ethers.Contract;
}

async function loadMarketContext(market: MarketRef): Promise<MarketContext> {
  const rpcUrl = rpcUrlFor(market.network);
  if (!rpcUrl) {
    throw new ExecutionError(
      "RPC_NOT_CONFIGURED",
      `No RPC configured for ${market.network}. Set MONAD_TESTNET_RPC_URL / MONAD_MAINNET_RPC_URL.`,
      503,
    );
  }
  const provider = createProvider(rpcUrl);
  const marketParams = await getMarketParams(provider, market.marketAddress);
  if (marketParams.quoteAssetAddress === ethers.constants.AddressZero) {
    throw new ExecutionError("UNSUPPORTED_MARKET", "Markets quoted in the native token are not supported yet.", 422);
  }
  return {
    provider,
    marketParams,
    chainId: market.network === "monad-mainnet" ? MONAD_CHAIN_IDS.mainnet : MONAD_CHAIN_IDS.testnet,
    quoteToken: new ethers.Contract(marketParams.quoteAssetAddress, ERC20_ABI, provider),
  };
}

function followKey(strategyId: string, wallet: string): string {
  return createHash("sha256").update(`${strategyId}:${wallet.toLowerCase()}`).digest("hex").slice(0, 40);
}

/**
 * Creates (or re-syncs) the Privy trading wallet for one follow and the
 * policy that bounds it. Re-running with changed risk settings updates the
 * live Privy policy, so enforcement always matches what the follower set.
 */
export async function provisionTradingWallet(
  strategy: Strategy,
  follower: FollowerPolicy,
  privyUserId: string,
): Promise<FollowerPolicy> {
  const privy = getPrivy();
  const ctx = await loadMarketContext(strategy.market);
  const caps = encodeQuoteCap(ctx.marketParams, follower.maxTradeNotional);
  const policy = compileTradingPolicy({
    name: `CopyCap ${strategy.id.slice(0, 8)} ${follower.wallet.slice(0, 10)}`,
    chainId: ctx.chainId,
    marketAddress: ethers.utils.getAddress(strategy.market.marketAddress) as Address,
    quoteTokenAddress: ethers.utils.getAddress(ctx.marketParams.quoteAssetAddress) as Address,
    ownerWallet: ethers.utils.getAddress(follower.wallet) as Address,
    maxTradeQuoteUnits: caps.approveUnits,
    maxTradeQuoteSizeUnits: caps.quoteSizeUnits,
    marketBuyAbi: MARKET_BUY_ABI_FRAGMENT,
    entryExpiresAtUnix: Math.floor(Date.parse(strategy.entryExpiresAt) / 1000),
    marketSellAbi: MARKET_SELL_ABI_FRAGMENT,
    limitSellAbi: LIMIT_SELL_ABI_FRAGMENT,
  });

  const privyPolicyId = follower.privyPolicyId
    ? (await privy.updatePolicy(follower.privyPolicyId, { name: policy.name, rules: policy.rules })).id
    : (await privy.createPolicy(policy)).id;

  let { tradingWalletId, tradingWalletAddress } = follower;
  if (!tradingWalletId) {
    const key = followKey(strategy.id, follower.wallet);
    const wallet = await privy.createWallet({
      displayName: `CopyCap trading wallet · ${strategy.market.symbol}`,
      externalId: `cc-${key}`,
      policyIds: [privyPolicyId],
      idempotencyKey: `cc-wallet-${key}`,
    });
    tradingWalletId = wallet.id;
    tradingWalletAddress = ethers.utils.getAddress(wallet.address) as Address;
  }

  const updated: FollowerPolicy = { ...follower, privyUserId, privyPolicyId, tradingWalletId, tradingWalletAddress };
  upsertFollowerPolicy(updated);
  return updated;
}

function toPrivyTransaction(tx: RelayTransaction, chainId: number): EvmTransaction {
  const hex = (v?: ethers.BigNumber) => (v ? ethers.utils.hexValue(v) : undefined);
  return {
    to: tx.to as Address,
    data: tx.data,
    value: hex(tx.value) ?? "0x0",
    gas_limit: hex(tx.gasLimit),
    gas_price: hex(tx.gasPrice),
    max_fee_per_gas: hex(tx.maxFeePerGas),
    max_priority_fee_per_gas: hex(tx.maxPriorityFeePerGas),
    nonce: tx.nonce,
    chain_id: chainId,
  };
}

function privySubmitter(walletId: string, chainId: number) {
  return async (tx: RelayTransaction) => {
    try {
      return await getPrivy().sendTransaction(walletId, toPrivyTransaction(tx, chainId));
    } catch (err) {
      if (err instanceof PrivyApiError && err.isPolicyViolation) {
        throw new ExecutionError("PRIVY_POLICY_DENIED", `Privy's policy engine refused to sign: ${err.message}`, 403);
      }
      throw err;
    }
  };
}

export interface TradingWalletView {
  address: Address;
  network: MarketRef["network"];
  quote: { symbol: string; address: Address; decimals: number; balance: number };
  native: { symbol: "MON"; balance: number };
  privyPolicyId?: string;
  rules: Array<{ name: string; action: string }>;
}

export async function getTradingWalletView(strategy: Strategy, follower: FollowerPolicy): Promise<TradingWalletView> {
  if (!follower.tradingWalletAddress) {
    throw new ExecutionError("NO_TRADING_WALLET", "This follow has no trading wallet yet.", 404);
  }
  const ctx = await loadMarketContext(strategy.market);
  const [quoteRaw, quoteSymbol, nativeRaw, policy] = await Promise.all([
    ctx.quoteToken.balanceOf(follower.tradingWalletAddress) as Promise<ethers.BigNumber>,
    ctx.quoteToken.symbol() as Promise<string>,
    ctx.provider.getBalance(follower.tradingWalletAddress),
    follower.privyPolicyId ? getPrivy().getPolicy(follower.privyPolicyId) : Promise.resolve(undefined),
  ]);
  return {
    address: follower.tradingWalletAddress,
    network: strategy.market.network,
    quote: {
      symbol: quoteSymbol,
      address: ethers.utils.getAddress(ctx.marketParams.quoteAssetAddress) as Address,
      decimals: ctx.marketParams.quoteAssetDecimals.toNumber(),
      balance: Number(ethers.utils.formatUnits(quoteRaw, ctx.marketParams.quoteAssetDecimals)),
    },
    native: { symbol: "MON", balance: Number(ethers.utils.formatEther(nativeRaw)) },
    privyPolicyId: follower.privyPolicyId,
    rules: (policy?.rules ?? []).map((r) => ({ name: r.name, action: r.action })),
  };
}

/** Same three-layer gate the UI shows: KOL condition, follower risk, live Kuru capacity. */
export async function evaluateForFollower(strategy: Strategy, follower: FollowerPolicy, requestedNotional: number) {
  const { strategy: ticked, currentPrice } = await tickStrategy(strategy);
  const book = await getOrderBookForMarket(ticked.market, ticked.breakoutLevel);
  const now = new Date();
  const evaluation = evaluateCopyability({
    strategy: ticked,
    follower,
    currentPrice: currentPrice ?? ticked.breakoutLevel,
    now,
    requestedNotional,
    dailyOutflowSoFarQuote: getDailyOutflow(follower.wallet, now),
    asks: book.asks,
  });
  return { strategy: ticked, currentPrice, book, evaluation };
}

const inFlight = new Set<string>();

/**
 * Copies a strategy entry for one follower: re-runs the pre-trade gate,
 * then signs and sends the bounded Kuru order from the follower's Privy
 * trading wallet. Privy checks every transaction against the wallet's policy
 * before signing, independently of the checks here.
 */
export async function executeCopy(
  strategy: Strategy,
  follower: FollowerPolicy,
  requestedNotional: number,
): Promise<{ position: Position; txHash: string }> {
  if (!follower.tradingWalletId || !follower.tradingWalletAddress) {
    throw new ExecutionError("NO_TRADING_WALLET", "Follow this strategy first to get a trading wallet.", 409);
  }
  const lockKey = `${strategy.id}:${follower.wallet.toLowerCase()}`;
  if (inFlight.has(lockKey)) {
    throw new ExecutionError("COPY_IN_PROGRESS", "A copy for this follow is already being executed.", 409);
  }
  inFlight.add(lockKey);
  try {
    const { strategy: ticked, book, evaluation } = await evaluateForFollower(strategy, follower, requestedNotional);
    if (book.source !== "live-kuru") {
      throw new ExecutionError("NO_LIVE_BOOK", "Live Kuru order book unavailable — refusing to trade on synthetic data.", 503);
    }
    const capacity = evaluation.capacity;
    const canProceed =
      evaluation.status === "COPYABLE" ||
      evaluation.status === "DEGRADING" ||
      (evaluation.status === "LIMITED_CAPACITY" && follower.allowPartialFill && (capacity?.executableNotional ?? 0) > 0);
    if (!canProceed || !capacity) {
      throw new ExecutionError(`NOT_COPYABLE_${evaluation.status}`, evaluation.reason, 409);
    }

    const ctx = await loadMarketContext(ticked.market);
    const bounded = normalizeBoundedBuy(
      ctx.marketParams,
      buildBoundedOrderParams(capacity, ticked.market.marketAddress, follower),
    );
    if (bounded.requestedQuoteNotional <= 0) {
      throw new ExecutionError("AMOUNT_TOO_SMALL", "Executable amount rounds to zero on this market.", 422);
    }

    const [quoteBalance, nativeBalance] = await Promise.all([
      ctx.quoteToken.balanceOf(follower.tradingWalletAddress) as Promise<ethers.BigNumber>,
      ctx.provider.getBalance(follower.tradingWalletAddress),
    ]);
    const needed = ethers.utils.parseUnits(
      bounded.requestedQuoteNotional.toFixed(ctx.marketParams.quoteAssetDecimals.toNumber()),
      ctx.marketParams.quoteAssetDecimals,
    );
    if (quoteBalance.lt(needed)) {
      throw new ExecutionError(
        "INSUFFICIENT_FUNDS",
        `Trading wallet holds ${ethers.utils.formatUnits(quoteBalance, ctx.marketParams.quoteAssetDecimals)} but this copy needs ${bounded.requestedQuoteNotional}. Fund ${follower.tradingWalletAddress} first.`,
        409,
      );
    }
    if (nativeBalance.isZero()) {
      throw new ExecutionError("NO_GAS", `Trading wallet has no MON for gas. Send a little MON to ${follower.tradingWalletAddress}.`, 409);
    }

    const signer = new RelaySigner(
      follower.tradingWalletAddress,
      ctx.provider,
      privySubmitter(follower.tradingWalletId, ctx.chainId),
    );
    const receipt = await submitBoundedBuyOrder(signer, ticked.market.marketAddress, ctx.marketParams, bounded);

    // Entry price is the bounded estimate the gate approved, not a decoded fill event.
    const position: Position = {
      id: randomUUID(),
      strategyId: ticked.id,
      follower: follower.wallet,
      entryExecutedAt: new Date().toISOString(),
      entryAvgPrice: capacity.expectedAveragePrice ?? bounded.maxPrice,
      baseAmount: bounded.minAmountOut,
      quoteSpent: bounded.requestedQuoteNotional,
      entryTxHash: receipt.transactionHash,
      state: "POSITION_ACTIVE",
    };
    upsertPosition(position);
    addDailyOutflow(follower.wallet, new Date(), bounded.requestedQuoteNotional);
    const nextState = applyLifecycleEvent(ticked, { type: "ENTRY_EXECUTED" });
    if (nextState !== ticked.lifecycleState) upsertStrategy({ ...ticked, lifecycleState: nextState });

    return { position, txHash: receipt.transactionHash };
  } finally {
    inFlight.delete(lockKey);
  }
}

const ERC20_TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");

/**
 * Reads the actual quote-token proceeds from the sell receipt's Transfer
 * logs, rather than trusting the pre-trade estimate. Returns null if no
 * matching Transfer is found (e.g. an unexpected log shape), in which case
 * the caller falls back to the bounded estimate.
 */
function decodeQuoteReceived(receipt: ContractReceipt, quoteTokenAddress: string, walletAddress: string, quoteDecimals: number): number | null {
  let total = ethers.constants.Zero;
  let found = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== quoteTokenAddress.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER_TOPIC || log.topics.length < 3) continue;
    const to = ethers.utils.getAddress(`0x${log.topics[2].slice(26)}`);
    if (to.toLowerCase() !== walletAddress.toLowerCase()) continue;
    total = total.add(ethers.BigNumber.from(log.data));
    found = true;
  }
  return found ? Number(ethers.utils.formatUnits(total, quoteDecimals)) : null;
}

/**
 * Closes a follower's position with a real on-chain market sell: re-runs the
 * sell-side capacity gate against the live book, then signs and sends the
 * bounded Kuru sell from the follower's Privy trading wallet. The realized
 * quote proceeds are read back from the transaction's own Transfer logs, not
 * trusted from the caller — this never accepts a client-supplied fill price.
 */
export async function executeClose(
  strategy: Strategy,
  follower: FollowerPolicy,
  position: Position,
): Promise<{ position: Position; txHash: string }> {
  if (!follower.tradingWalletId || !follower.tradingWalletAddress) {
    throw new ExecutionError("NO_TRADING_WALLET", "This follow has no trading wallet.", 409);
  }
  if (position.state !== "POSITION_ACTIVE" && position.state !== "EXIT_ACTIVE") {
    throw new ExecutionError("POSITION_NOT_ACTIVE", "This position is not open.", 409);
  }
  const lockKey = `close:${position.id}`;
  if (inFlight.has(lockKey)) {
    throw new ExecutionError("CLOSE_IN_PROGRESS", "A close for this position is already being executed.", 409);
  }
  inFlight.add(lockKey);
  try {
    const ctx = await loadMarketContext(strategy.market);
    if (ctx.marketParams.baseAssetAddress !== ethers.constants.AddressZero) {
      throw new ExecutionError(
        "UNSUPPORTED_MARKET",
        "Real on-chain closes are only implemented for markets whose base asset is the native token.",
        422,
      );
    }

    const book = await getOrderBookForMarket(strategy.market, position.entryAvgPrice);
    if (book.source !== "live-kuru") {
      throw new ExecutionError("NO_LIVE_BOOK", "Live Kuru order book unavailable — refusing to trade on synthetic data.", 503);
    }
    if (book.bids.length === 0) {
      throw new ExecutionError("NO_BIDS", "No live bids available to sell into right now.", 503);
    }

    const referencePrice = book.bids[0].price;
    const capacity = calculateSellCapacity({
      followerMaxDriftBps: follower.maxDriftBps,
      referencePrice,
      requestedSize: position.baseAmount,
      bids: book.bids,
    });
    const canProceed =
      capacity.status === "COPYABLE" ||
      capacity.status === "DEGRADING" ||
      (capacity.status === "LIMITED_CAPACITY" && follower.allowPartialFill && capacity.executableSize > 0);
    if (!canProceed) {
      throw new ExecutionError(`NOT_CLOSABLE_${capacity.status}`, capacity.reason, 409);
    }

    const bounded = normalizeBoundedSell(
      ctx.marketParams,
      buildBoundedSellOrderParams(capacity, strategy.market.marketAddress, follower),
    );
    if (bounded.size <= 0) {
      throw new ExecutionError("AMOUNT_TOO_SMALL", "Executable amount rounds to zero on this market.", 422);
    }

    const nativeBalance = await ctx.provider.getBalance(follower.tradingWalletAddress);
    const sellValue = ethers.utils.parseUnits(
      bounded.size.toFixed(ctx.marketParams.baseAssetDecimals.toNumber()),
      ctx.marketParams.baseAssetDecimals,
    );
    if (nativeBalance.lte(sellValue)) {
      throw new ExecutionError(
        "INSUFFICIENT_FUNDS",
        `Trading wallet holds ${ethers.utils.formatEther(nativeBalance)} MON but this close needs ${bounded.size} plus gas.`,
        409,
      );
    }

    const signer = new RelaySigner(
      follower.tradingWalletAddress,
      ctx.provider,
      privySubmitter(follower.tradingWalletId, ctx.chainId),
    );
    const receipt = await submitBoundedSellOrder(signer, strategy.market.marketAddress, ctx.marketParams, bounded);

    const quoteDecimals = ctx.marketParams.quoteAssetDecimals.toNumber();
    const quoteReceived =
      decodeQuoteReceived(receipt, ctx.marketParams.quoteAssetAddress, follower.tradingWalletAddress, quoteDecimals) ??
      bounded.minAmountOut;

    const { realizedPnlQuote, leaderFeeQuote } = calculateRealizedClose(position.quoteSpent, quoteReceived);
    const updated: Position = {
      ...position,
      exitExecutedAt: new Date().toISOString(),
      exitAvgPrice: quoteReceived / bounded.size,
      quoteReceived,
      realizedPnlQuote,
      leaderFeeQuote,
      exitTxHash: receipt.transactionHash,
      state: "CLOSED",
    };
    upsertPosition(updated);

    return { position: updated, txHash: receipt.transactionHash };
  } finally {
    inFlight.delete(lockKey);
  }
}

/**
 * Sells native MON straight out of the trading wallet for the market's
 * quote token — a real on-chain market sell, same as `executeClose`, but NOT
 * tied to a tracked `Position` or a copy decision. This exists for the case
 * where a trading wallet holds MON (e.g. gas top-up, or MON sent directly)
 * but no quote token yet, so a first real BUY has nothing to spend: this
 * turns some of that MON into spendable quote balance with one real tx,
 * rather than requiring a faucet for the quote token.
 */
export async function sellNativeForQuote(
  strategy: Strategy,
  follower: FollowerPolicy,
  requestedSize: number,
): Promise<{ txHash: string; size: number; quoteReceived: number; averagePrice: number }> {
  if (!follower.tradingWalletId || !follower.tradingWalletAddress) {
    throw new ExecutionError("NO_TRADING_WALLET", "Follow this strategy first to get a trading wallet.", 409);
  }
  if (requestedSize <= 0) {
    throw new ExecutionError("AMOUNT_TOO_SMALL", "requestedSize must be positive.", 422);
  }
  const lockKey = `sell:${follower.wallet.toLowerCase()}`;
  if (inFlight.has(lockKey)) {
    throw new ExecutionError("SELL_IN_PROGRESS", "A sell for this wallet is already being executed.", 409);
  }
  inFlight.add(lockKey);
  try {
    const ctx = await loadMarketContext(strategy.market);
    if (ctx.marketParams.baseAssetAddress !== ethers.constants.AddressZero) {
      throw new ExecutionError(
        "UNSUPPORTED_MARKET",
        "Real on-chain sells are only implemented for markets whose base asset is the native token.",
        422,
      );
    }

    // referencePrice only matters for the synthetic fallback, which is refused below anyway.
    const book = await getOrderBookForMarket(strategy.market, 1);
    if (book.source !== "live-kuru") {
      throw new ExecutionError("NO_LIVE_BOOK", "Live Kuru order book unavailable — refusing to trade on synthetic data.", 503);
    }
    if (book.bids.length === 0) {
      throw new ExecutionError("NO_BIDS", "No live bids available to sell into right now.", 503);
    }

    const referencePrice = book.bids[0].price;
    const capacity = calculateSellCapacity({
      followerMaxDriftBps: follower.maxDriftBps,
      referencePrice,
      requestedSize,
      bids: book.bids,
    });
    const canProceed =
      capacity.status === "COPYABLE" ||
      capacity.status === "DEGRADING" ||
      (capacity.status === "LIMITED_CAPACITY" && follower.allowPartialFill && capacity.executableSize > 0);
    if (!canProceed) {
      throw new ExecutionError(`NOT_SELLABLE_${capacity.status}`, capacity.reason, 409);
    }

    const bounded = normalizeBoundedSell(
      ctx.marketParams,
      buildBoundedSellOrderParams(capacity, strategy.market.marketAddress, follower),
    );
    if (bounded.size <= 0) {
      throw new ExecutionError("AMOUNT_TOO_SMALL", "Executable amount rounds to zero on this market.", 422);
    }

    const nativeBalance = await ctx.provider.getBalance(follower.tradingWalletAddress);
    const sellValue = ethers.utils.parseUnits(
      bounded.size.toFixed(ctx.marketParams.baseAssetDecimals.toNumber()),
      ctx.marketParams.baseAssetDecimals,
    );
    if (nativeBalance.lte(sellValue)) {
      throw new ExecutionError(
        "INSUFFICIENT_FUNDS",
        `Trading wallet holds ${ethers.utils.formatEther(nativeBalance)} MON but this sell needs ${bounded.size} plus gas. Send MON to ${follower.tradingWalletAddress} first.`,
        409,
      );
    }

    const signer = new RelaySigner(
      follower.tradingWalletAddress,
      ctx.provider,
      privySubmitter(follower.tradingWalletId, ctx.chainId),
    );
    const receipt = await submitBoundedSellOrder(signer, strategy.market.marketAddress, ctx.marketParams, bounded);

    const quoteDecimals = ctx.marketParams.quoteAssetDecimals.toNumber();
    const quoteReceived =
      decodeQuoteReceived(receipt, ctx.marketParams.quoteAssetAddress, follower.tradingWalletAddress, quoteDecimals) ??
      bounded.minAmountOut;

    return {
      txHash: receipt.transactionHash,
      size: bounded.size,
      quoteReceived,
      averagePrice: quoteReceived / bounded.size,
    };
  } finally {
    inFlight.delete(lockKey);
  }
}

/**
 * Places a REAL GTC limit sell — a resting maker order, confirmed on-chain
 * at placement regardless of whether it's ever matched. Unlike
 * `sellNativeForQuote` (an IOC market sell, which needs live bid depth to
 * fill and refuses outright when the book has none), this succeeds even on
 * a thin/empty book: it just rests there, same as any maker order, and is
 * exactly as real and on-chain-verifiable as a filled trade.
 */
export async function placeLimitSell(
  strategy: Strategy,
  follower: FollowerPolicy,
  params: { size: number; price: number },
): Promise<{ txHash: string; size: number; price: number }> {
  if (!follower.tradingWalletId || !follower.tradingWalletAddress) {
    throw new ExecutionError("NO_TRADING_WALLET", "Follow this strategy first to get a trading wallet.", 409);
  }
  if (params.size <= 0 || params.price <= 0) {
    throw new ExecutionError("AMOUNT_TOO_SMALL", "size and price must both be positive.", 422);
  }
  const lockKey = `limit-sell:${follower.wallet.toLowerCase()}`;
  if (inFlight.has(lockKey)) {
    throw new ExecutionError("SELL_IN_PROGRESS", "A sell for this wallet is already being executed.", 409);
  }
  inFlight.add(lockKey);
  try {
    const ctx = await loadMarketContext(strategy.market);
    if (ctx.marketParams.baseAssetAddress !== ethers.constants.AddressZero) {
      throw new ExecutionError(
        "UNSUPPORTED_MARKET",
        "Real on-chain sells are only implemented for markets whose base asset is the native token.",
        422,
      );
    }

    const nativeBalance = await ctx.provider.getBalance(follower.tradingWalletAddress);
    const sellValue = ethers.utils.parseUnits(
      params.size.toFixed(ctx.marketParams.baseAssetDecimals.toNumber()),
      ctx.marketParams.baseAssetDecimals,
    );
    if (nativeBalance.lte(sellValue)) {
      throw new ExecutionError(
        "INSUFFICIENT_FUNDS",
        `Trading wallet holds ${ethers.utils.formatEther(nativeBalance)} MON but this order needs ${params.size} plus gas. Send MON to ${follower.tradingWalletAddress} first.`,
        409,
      );
    }

    const signer = new RelaySigner(
      follower.tradingWalletAddress,
      ctx.provider,
      privySubmitter(follower.tradingWalletId, ctx.chainId),
    );
    const receipt = await placeLimitSellOrder(signer, strategy.market.marketAddress, ctx.marketParams, {
      price: params.price,
      size: params.size,
    });

    return { txHash: receipt.transactionHash, size: params.size, price: params.price };
  } finally {
    inFlight.delete(lockKey);
  }
}

/** Sends everything in the trading wallet back to the follower — the only destination its policy allows. */
export async function withdrawToFollower(
  strategy: Strategy,
  follower: FollowerPolicy,
): Promise<{ quoteTxHash?: string; nativeTxHash?: string }> {
  if (!follower.tradingWalletId || !follower.tradingWalletAddress) {
    throw new ExecutionError("NO_TRADING_WALLET", "This follow has no trading wallet.", 404);
  }
  const ctx = await loadMarketContext(strategy.market);
  const submit = privySubmitter(follower.tradingWalletId, ctx.chainId);
  const result: { quoteTxHash?: string; nativeTxHash?: string } = {};

  const quoteBalance = (await ctx.quoteToken.balanceOf(follower.tradingWalletAddress)) as ethers.BigNumber;
  if (quoteBalance.gt(0)) {
    const data = ctx.quoteToken.interface.encodeFunctionData("transfer", [follower.wallet, quoteBalance]);
    const { hash } = await submit({ to: ctx.quoteToken.address, data });
    await waitOrThrow(ctx.provider, hash);
    result.quoteTxHash = hash;
  }

  const gasPrice = await ctx.provider.getGasPrice();
  const gasLimit = ethers.BigNumber.from(21_000);
  // Headroom for gas-price drift between quoting and inclusion.
  const fee = gasPrice.mul(gasLimit).mul(12).div(10);
  const nativeBalance = await ctx.provider.getBalance(follower.tradingWalletAddress);
  if (nativeBalance.gt(fee)) {
    const { hash } = await submit({ to: follower.wallet, value: nativeBalance.sub(fee), gasLimit, gasPrice });
    await waitOrThrow(ctx.provider, hash);
    result.nativeTxHash = hash;
  }

  if (!result.quoteTxHash && !result.nativeTxHash) {
    throw new ExecutionError("NOTHING_TO_WITHDRAW", "The trading wallet is already empty.", 409);
  }
  return result;
}

/**
 * Asks Privy to sign an approve one unit above the follower's per-trade cap.
 * Privy's policy should refuse it before anything is signed; nothing moves
 * either way, since an approve transfers no funds.
 */
export async function probePolicyGuardrail(
  strategy: Strategy,
  follower: FollowerPolicy,
): Promise<{ refused: boolean; message: string; txHash?: string }> {
  if (!follower.tradingWalletId) {
    throw new ExecutionError("NO_TRADING_WALLET", "Follow this strategy first to get a trading wallet.", 409);
  }
  const ctx = await loadMarketContext(strategy.market);
  const overCap = encodeQuoteCap(ctx.marketParams, follower.maxTradeNotional).approveUnits + 1n;
  const data = ctx.quoteToken.interface.encodeFunctionData("approve", [strategy.market.marketAddress, overCap]);
  try {
    const { hash } = await getPrivy().sendTransaction(follower.tradingWalletId, {
      to: ctx.quoteToken.address as Address,
      data,
      value: "0x0",
      chain_id: ctx.chainId,
    });
    return { refused: false, message: "Privy signed an over-cap approve — the policy is not enforcing the cap.", txHash: hash };
  } catch (err) {
    if (err instanceof PrivyApiError && err.isPolicyViolation) {
      return { refused: true, message: err.message };
    }
    throw err;
  }
}

async function waitOrThrow(provider: ethers.providers.Provider, hash: string) {
  const receipt = await provider.waitForTransaction(hash, 1);
  if (receipt.status === 0) throw new ExecutionError("TX_REVERTED", `Transaction ${hash} reverted.`, 502);
}
