/**
 * Live check of the Privy integration against real Privy + real Monad testnet:
 *   1. compiles a trading policy from real Kuru market params and creates it,
 *   2. creates a Privy server wallet bound to that policy,
 *   3. asks Privy to sign two transactions the policy must refuse,
 *   4. asks Privy to sign one it must allow (needs a little MON in the wallet).
 *
 * Usage: npx tsx backend/scripts/verify-privy-live.ts
 * Re-run against an existing wallet: VERIFY_WALLET_ID=... VERIFY_POLICY_ID=... npx tsx ...
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ethers } from "ethers";
import {
  KURU_ADDRESSES,
  LIMIT_SELL_ABI_FRAGMENT,
  MARKET_BUY_ABI_FRAGMENT,
  MARKET_SELL_ABI_FRAGMENT,
  MONAD_CHAIN_IDS,
  createProvider,
  encodeQuoteCap,
  getMarketParams,
} from "@mirrorcap/kuru-client";
import { PrivyApiError, PrivyClient, compileTradingPolicy } from "@mirrorcap/privy-client";
import type { Address } from "@mirrorcap/shared-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const RPC_URL = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const MARKET = ethers.utils.getAddress(KURU_ADDRESSES.testnet.markets["MON-USDC"]) as Address;
const OWNER = ethers.utils.getAddress(process.env.VERIFY_OWNER_WALLET ?? "0x000000000000000000000000000000000000dEaD") as Address;
const CAP_QUOTE = 1;

async function expectRefusal(label: string, attempt: () => Promise<unknown>) {
  try {
    const result = await attempt();
    console.log(`  ✗ ${label}: Privy SIGNED it — policy did not refuse.`, result);
    process.exitCode = 1;
  } catch (err) {
    if (err instanceof PrivyApiError) {
      console.log(`  ✓ ${label}: refused (${err.status}, policy violation detected: ${err.isPolicyViolation})`);
      console.log(`    ${JSON.stringify(err.body)}`);
      if (!err.isPolicyViolation) process.exitCode = 1;
    } else {
      throw err;
    }
  }
}

async function main() {
  const { PRIVY_APP_ID, PRIVY_APP_SECRET } = process.env;
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) throw new Error("Set PRIVY_APP_ID and PRIVY_APP_SECRET in .env first.");
  const privy = new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });

  const provider = createProvider(RPC_URL);
  const chainId = (await provider.getNetwork()).chainId;
  console.log(`Monad chainId=${chainId} (expected ${MONAD_CHAIN_IDS.testnet}), market ${MARKET}`);
  const marketParams = await getMarketParams(provider, MARKET);
  const quoteToken = ethers.utils.getAddress(marketParams.quoteAssetAddress) as Address;
  const caps = encodeQuoteCap(marketParams, CAP_QUOTE);
  console.log(`Quote token ${quoteToken}, per-trade cap ${CAP_QUOTE} = ${caps.approveUnits} units`);

  const policy = compileTradingPolicy({
    name: `CopyCap verify ${new Date().toISOString().slice(0, 16)}`,
    chainId,
    marketAddress: MARKET,
    quoteTokenAddress: quoteToken,
    ownerWallet: OWNER,
    maxTradeQuoteUnits: caps.approveUnits,
    maxTradeQuoteSizeUnits: caps.quoteSizeUnits,
    marketBuyAbi: MARKET_BUY_ABI_FRAGMENT,
    marketSellAbi: MARKET_SELL_ABI_FRAGMENT,
    limitSellAbi: LIMIT_SELL_ABI_FRAGMENT,
    entryExpiresAtUnix: Math.floor(Date.now() / 1000) + 24 * 3600,
  });

  const policyId = process.env.VERIFY_POLICY_ID ?? (await privy.createPolicy(policy)).id;
  const stored = await privy.getPolicy(policyId);
  console.log(`\nPolicy ${policyId} accepted by Privy with rules:`);
  for (const rule of stored.rules) console.log(`  - ${rule.action} ${rule.name}`);

  const walletId = process.env.VERIFY_WALLET_ID;
  const wallet = walletId
    ? await privy.getWallet(walletId)
    : await privy.createWallet({
        displayName: "CopyCap verify wallet",
        externalId: `cc-verify-${Date.now()}`,
        policyIds: [policyId],
        idempotencyKey: `cc-verify-${Date.now()}`,
      });
  console.log(`\nServer wallet ${wallet.id} at ${wallet.address} (policies: ${wallet.policy_ids.join(", ")})`);

  const erc20 = new ethers.utils.Interface(["function approve(address spender, uint256 amount)"]);
  const send = (data: string) =>
    privy.sendTransaction(wallet.id, { to: quoteToken, data, value: "0x0", chain_id: chainId });

  console.log("\nPolicy must refuse:");
  await expectRefusal("approve 1 unit over the cap to the Kuru market", () =>
    send(erc20.encodeFunctionData("approve", [MARKET, caps.approveUnits + 1n])),
  );
  await expectRefusal("approve within the cap to a spender that isn't Kuru", () =>
    send(erc20.encodeFunctionData("approve", [OWNER, caps.approveUnits])),
  );

  console.log("\nPolicy must allow:");
  const gas = await provider.getBalance(wallet.address);
  if (gas.isZero()) {
    console.log(`  … skipped: send ~0.05 testnet MON to ${wallet.address}, then re-run with`);
    console.log(`    VERIFY_WALLET_ID=${wallet.id} VERIFY_POLICY_ID=${policyId}`);
    return;
  }
  const { hash } = await send(erc20.encodeFunctionData("approve", [MARKET, caps.approveUnits]));
  const receipt = await provider.waitForTransaction(hash, 1);
  console.log(`  ✓ approve within the cap to the Kuru market: ${hash} (status ${receipt.status}, block ${receipt.blockNumber})`);
  if (receipt.status !== 1) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
