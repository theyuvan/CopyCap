import { type CommandIO, PluginCommand } from "@metamask/agent-wallet/plugin";
import { mirrorcapApi } from "../../lib/apiClient.js";

/**
 * `mm mirrorcap strategies` — lists momentum-breakout strategies and their
 * live lifecycle state. Pure read against MirrorCap's own API; touches no
 * wallet data, so it declares zero Agent Wallet capabilities.
 */
export default class MirrorcapStrategies extends PluginCommand<unknown> {
  static override description = "List MirrorCap momentum-breakout strategies and their current lifecycle state.";
  static override requiresAuth = false;
  static override requiresInit = false;

  protected readonly pluginCommandId = "mirrorcap strategies";

  async execute(io: CommandIO) {
    const strategies = await mirrorcapApi.listStrategies();
    for (const s of strategies) {
      io.emit(
        `${s.id}  [${s.lifecycleState}]  ${s.market.symbol}  entry ${s.entryMin}-${s.entryMax}  current ${s.currentPrice ?? "n/a"}`,
      );
    }
    return strategies;
  }
}
