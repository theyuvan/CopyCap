import { createProvider } from "@mirrorcap/kuru-client";
import { ethers } from "ethers";

const RPC_URL = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const WALLET = process.argv[2];
const TOKEN = process.argv[3] ?? "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570"; // MON-USDC quote asset

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  const provider = createProvider(RPC_URL);
  const token = new ethers.Contract(TOKEN, ERC20_ABI, provider);
  const [balance, decimals, symbol] = await Promise.all([
    token.balanceOf(WALLET),
    token.decimals(),
    token.symbol().catch(() => "?"),
  ]);
  console.log(`Token: ${symbol} (${TOKEN})`);
  console.log(`Balance: ${ethers.utils.formatUnits(balance, decimals)} ${symbol}`);
}

main().catch((err) => {
  console.error("TOKEN BALANCE CHECK FAILED:", err);
  process.exit(1);
});
