import type { MarketRef } from "@mirrorcap/shared-types";

/**
 * Verified against https://docs.kuru.io/contracts/Contract-addresses on 2026-10-09.
 * Kuru can change these — re-verify before a demo. Never hardcode a value here
 * that isn't sourced from that page; override via env for anything else.
 */
export const KURU_ADDRESSES = {
  mainnet: {
    router: "0xd651346d7c789536ebf06dc72aE3C8502cd695CC",
    marginAccount: "0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5",
    markets: {
      "MON-USDC": "0x065C9d28E428A0db40191a54d33d5b7c71a9C394",
      "MON-AUSD": "0x131a2e70a5b31a517a74b8c567149bc294470da9",
    },
  },
  testnet: {
    router: "0x7EFbE105Ca7415dE98F96622173458ac1c054630",
    marginAccount: "0xd029C2D98ff85D8F64799017fE00a59B1159CE02",
    markets: {
      "MON-USDC": "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9",
    },
  },
} as const;

export const MONAD_CHAIN_IDS = {
  mainnet: 143,
  testnet: 10143,
} as const;

/** Default demo market: Monad testnet MON-USDC, unless overridden by env. */
export function getDefaultMarket(network: "monad-mainnet" | "monad-testnet" = "monad-testnet"): MarketRef {
  const isMainnet = network === "monad-mainnet";
  const marketAddress = isMainnet
    ? KURU_ADDRESSES.mainnet.markets["MON-USDC"]
    : KURU_ADDRESSES.testnet.markets["MON-USDC"];

  return {
    marketAddress: marketAddress as `0x${string}`,
    symbol: "MON-USDC",
    baseToken: "0x00000000000000000000000000000000000000", // native MON leg; resolved via marketParams at runtime
    quoteToken: "0x0000000000000000000000000000000000000000", // USDC leg; resolved via marketParams at runtime
    network,
  };
}
