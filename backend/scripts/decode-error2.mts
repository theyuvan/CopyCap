import { ethers } from "ethers";
import fs from "node:fs";
const files = ["OrderBook.json", "MarginAccount.json", "Vault.json", "KuruAMMVault.json"];
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(`C:/Users/yuvan/AppData/Local/Temp/kuru-inspect/package/abi/${f}`, "utf-8"));
  const abi = Array.isArray(parsed) ? parsed : parsed.abi;
  const iface = new ethers.utils.Interface(abi);
  const errors = abi.filter((x: any) => x.type === "error");
  for (const e of errors) {
    const fragment = iface.getError(e.name);
    const selector = iface.getSighash(fragment);
    if (selector === "0xbd6898be") console.log("MATCH in", f, ":", e.name);
  }
}
console.log("done scanning");
