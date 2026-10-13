import { Router } from "express";
import { createProvider } from "@mirrorcap/kuru-client";
import { getPrivyConfig } from "../lib/privy.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const testnetRpc = process.env.MONAD_TESTNET_RPC_URL;
  const mainnetRpc = process.env.MONAD_MAINNET_RPC_URL;

  const checks: Record<string, unknown> = {
    nansenApiKeyConfigured: Boolean(process.env.NANSEN_API_KEY),
    privyConfigured: Boolean(getPrivyConfig()),
    monadTestnetRpcConfigured: Boolean(testnetRpc),
    monadMainnetRpcConfigured: Boolean(mainnetRpc),
  };

  if (testnetRpc) {
    try {
      const provider = createProvider(testnetRpc);
      const [network, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
      checks.monadTestnet = { chainId: network.chainId, blockNumber };
    } catch (err) {
      checks.monadTestnet = { error: String(err) };
    }
  }

  res.json({ ok: true, checks });
});
