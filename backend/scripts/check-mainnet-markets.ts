import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider, getLiveOrderBook, getMarketParams, KURU_ADDRESSES } from "@mirrorcap/kuru-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const RPC_URL = process.env.MONAD_MAINNET_RPC_URL;
if (!RPC_URL) throw new Error("MONAD_MAINNET_RPC_URL not set");

async function check(symbol: "MON-USDC" | "MON-AUSD") {
  const address = KURU_ADDRESSES.mainnet.markets[symbol] as `0x${string}`;
  try {
    const provider = createProvider(RPC_URL!);
    const marketParams = await getMarketParams(provider, address);
    const book = await getLiveOrderBook(provider, address, marketParams);
    console.log(`${symbol} (${address}): OK — asks ${book.asks.length}, bids ${book.bids.length}`);
    console.log("  top asks:", book.asks.slice(0, 3));
    console.log("  top bids:", book.bids.slice(0, 3));
  } catch (err: any) {
    console.log(`${symbol} (${address}): FAILED — ${err.message?.slice(0, 200)}`);
  }
}

async function main() {
  await check("MON-USDC");
  await check("MON-AUSD");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
