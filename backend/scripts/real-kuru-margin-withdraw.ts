import { ethers } from "ethers";
import fs from "node:fs";

const RPC_URL = "https://testnet-rpc.monad.xyz";
const MARGIN_ACCOUNT = "0xd029C2D98ff85D8F64799017fE00a59B1159CE02";
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";
const KEY_PATH =
  "C:\\Users\\yuvan\\AppData\\Local\\Temp\\claude\\c--Users-yuvan-metropolois\\25183c65-68f3-424c-bcf3-8407b47bb6d5\\scratchpad\\throwaway-testnet-key.json";

const ABI = ["function withdraw(uint256 _amount, address _token)"];

async function main() {
  const { privateKey, address } = JSON.parse(fs.readFileSync(KEY_PATH, "utf-8"));
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);

  const amount = ethers.utils.parseEther("10");
  const contract = new ethers.Contract(MARGIN_ACCOUNT, ABI, signer);

  console.log(`Withdrawing 10 MON from Kuru MarginAccount back to ${address}...`);
  const tx = await contract.withdraw(amount, NATIVE_TOKEN);
  console.log(`tx submitted: ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log("CONFIRMED. status:", receipt.status, "block:", receipt.blockNumber);

  const balance = await provider.getBalance(address);
  console.log(`Wallet MON balance now: ${ethers.utils.formatEther(balance)}`);
}

main().catch((err) => {
  console.error("WITHDRAW FAILED:", err);
  process.exit(1);
});
