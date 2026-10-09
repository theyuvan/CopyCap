import { createProvider } from "@mirrorcap/kuru-client";
import { ethers } from "ethers";

const RPC_URL = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";

async function main() {
  const provider = createProvider(RPC_URL);
  const gasPrice = await provider.getGasPrice();
  console.log(`gasPrice: ${gasPrice.toString()} wei (${ethers.utils.formatUnits(gasPrice, "gwei")} gwei)`);
  console.log(`gasPrice hex: ${gasPrice.toHexString()}`);

  // Estimate gas for our mint call specifically.
  const iface = new ethers.utils.Interface(["function mint(address to, uint256 amount)"]);
  const data = iface.encodeFunctionData("mint", [
    "0x6a0704a309c774ec0ff65eec6c1c000261bb4088",
    ethers.utils.parseUnits("100", 6),
  ]);
  const estimate = await provider.estimateGas({
    to: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570",
    data,
    from: "0x6a0704a309c774ec0ff65eec6c1c000261bb4088",
  });
  console.log(`estimated gas: ${estimate.toString()}`);
  console.log(`estimated gas hex: ${estimate.toHexString()}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
