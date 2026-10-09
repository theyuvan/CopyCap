import { ethers } from "ethers";
import fs from "node:fs";

const RPC_URL = "https://testnet-rpc.monad.xyz";
const ROUTER = "0x7EFbE105Ca7415dE98F96622173458ac1c054630";
const NATIVE = "0x0000000000000000000000000000000000000000";
const CIRCLE_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const KEY_PATH =
  "C:\\Users\\yuvan\\AppData\\Local\\Temp\\claude\\c--Users-yuvan-metropolois\\25183c65-68f3-424c-bcf3-8407b47bb6d5\\scratchpad\\throwaway-testnet-key.json";

const ABI = [
  "function deployProxy(uint8 _type, address _baseAssetAddress, address _quoteAssetAddress, uint96 _sizePrecision, uint32 _pricePrecision, uint32 _tickSize, uint96 _minSize, uint96 _maxSize, uint256 _takerFeeBps, uint256 _makerFeeBps, uint96 _kuruAmmSpread) returns (address)",
];

async function main() {
  const { privateKey, address } = JSON.parse(fs.readFileSync(KEY_PATH, "utf-8"));
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  const router = new ethers.Contract(ROUTER, ABI, signer);

  console.log(`Simulating deployProxy call from ${address}...`);
  try {
    const result = await router.callStatic.deployProxy(
      0, // OrderBookType guess: 0
      NATIVE, // base = native MON
      CIRCLE_USDC, // quote = Circle USDC
      ethers.BigNumber.from("10000000000"), // sizePrecision (match existing market)
      100000000, // pricePrecision
      100, // tickSize
      ethers.BigNumber.from("1000000"), // minSize -- tiny: 0.0001 in scaled units
      ethers.BigNumber.from("2000000000000000000"), // maxSize
      0, // takerFeeBps
      0, // makerFeeBps
      0, // kuruAmmSpread
    );
    console.log("SIMULATION SUCCEEDED -- deployProxy appears callable. Would-be market address:", result);
  } catch (err: any) {
    console.log("SIMULATION REVERTED:", err.reason ?? err.error?.message ?? err.message);
  }
}

main().catch((err) => {
  console.error("SCRIPT FAILED:", err);
  process.exit(1);
});
