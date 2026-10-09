import { ethers } from "ethers";
const provider = new ethers.providers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
async function main() {
  const addr = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
  const code = await provider.getCode(addr);
  console.log("code length:", code.length, code === "0x" ? "(NO CONTRACT DEPLOYED HERE)" : "(contract exists)");
}
main();
