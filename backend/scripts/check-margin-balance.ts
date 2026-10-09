import { ethers } from "ethers";
const provider = new ethers.providers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
const MARGIN_ACCOUNT = "0xd029C2D98ff85D8F64799017fE00a59B1159CE02";
const USER = "0x530057c032545Ab945A3263dC6a694Cf98d79620";
const NATIVE = "0x0000000000000000000000000000000000000000";
const abi = ["function getBalance(address _user, address _token) view returns (uint256)"];
async function main() {
  const contract = new ethers.Contract(MARGIN_ACCOUNT, abi, provider);
  const bal = await contract.getBalance(USER, NATIVE);
  console.log("Kuru margin account MON balance:", ethers.utils.formatEther(bal));
}
main();
