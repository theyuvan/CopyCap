// ONE-OFF VALIDATION SCRIPT — real Kuru MarginAccount deposit, using a plain
// ethers.Wallet (throwaway testnet key). Proves a real, signed, on-chain
// transaction against Kuru's actual deployed infrastructure, independent of
// the 200 MON order-book minSize (deposits aren't order placements).
import { ethers } from "ethers";
import fs from "node:fs";

const RPC_URL = "https://testnet-rpc.monad.xyz";
const MARGIN_ACCOUNT = "0xd029C2D98ff85D8F64799017fE00a59B1159CE02";
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";
const KEY_PATH =
  "C:\\Users\\yuvan\\AppData\\Local\\Temp\\claude\\c--Users-yuvan-metropolois\\25183c65-68f3-424c-bcf3-8407b47bb6d5\\scratchpad\\throwaway-testnet-key.json";

const ABI = ["function deposit(address _user, address _token, uint256 _amount) payable"];

async function main() {
  const { privateKey, address } = JSON.parse(fs.readFileSync(KEY_PATH, "utf-8"));
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);

  const balanceBefore = await provider.getBalance(address);
  console.log(`Signer: ${address}`);
  console.log(`MON balance before: ${ethers.utils.formatEther(balanceBefore)}`);

  const amount = ethers.utils.parseEther("230"); // 230 MON -- enough for a 220 MON GTC sell + buffer
  const contract = new ethers.Contract(MARGIN_ACCOUNT, ABI, signer);

  console.log(`Depositing 10 MON into Kuru MarginAccount (${MARGIN_ACCOUNT})...`);
  const tx = await contract.deposit(address, NATIVE_TOKEN, amount, { value: amount });
  console.log(`tx submitted: ${tx.hash}`);
  const receipt = await tx.wait(1);

  console.log("CONFIRMED ON-CHAIN");
  console.log("txHash:", receipt.transactionHash);
  console.log("blockNumber:", receipt.blockNumber);
  console.log("status:", receipt.status);

  const balanceAfter = await provider.getBalance(address);
  console.log(`MON balance after: ${ethers.utils.formatEther(balanceAfter)}`);
}

main().catch((err) => {
  console.error("MARGIN DEPOSIT FAILED:", err);
  process.exit(1);
});
