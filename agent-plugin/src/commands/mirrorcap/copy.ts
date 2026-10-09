import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { ethers } from "ethers";
import {
  AgentWalletSigner,
  MONAD_CHAIN_IDS,
  createProvider,
  getMarketParams,
  submitBoundedBuyOrder,
} from "@mirrorcap/kuru-client";
import { buildBoundedOrderParams } from "@mirrorcap/strategy-engine";
import { mirrorcapApi } from "../../lib/apiClient.js";

const inputs = {
  strategyId: {
    type: InputFieldType.Text,
    flag: "strategy-id",
    message: "Strategy id",
    required: true,
    prompt: true,
    index: 0,
  },
  wallet: {
    type: InputFieldType.Text,
    flag: "wallet",
    message: "Your Agent Wallet address",
    required: true,
    prompt: true,
  },
  amount: {
    type: InputFieldType.Text,
    flag: "amount",
    message: "Notional to copy with (quote units)",
    required: true,
    prompt: true,
    validate: (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? true : "must be a positive number"),
  },
} satisfies InputSchema;

/**
 * `mm mirrorcap copy <strategy-id> --wallet 0x... --amount 100`
 *
 * The only command in this plugin that moves funds. It re-runs the exact
 * same pre-trade evaluation `analyze` shows (KOL condition -> follower risk
 * -> live Kuru capacity), and REFUSES to submit anything unless the result
 * is COPYABLE/DEGRADING, or LIMITED_CAPACITY with the follower's own
 * partial-fill preference allowing a smaller bounded fill (OVERALL.md #9).
 *
 * Calldata is built with the real Kuru SDK (`IOC.placeMarket`); the actual
 * signature and broadcast happen exclusively through
 * `ctx.walletExecutor(...)` (`wallet-submit`) via `AgentWalletSigner` — this
 * process never holds a private key (OVERALL.md #17).
 */
export default class MirrorcapCopy extends PluginCommand<unknown> {
  static override description = "Execute a bounded Kuru copy of a strategy through MetaMask Agent Wallet.";
  // KNOWN HOST BUG (reported, not ours to fix): any plugin command declaring
  // the `wallet-submit` capability crashes with "window.addEventListener is
  // not a function" in @metamask/agent-wallet@7.1.0's beta plugin system —
  // reproduced identically in both headless and real interactive (PowerShell
  // TTY) terminals, and independent of requiresAuth/requiresInit (tried
  // both true and false; both crash the same way before execute() runs).
  // requiresAuth=true is kept because it IS independently verified to work
  // correctly when logged out (clean AUTH_FAILED, no crash) — see
  // agent-plugin/README.md "Known host limitation" for full evidence.
  static override requiresAuth = true;
  static override requiresInit = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "mirrorcap copy";

  async execute(io: CommandIO) {
    const resolved = await io.resolveInputs(inputs);
    const amount = Number(resolved.amount);

    const analysis = await mirrorcapApi.analyze(resolved.strategyId, resolved.wallet, amount);
    const { strategy, follower, evaluation } = analysis;
    const capacity = evaluation.capacity;

    const canProceed =
      evaluation.status === "COPYABLE" ||
      evaluation.status === "DEGRADING" ||
      (evaluation.status === "LIMITED_CAPACITY" && follower?.allowPartialFill && capacity?.executableNotional > 0);

    if (!canProceed || !capacity) {
      io.emit(`NOT EXECUTING — status ${evaluation.status}: ${evaluation.reason}`);
      return { executed: false, status: evaluation.status, reason: evaluation.reason };
    }

    const rpcUrl =
      strategy.market.network === "monad-mainnet"
        ? process.env.MONAD_MAINNET_RPC_URL
        : process.env.MONAD_TESTNET_RPC_URL;
    if (!rpcUrl) {
      const msg = `No RPC configured for ${strategy.market.network}; cannot build a real transaction. Set MONAD_TESTNET_RPC_URL / MONAD_MAINNET_RPC_URL.`;
      io.emit(`NOT EXECUTING — ${msg}`);
      return { executed: false, status: "OUTSIDE_POLICY", reason: msg };
    }

    const bounded = buildBoundedOrderParams(capacity, strategy.market.marketAddress, follower);
    io.emit(
      `Submitting bounded ${bounded.mode} buy: ${bounded.requestedQuoteNotional} quote, maxPrice ${bounded.maxPrice}, minAmountOut ${bounded.minAmountOut}.`,
    );

    const provider = createProvider(rpcUrl);
    const marketParams = await getMarketParams(provider, strategy.market.marketAddress);
    const chainId = strategy.market.network === "monad-mainnet" ? MONAD_CHAIN_IDS.mainnet : MONAD_CHAIN_IDS.testnet;

    const signer = new AgentWalletSigner(resolved.wallet, provider, async (tx) => {
      const executor = await this.ctx.walletExecutor(io, this.pluginCommandId);
      const result = await executor({
        kind: "transaction",
        chainId,
        transaction: {
          to: tx.to as string,
          data: tx.data as `0x${string}` | undefined,
          value: tx.value ? BigInt(ethers.BigNumber.from(tx.value).toString()) : undefined,
        },
        intent: {
          summary: `MirrorCap bounded copy of strategy ${strategy.id} (max ${bounded.maxPrice}, ${bounded.mode})`,
        } as never,
      });
      if (result.kind !== "transaction" || !result.hash) {
        throw new Error(result.failureDescription ?? "Agent Wallet did not return a transaction hash.");
      }
      return { hash: result.hash };
    });

    const receipt = await submitBoundedBuyOrder(signer, strategy.market.marketAddress, marketParams, bounded);

    // NOTE: recorded using the bounded-order estimate, not a decoded on-chain
    // fill. A production build should decode the OrderBook `Trade` event from
    // `receipt.logs` for the exact average fill price.
    const position = await mirrorcapApi.recordPosition(strategy.id, {
      wallet: resolved.wallet,
      entryAvgPrice: capacity.expectedAveragePrice,
      quoteSpent: bounded.requestedQuoteNotional,
      baseAmount: bounded.minAmountOut,
    });

    io.emit(`EXECUTED via Agent Wallet. tx=${receipt.transactionHash}`);
    return { executed: true, txHash: receipt.transactionHash, position };
  }
}
