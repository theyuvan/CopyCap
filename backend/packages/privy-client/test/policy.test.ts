import { describe, expect, it } from "vitest";
import { compileTradingPolicy, type AbiFunctionFragment, type TradingPolicyInput } from "../src/policy";

const MARKET_BUY: AbiFunctionFragment = {
  type: "function",
  name: "placeAndExecuteMarketBuy",
  inputs: [
    { name: "_quoteSize", type: "uint96" },
    { name: "_minAmountOut", type: "uint256" },
    { name: "_isMargin", type: "bool" },
    { name: "_isFillOrKill", type: "bool" },
  ],
  stateMutability: "payable",
};

const MARKET_SELL: AbiFunctionFragment = {
  type: "function",
  name: "placeAndExecuteMarketSell",
  inputs: [
    { name: "_size", type: "uint96" },
    { name: "_minAmountOut", type: "uint256" },
    { name: "_isMargin", type: "bool" },
    { name: "_isFillOrKill", type: "bool" },
  ],
  stateMutability: "payable",
};

const LIMIT_SELL: AbiFunctionFragment = {
  type: "function",
  name: "addSellOrder",
  inputs: [
    { name: "_price", type: "uint32" },
    { name: "size", type: "uint96" },
    { name: "_postOnly", type: "bool" },
  ],
  stateMutability: "nonpayable",
};

const base: TradingPolicyInput = {
  name: "CopyCap follow abc",
  chainId: 10143,
  marketAddress: "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9",
  quoteTokenAddress: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
  ownerWallet: "0x2222222222222222222222222222222222222222",
  maxTradeQuoteUnits: 250_000_000n,
  maxTradeQuoteSizeUnits: 25_000n,
  marketBuyAbi: MARKET_BUY,
  entryExpiresAtUnix: 1_900_000_000,
  marketSellAbi: MARKET_SELL,
  limitSellAbi: LIMIT_SELL,
};

function rule(policy: ReturnType<typeof compileTradingPolicy>, prefix: string) {
  const r = policy.rules.find((x) => x.name.startsWith(prefix));
  if (!r) throw new Error(`missing rule ${prefix}`);
  return r;
}

function cond(r: ReturnType<typeof rule>, field: string) {
  const c = r.conditions.find((x) => x.field === field);
  if (!c) throw new Error(`missing condition ${field}`);
  return c;
}

describe("compileTradingPolicy", () => {
  it("only ALLOW rules, so anything unlisted falls through to Privy's default deny", () => {
    const policy = compileTradingPolicy(base);
    expect(policy.version).toBe("1.0");
    expect(policy.chain_type).toBe("ethereum");
    expect(policy.rules).toHaveLength(6);
    for (const r of policy.rules) {
      expect(r.action).toBe("ALLOW");
      expect(r.method).toBe("eth_sendTransaction");
      expect(cond(r, "chain_id").value).toBe("10143");
    }
  });

  it("caps the ERC-20 approve to the Kuru market at the per-trade cap", () => {
    const r = rule(compileTradingPolicy(base), "Approve");
    expect(cond(r, "to").value).toEqual([base.quoteTokenAddress, base.quoteTokenAddress.toLowerCase()]);
    expect(cond(r, "approve.spender").value).toEqual([base.marketAddress, base.marketAddress.toLowerCase()]);
    const amount = cond(r, "approve.amount");
    expect(amount.operator).toBe("lte");
    expect(BigInt(amount.value as string)).toBe(base.maxTradeQuoteUnits);
  });

  it("caps market buys in the market's own quote-size encoding and closes at entry expiry", () => {
    const r = rule(compileTradingPolicy(base), "Kuru market buy");
    expect(cond(r, "to").value).toContain(base.marketAddress);
    const size = cond(r, "placeAndExecuteMarketBuy._quoteSize");
    expect(size.abi).toEqual([MARKET_BUY]);
    expect(BigInt(size.value as string)).toBe(base.maxTradeQuoteSizeUnits);
    const expiry = cond(r, "current_unix_timestamp");
    expect(expiry.field_source).toBe("system");
    expect(expiry.value).toBe("1900000000");
  });

  it("scopes market sell and limit sell to this market, uncapped in size", () => {
    const policy = compileTradingPolicy(base);

    const marketSell = rule(policy, "Kuru market sell");
    expect(cond(marketSell, "to").value).toContain(base.marketAddress);
    const marketSellSize = cond(marketSell, "placeAndExecuteMarketSell._size");
    expect(marketSellSize.abi).toEqual([MARKET_SELL]);
    expect(BigInt(marketSellSize.value as string)).toBe((1n << 96n) - 1n);

    const limitSell = rule(policy, "Kuru limit sell");
    expect(cond(limitSell, "to").value).toContain(base.marketAddress);
    const limitSellSize = cond(limitSell, "addSellOrder.size");
    expect(limitSellSize.abi).toEqual([LIMIT_SELL]);
    expect(BigInt(limitSellSize.value as string)).toBe((1n << 96n) - 1n);
  });

  it("lets funds leave only toward the follower's own wallet", () => {
    const policy = compileTradingPolicy(base);
    const withdraw = rule(policy, "Withdraw");
    expect(cond(withdraw, "transfer.to").value).toEqual([base.ownerWallet]);
    const gas = rule(policy, "Return native gas");
    expect(cond(gas, "to").value).toEqual([base.ownerWallet]);
  });

  it("follows the ABI's own input name rather than assuming one", () => {
    const renamed = { ...MARKET_BUY, inputs: [{ name: "quoteSize", type: "uint96" }, ...MARKET_BUY.inputs.slice(1)] };
    const r = rule(compileTradingPolicy({ ...base, marketBuyAbi: renamed }), "Kuru market buy");
    expect(r.conditions.some((c) => c.field === "placeAndExecuteMarketBuy.quoteSize")).toBe(true);
  });

  it("rejects a zero cap instead of compiling a policy that can never trade", () => {
    expect(() => compileTradingPolicy({ ...base, maxTradeQuoteUnits: 0n })).toThrow(/positive/);
  });

  it("keeps every rule name under Privy's 50-character limit", () => {
    for (const r of compileTradingPolicy(base).rules) expect(r.name.length).toBeLessThan(50);
  });

  it("truncates the name to Privy's 50-character limit", () => {
    expect(compileTradingPolicy({ ...base, name: "x".repeat(80) }).name).toHaveLength(50);
  });
});
