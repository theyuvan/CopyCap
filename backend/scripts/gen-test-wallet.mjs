import { ethers } from "ethers";
import fs from "node:fs";

const wallet = ethers.Wallet.createRandom();
// Keep the key OUTSIDE the repo entirely — scratchpad, never git, never printed in full.
const outPath = "C:\\Users\\yuvan\\AppData\\Local\\Temp\\claude\\c--Users-yuvan-metropolois\\25183c65-68f3-424c-bcf3-8407b47bb6d5\\scratchpad\\throwaway-testnet-key.json";
fs.writeFileSync(outPath, JSON.stringify({ address: wallet.address, privateKey: wallet.privateKey }, null, 2));
console.log("Address:", wallet.address);
console.log("Key saved locally (not printed, not committed).");
