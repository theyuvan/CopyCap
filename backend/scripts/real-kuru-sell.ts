// ONE-OFF VALIDATION SCRIPT — not part of the app's bounty submission path.
// Uses a plain ethers.Wallet (throwaway testnet key, zero real value) to
// place a REAL GTC limit sell order on Kuru's live Monad testnet MON-USDC
// market. This exists purely to prove Kuru order execution itself works,
// independent of the separate MetaMask Agent Wallet wallet-submit bug.
import * as KuruSdk from "@kuru-labs/kuru-sdk";
import { ethers } from "ethers";
import fs from "node:fs";

const RPC_URL = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const MARKET_ADDRESS = "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9";
const KEY_PATH =
  "C:\\Users\\yuvan\\AppData\\Local\\Temp\\claude\\c--Users-yuvan-metropolois\\25183c65-68f3-424c-bcf3-8407b47bb6d5\\scratchpad\\throwaway-testnet-key.json";

async function main() {
  const { privateKey, address } = JSON.parse(fs.readFileSync(KEY_PATH, "utf-8"));
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`Signer: ${address}`);
  const balance = await provider.getBalance(address);
  console.log(`Native MON balance: ${ethers.utils.formatEther(balance)} MON`);

  const marketParams = await KuruSdk.ParamFetcher.getMarketParams(provider, MARKET_ADDRESS);

  const price = 1.1; // above current best ask (1.001) -> rests as a new top-of-book sell
  const size = 220; // 220 MON -- above this market's 200 MON minSize

  console.log(`Placing GTC limit SELL: ${size} MON at ${price} USDC...`);
  const receipt = await KuruSdk.GTC.placeLimit(signer, MARKET_ADDRESS, marketParams, {
    price,
    size,
    isBuy: false,
    postOnly: false,
  });

  console.log("CONFIRMED ON-CHAIN");
  console.log("txHash:", receipt.transactionHash);
  console.log("blockNumber:", receipt.blockNumber);
  console.log("status:", receipt.status);
}

main().catch((err) => {
  console.error("REAL KURU SELL FAILED:", err);
  process.exit(1);
});
