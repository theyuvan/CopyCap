import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@mirrorcap/privy-client";
import type { Address } from "@mirrorcap/shared-types";
import { getPrivyConfig, getUserWallets } from "./privy.js";

export interface PrivyIdentity {
  userId: string;
  wallets: Address[];
}

declare module "express-serve-static-core" {
  interface Request {
    privyUser?: PrivyIdentity;
  }
}

/** Requires a valid Privy access token and attaches the user's verified wallets to the request. */
export async function requirePrivyUser(req: Request, res: Response, next: NextFunction) {
  const config = getPrivyConfig();
  if (!config) {
    return res.status(503).json({ error: "Privy is not configured on this server.", code: "PRIVY_NOT_CONFIGURED" });
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Sign in to continue.", code: "UNAUTHENTICATED" });

  let userId: string;
  try {
    ({ userId } = await verifyAccessToken(token, config));
  } catch {
    return res.status(401).json({ error: "Your session has expired. Sign in again.", code: "UNAUTHENTICATED" });
  }

  try {
    req.privyUser = { userId, wallets: await getUserWallets(userId) };
  } catch (err) {
    return next(err);
  }
  next();
}

/**
 * The wallet a request acts as: the one it names, if the signed-in user
 * controls it, otherwise their first (embedded) wallet. Returns null if the
 * named wallet isn't theirs.
 */
export function actingWallet(req: Request, requested?: string): Address | null {
  const wallets = req.privyUser?.wallets ?? [];
  if (!requested) return wallets[0] ?? null;
  return wallets.find((w) => w.toLowerCase() === requested.toLowerCase()) ?? null;
}
