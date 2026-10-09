import { createProvider } from "@mirrorcap/kuru-client";
import { ethers } from "ethers";

const RPC_URL = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const ADDRESS = process.argv[2];

if (!ADDRESS) {
  console.error("Usage: tsx scripts/check-balance.ts <address>");
  process.exit(1);
}

async function main() {
  const provider = createProvider(RPC_URL);
  const balanceWei = await provider.getBalance(ADDRESS);
  const balanceMon = ethers.utils.formatEther(balanceWei);
  console.log(`Address: ${ADDRESS}`);
  console.log(`Balance: ${balanceMon} MON (${balanceWei.toString()} wei)`);
}

main().catch((err) => {
  console.error("BALANCE CHECK FAILED:", err);
  process.exit(1);
});
