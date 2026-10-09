import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { MONAD_CHAIN_IDS } from "@mirrorcap/kuru-client";
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
    message: "Notional you want to copy with (quote units)",
    required: true,
    prompt: true,
    validate: (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? true : "must be a positive number"),
  },
} satisfies InputSchema;

/**
 * `mm mirrorcap analyze <strategy-id> --wallet 0x... --amount 100`
 *
 * Runs the pre-trade check (KOL condition + follower risk + live Kuru
 * capacity) WITHOUT executing anything — this is how a follower sees
 * COPYABLE / LIMITED_CAPACITY / OUTSIDE_POLICY before deciding to `copy`.
 * Declares `wallet-read` to show the follower's current balance for context,
 * via the documented `ctx.publicClient(chainId).getBalance({address})` path.
 */
export default class MirrorcapAnalyze extends PluginCommand<unknown> {
  static override description = "Analyze current copyability and your Reproducible Capacity for a strategy.";
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "mirrorcap analyze";

  async execute(io: CommandIO) {
    const resolved = await io.resolveInputs(inputs);
    const amount = Number(resolved.amount);

    const result = await mirrorcapApi.analyze(resolved.strategyId, resolved.wallet, amount);
    const { evaluation, capacityCurve, orderBookSource, strategy } = result;

    try {
      const chainId =
        strategy.market.network === "monad-mainnet" ? MONAD_CHAIN_IDS.mainnet : MONAD_CHAIN_IDS.testnet;
      const client = this.ctx.publicClient(chainId);
      const balance = await client.getBalance({ address: resolved.wallet as `0x${string}` });
      io.emit(`Wallet native balance: ${balance.toString()} wei (chain ${chainId}).`);
    } catch (err) {
      io.log("warn" as never, `Could not read wallet balance: ${String(err)}`);
    }

    io.emit(`Status: ${evaluation.status} — ${evaluation.reason}`);
    io.emit(`Order book source: ${orderBookSource}`);
    if (evaluation.capacity) {
      io.emit(
        `Effective max price ${evaluation.capacity.effectiveMaxPrice}, expected avg ${evaluation.capacity.expectedAveragePrice}, Reproducible Capacity ${evaluation.capacity.reproducibleCapacityNotional}.`,
      );
    }
    io.emit("Capacity curve:");
    for (const point of capacityCurve) {
      io.emit(
        `  ${point.requestedNotional} -> avg ${point.expectedAveragePrice ?? "n/a"} (${point.expectedDeviationBps?.toFixed(1) ?? "n/a"}bps) [${point.status}]`,
      );
    }

    return result;
  }
}
