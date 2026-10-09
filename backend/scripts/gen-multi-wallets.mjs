import { ethers } from "ethers";
import fs from "node:fs";

const count = 4;
const wallets = Array.from({ length: count }, () => ethers.Wallet.createRandom());
const outPath = "C:\\Users\\yuvan\\AppData\\Local\\Temp\\claude\\c--Users-yuvan-metropolois\\25183c65-68f3-424c-bcf3-8407b47bb6d5\\scratchpad\\consolidation-wallets.json";
fs.writeFileSync(
  outPath,
  JSON.stringify(
    wallets.map((w) => ({ address: w.address, privateKey: w.privateKey })),
    null,
    2,
  ),
);
wallets.forEach((w, i) => console.log(`${i + 1}: ${w.address}`));
