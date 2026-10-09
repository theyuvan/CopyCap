import { ethers } from "ethers";
const provider = new ethers.providers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
const abi = ["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function name() view returns (string)"];
async function main() {
  const token = new ethers.Contract("0x534b2f3A21130d7a60830c2Df862319e593943A3", abi, provider);
  const [symbol, decimals, name] = await Promise.all([token.symbol(), token.decimals(), token.name()]);
  console.log({ name, symbol, decimals });
}
main().catch(e => console.error("FAILED:", e.message));
