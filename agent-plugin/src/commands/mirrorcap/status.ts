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
  wallet: {
    type: InputFieldType.Text,
    flag: "wallet",
    message: "Your Agent Wallet address",
    required: true,
    prompt: true,
    index: 0,
  },
} satisfies InputSchema;

/**
 * `mm mirrorcap status --wallet 0x...`
 *
 * Shows every strategy this wallet follows, their lifecycle state, and any
 * open/closed positions with realized PnL and the 10% leader fee once
 * closed. Declares `wallet-read` (balance context only); never submits.
 */
export default class MirrorcapStatus extends PluginCommand<unknown> {
  static override description = "Show your followed MirrorCap strategies and position status.";
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "mirrorcap status";

  async execute(io: CommandIO) {
    const resolved = await io.resolveInputs(inputs);
    const strategies = await mirrorcapApi.listStrategies();

    const rows = [];
    for (const summary of strategies) {
      const detail = await mirrorcapApi.getStrategy(summary.id);
      const myPositions = (detail.positions ?? []).filter(
        (p: { follower: string }) => p.follower.toLowerCase() === resolved.wallet.toLowerCase(),
      );
      if (myPositions.length === 0) continue;

      for (const position of myPositions) {
        io.emit(
          `${detail.id} [${detail.lifecycleState}] position ${position.state} entry@${position.entryAvgPrice} ` +
            (position.state === "CLOSED"
              ? `exit@${position.exitAvgPrice} pnl=${position.realizedPnlQuote} leaderFee=${position.leaderFeeQuote}`
              : "(open)"),
        );
      }
      rows.push({ strategy: detail, positions: myPositions });
    }

    if (rows.length === 0) io.emit("No positions found for this wallet yet.");

    try {
      const client = this.ctx.publicClient(MONAD_CHAIN_IDS.testnet);
      const balance = await client.getBalance({ address: resolved.wallet as `0x${string}` });
      io.emit(`Testnet native balance: ${balance.toString()} wei.`);
    } catch (err) {
      io.log("warn" as never, `Could not read wallet balance: ${String(err)}`);
    }

    return rows;
  }
}
