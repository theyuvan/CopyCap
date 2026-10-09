import { ethers } from "ethers";
import fs from "node:fs";

const RPC_URL = "https://testnet-rpc.monad.xyz";
const MAIN_ADDRESS = "0x530057c032545Ab945A3263dC6a694Cf98d79620";
const WALLETS_PATH =
  "C:\\Users\\yuvan\\AppData\\Local\\Temp\\claude\\c--Users-yuvan-metropolois\\25183c65-68f3-424c-bcf3-8407b47bb6d5\\scratchpad\\consolidation-wallets.json";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, "utf-8"));

  for (const { address, privateKey } of wallets) {
    const signer = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(address);
    const gasPrice = await provider.getGasPrice();
    const gasLimit = ethers.BigNumber.from(21000);
    const gasCost = gasPrice.mul(gasLimit);
    const sendAmount = balance.sub(gasCost);

    if (sendAmount.lte(0)) {
      console.log(`${address}: balance too low to cover gas, skipping`);
      continue;
    }

    const tx = await signer.sendTransaction({
      to: MAIN_ADDRESS,
      value: sendAmount,
      gasLimit,
      gasPrice,
    });
    const receipt = await tx.wait(1);
    console.log(`${address} -> sent ${ethers.utils.formatEther(sendAmount)} MON, tx ${receipt.transactionHash}, status ${receipt.status}`);
  }

  const finalBalance = await provider.getBalance(MAIN_ADDRESS);
  console.log(`\nMain wallet (${MAIN_ADDRESS}) balance now: ${ethers.utils.formatEther(finalBalance)} MON`);
}

main().catch((err) => {
  console.error("CONSOLIDATION FAILED:", err);
  process.exit(1);
});
