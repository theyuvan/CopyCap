import {
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { mirrorcapApi } from "../../lib/apiClient.js";

function numeric(value: string): string | true {
  return Number.isFinite(Number(value)) ? true : "must be a number";
}

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
  maxTrade: {
    type: InputFieldType.Text,
    flag: "max-trade",
    message: "Max trade amount (quote units)",
    required: true,
    prompt: true,
    validate: numeric,
  },
  maxDrift: {
    type: InputFieldType.Text,
    flag: "max-drift",
    message: "Max execution deviation, in percent (e.g. 1 = 1%)",
    required: true,
    prompt: true,
    validate: numeric,
  },
  dailyCap: {
    type: InputFieldType.Text,
    flag: "daily-cap",
    message: "Daily outflow cap (quote units, defaults to max-trade)",
    required: false,
    prompt: false,
    validate: numeric,
  },
  allowPartial: {
    type: InputFieldType.Boolean,
    flag: "allow-partial",
    message: "Allow partial fills (IOC) instead of fill-or-kill",
    required: false,
    prompt: false,
    default: true,
  },
  autoExecute: {
    type: InputFieldType.Boolean,
    flag: "auto",
    message: "Auto-execute copies without manual confirmation",
    required: false,
    prompt: false,
    default: false,
  },
} satisfies InputSchema;

/**
 * `mm mirrorcap follow <strategy-id> --wallet 0x... --max-trade 100 --max-drift 1`
 *
 * Registers the follower's own risk configuration (OVERALL.md #11). This
 * never touches wallet funds or signing, so it declares no Agent Wallet
 * capabilities — it only writes risk preferences to MirrorCap's own API.
 */
export default class MirrorcapFollow extends PluginCommand<unknown> {
  static override description = "Follow a MirrorCap strategy and set your personal execution risk limits.";
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "mirrorcap follow";

  async execute(io: CommandIO) {
    const resolved = await io.resolveInputs(inputs);
    const maxTradeNotional = Number(resolved.maxTrade);
    const maxDriftBps = Number(resolved.maxDrift) * 100; // percent -> bps

    const policy = await mirrorcapApi.follow(resolved.strategyId, {
      wallet: resolved.wallet,
      maxTradeNotional,
      maxDailyOutflow: resolved.dailyCap ? Number(resolved.dailyCap) : maxTradeNotional,
      maxDriftBps,
      allowPartialFill: resolved.allowPartial,
      autoExecute: resolved.autoExecute,
    });

    io.emit(
      `Following ${resolved.strategyId} as ${resolved.wallet}: max ${maxTradeNotional}, drift ${resolved.maxDrift}% (${maxDriftBps}bps), ${resolved.allowPartial ? "IOC" : "FOK"}.`,
    );
    return policy;
  }
}
