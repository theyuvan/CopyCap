import { ethers } from "ethers";
import fs from "node:fs";
const parsed = JSON.parse(fs.readFileSync("C:/Users/yuvan/AppData/Local/Temp/kuru-inspect/package/abi/Router.json", "utf-8"));
const routerAbi = Array.isArray(parsed) ? parsed : parsed.abi;
const iface = new ethers.utils.Interface(routerAbi);
const errors = routerAbi.filter((x: any) => x.type === "error");
for (const e of errors) {
  const fragment = iface.getError(e.name);
  const selector = iface.getSighash(fragment);
  console.log(selector, e.name);
}
