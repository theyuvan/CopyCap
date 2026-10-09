import { createProvider, getLiveOrderBook, getMarketParams, KURU_ADDRESSES, MONAD_CHAIN_IDS } from "@mirrorcap/kuru-client";

const RPC_URL = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const MARKET_ADDRESS = KURU_ADDRESSES.testnet.markets["MON-USDC"] as `0x${string}`;

async function main() {
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Market (MON-USDC, testnet): ${MARKET_ADDRESS}`);

  const provider = createProvider(RPC_URL);

  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();
  console.log(`\nConnected to chainId=${network.chainId} (expected ${MONAD_CHAIN_IDS.testnet}), blockNumber=${blockNumber}`);

  console.log("\nFetching real MarketParams via KuruSdk.ParamFetcher.getMarketParams...");
  const marketParams = await getMarketParams(provider, MARKET_ADDRESS);
  console.log({
    baseAssetAddress: marketParams.baseAssetAddress,
    quoteAssetAddress: marketParams.quoteAssetAddress,
    baseAssetDecimals: marketParams.baseAssetDecimals.toString(),
    quoteAssetDecimals: marketParams.quoteAssetDecimals.toString(),
    tickSize: marketParams.tickSize.toString(),
  });

  console.log("\nFetching real L2 order book via KuruSdk.OrderBook.getL2OrderBook...");
  const book = await getLiveOrderBook(provider, MARKET_ADDRESS, marketParams);
  console.log(`blockNumber: ${book.blockNumber}`);
  console.log(`asks (${book.asks.length}):`, book.asks.slice(0, 10));
  console.log(`bids (${book.bids.length}):`, book.bids.slice(0, 10));
}

main().catch((err) => {
  console.error("LIVE KURU CHECK FAILED:", err);
  process.exit(1);
});
