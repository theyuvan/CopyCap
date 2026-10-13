import { PrivyClient, ethereumWalletsOf } from "@mirrorcap/privy-client";
import type { Address } from "@mirrorcap/shared-types";

export class PrivyNotConfiguredError extends Error {
  constructor() {
    super("Privy is not configured on this server. Set PRIVY_APP_ID and PRIVY_APP_SECRET.");
    this.name = "PrivyNotConfiguredError";
  }
}

export function getPrivyConfig(): { appId: string; appSecret: string } | null {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

let client: PrivyClient | undefined;

export function getPrivy(): PrivyClient {
  const config = getPrivyConfig();
  if (!config) throw new PrivyNotConfiguredError();
  client ??= new PrivyClient({ appId: config.appId, appSecret: config.appSecret });
  return client;
}

// Privy rate-limits user lookups, and a user's linked wallets rarely change mid-session.
const USER_WALLET_TTL_MS = 5 * 60 * 1000;
const userWalletCache = new Map<string, { wallets: Address[]; expiresAt: number }>();

export async function getUserWallets(userId: string): Promise<Address[]> {
  const cached = userWalletCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.wallets;
  const wallets = ethereumWalletsOf(await getPrivy().getUser(userId));
  userWalletCache.set(userId, { wallets, expiresAt: Date.now() + USER_WALLET_TTL_MS });
  return wallets;
}
