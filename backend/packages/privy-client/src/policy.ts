import type { Address } from "@mirrorcap/shared-types";

export interface AbiFunctionFragment {
  type: "function";
  name: string;
  inputs: ReadonlyArray<{ name: string; type: string; internalType?: string }>;
  outputs?: ReadonlyArray<{ name: string; type: string; internalType?: string }>;
  stateMutability?: string;
}

export interface PolicyCondition {
  field_source: "ethereum_transaction" | "ethereum_calldata" | "system";
  field: string;
  operator: "eq" | "lte" | "in";
  value: string | string[];
  abi?: AbiFunctionFragment[];
}

export interface PolicyRule {
  name: string;
  method: "eth_sendTransaction";
  conditions: PolicyCondition[];
  action: "ALLOW" | "DENY";
}

export interface PrivyPolicy {
  version: "1.0";
  name: string;
  chain_type: "ethereum";
  rules: PolicyRule[];
}

/**
 * Addresses are expected EIP-55 checksummed; the compiled policy accepts both
 * that and the lowercase form because Privy string comparisons are case-sensitive.
 */
export interface TradingPolicyInput {
  /** Policy display name (Privy limit: 50 chars). */
  name: string;
  chainId: number;
  marketAddress: Address;
  quoteTokenAddress: Address;
  /** The follower's own wallet — the only destination funds may be withdrawn to. */
  ownerWallet: Address;
  /** Per-trade cap in quote-token base units (the ERC-20 approve amount). */
  maxTradeQuoteUnits: bigint;
  /** The same cap in the market's own quote-size encoding, as received by the market-buy function. */
  maxTradeQuoteSizeUnits: bigint;
  /** The exact ABI fragment the Kuru SDK encodes market buys with. */
  marketBuyAbi: AbiFunctionFragment;
  /** Unix seconds; no market buy may be signed after this. */
  entryExpiresAtUnix: number;
  /** The exact ABI fragment market sells (IOC, `placeAndExecuteMarketSell`) are encoded with. */
  marketSellAbi: AbiFunctionFragment;
  /** The exact ABI fragment GTC limit sells (`addSellOrder`) are encoded with. */
  limitSellAbi: AbiFunctionFragment;
}

/** uint96 max — used as a no-op upper bound so a sell rule scopes to its function without a real size cap. */
const UINT96_MAX = (1n << 96n) - 1n;

const ERC20_APPROVE: AbiFunctionFragment = {
  type: "function",
  name: "approve",
  inputs: [
    { name: "spender", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "nonpayable",
};

const ERC20_TRANSFER: AbiFunctionFragment = {
  type: "function",
  name: "transfer",
  inputs: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "nonpayable",
};

function addressVariants(address: Address): string[] {
  return [...new Set([address, address.toLowerCase()])];
}

function toHexQuantity(value: bigint): string {
  if (value < 0n) throw new Error("Policy caps must be non-negative.");
  return `0x${value.toString(16)}`;
}

/**
 * Compiles a follower's risk settings into a Privy policy for their trading
 * wallet. Privy denies anything no rule allows, so the wallet can only:
 * approve the quote token to this Kuru market (up to the per-trade cap), buy
 * or sell on this market (buys capped; sells scoped to the function but
 * otherwise uncapped — a sell can only convert the wallet's own MON into
 * quote token that stays in the SAME wallet, governed by the withdraw rule
 * below, so a size cap adds no real protection there), and send the quote
 * token or native gas back to the follower's own wallet.
 */
export function compileTradingPolicy(input: TradingPolicyInput): PrivyPolicy {
  const quoteSizeInput = input.marketBuyAbi.inputs[0]?.name;
  if (!quoteSizeInput) throw new Error("Market-buy ABI fragment has no quote-size input.");
  const marketSellSizeInput = input.marketSellAbi.inputs[0]?.name;
  if (!marketSellSizeInput) throw new Error("Market-sell ABI fragment has no size input.");
  const limitSellSizeInput = input.limitSellAbi.inputs.find((i) => i.name === "size")?.name;
  if (!limitSellSizeInput) throw new Error("Limit-sell ABI fragment has no 'size' input.");
  if (input.maxTradeQuoteUnits <= 0n || input.maxTradeQuoteSizeUnits <= 0n) {
    throw new Error("Per-trade cap must be positive.");
  }

  const onChain: PolicyCondition = {
    field_source: "ethereum_transaction",
    field: "chain_id",
    operator: "eq",
    value: String(input.chainId),
  };
  const to = (addresses: string[]): PolicyCondition => ({
    field_source: "ethereum_transaction",
    field: "to",
    operator: "in",
    value: addresses,
  });
  const market = addressVariants(input.marketAddress);
  const quoteToken = addressVariants(input.quoteTokenAddress);
  const owner = addressVariants(input.ownerWallet);

  return {
    version: "1.0",
    name: input.name.slice(0, 50),
    chain_type: "ethereum",
    rules: [
      {
        name: "Approve quote to Kuru market, within cap",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          onChain,
          to(quoteToken),
          {
            field_source: "ethereum_calldata",
            field: "approve.spender",
            operator: "in",
            value: market,
            abi: [ERC20_APPROVE],
          },
          {
            field_source: "ethereum_calldata",
            field: "approve.amount",
            operator: "lte",
            value: toHexQuantity(input.maxTradeQuoteUnits),
            abi: [ERC20_APPROVE],
          },
        ],
      },
      {
        name: "Kuru market buy, within cap and entry window",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          onChain,
          to(market),
          {
            field_source: "ethereum_calldata",
            field: `${input.marketBuyAbi.name}.${quoteSizeInput}`,
            operator: "lte",
            value: toHexQuantity(input.maxTradeQuoteSizeUnits),
            abi: [input.marketBuyAbi],
          },
          {
            field_source: "system",
            field: "current_unix_timestamp",
            operator: "lte",
            value: String(Math.floor(input.entryExpiresAtUnix)),
          },
        ],
      },
      {
        name: "Kuru market sell (IOC)",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          onChain,
          to(market),
          {
            field_source: "ethereum_calldata",
            field: `${input.marketSellAbi.name}.${marketSellSizeInput}`,
            operator: "lte",
            value: toHexQuantity(UINT96_MAX),
            abi: [input.marketSellAbi],
          },
        ],
      },
      {
        name: "Kuru limit sell (GTC)",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          onChain,
          to(market),
          {
            field_source: "ethereum_calldata",
            field: `${input.limitSellAbi.name}.${limitSellSizeInput}`,
            operator: "lte",
            value: toHexQuantity(UINT96_MAX),
            abi: [input.limitSellAbi],
          },
        ],
      },
      {
        name: "Withdraw quote token to follower only",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [
          onChain,
          to(quoteToken),
          {
            field_source: "ethereum_calldata",
            field: "transfer.to",
            operator: "in",
            value: owner,
            abi: [ERC20_TRANSFER],
          },
        ],
      },
      {
        name: "Return native gas to follower only",
        method: "eth_sendTransaction",
        action: "ALLOW",
        conditions: [onChain, to(owner)],
      },
    ],
  };
}
