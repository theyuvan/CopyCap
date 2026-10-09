import { createProvider } from "@mirrorcap/kuru-client";
import { ethers } from "ethers";

const RPC_URL = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const TOKEN = "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570";
const TARGET = "0x6a0704a309c774ec0ff65eec6c1c000261bb4088";

async function main() {
  const provider = createProvider(RPC_URL);
  const iface = new ethers.utils.Interface(["function mint(address to, uint256 amount)"]);
  const data = iface.encodeFunctionData("mint", [TARGET, ethers.utils.parseUnits("100", 6)]);

  try {
    // eth_call simulation only — no tx sent, no gas spent, no state changed.
    await provider.call({ to: TOKEN, data, from: TARGET });
    console.log("SIMULATION SUCCEEDED: mint(address,uint256) appears callable without reverting.");
  } catch (err: any) {
    console.log("SIMULATION REVERTED:", err.reason ?? err.error?.message ?? err.message);
  }
}

main().catch((err) => {
  console.error("SCRIPT FAILED:", err);
  process.exit(1);
});
