# MirrorCap

Capacity-aware momentum-breakout strategy copying on Monad.

> A trader defines the strategy, the follower defines the risk, and the
> system executes only while the market can still reproduce the opportunity.

See [`overall.md`](./overall.md) for the full product spec this build
implements. This README covers what's built, how to run it, and how to
demo the positive/negative flow.

## Why this isn't just slippage protection

Modern copy-trading platforms already support slippage limits, order-size
caps, and IOC/limit execution. MirrorCap's difference is upstream of the
order: before any copy is attempted, it answers *"how much of THIS
follower's capital can still reproduce the trader's intended entry, given
the live Kuru order book and this follower's own risk limits?"* — not just
"will my individual order fill inside my slippage." See `overall.md` §2 for
the full positioning.

## Architecture

```text
backend/                Express API: strategies, follow/unfollow, capacity analysis,
                        Smart Money opportunities, position/PnL recording
  packages/
    shared-types/       domain types (Strategy, FollowerPolicy, CapacityResult, ...)
    capacity-engine/    deterministic Reproducible Capacity algorithm (unit tested, no I/O)
    strategy-engine/    lifecycle state machine, pre-trade condition checks, 10% fee math
    kuru-client/        real @kuru-labs/kuru-sdk wrapper + the Agent-Wallet signer bridge
    nansen-client/       real Nansen Smart Money DEX Trades client
  scripts/               live-chain verification scripts (not part of the app)

frontend/                Next.js UI: Strategy Feed, Smart Money Feed, Strategy Detail
                        with the capacity curve

agent-plugin/            MetaMask Agent Wallet plugin — the ONLY place a trade
                        is ever signed/submitted (see below)
```

Responsibility split (unchanged from `overall.md` §35):

```text
NANSEN        -> which opportunity should I look at?
KURU          -> can I still get it at acceptable execution?
MIRRORCAP     -> is it reproducible for THIS follower?
AGENT WALLET  -> am I authorized to execute it?
MONAD         -> settle the transaction.
```

## What's real vs. labeled fallback

Nothing here pretends to be a production integration it isn't. Every place
that *can* fall back to a synthetic value does so visibly, via a `source`
field the API/UI always surface (`live-kuru` / `live-nansen` vs
`synthetic-fallback`):

- **Kuru order-book reads** (`backend/packages/kuru-client`) use the real
  `@kuru-labs/kuru-sdk` (`ParamFetcher.getMarketParams`,
  `OrderBook.getL2OrderBook`, `CostEstimator.estimateMarketBuy`,
  `IOC.placeMarket`) against the real Monad testnet/mainnet contract
  addresses in `backend/packages/kuru-client/src/addresses.ts` (verified against
  [Kuru's contract-addresses page](https://docs.kuru.io/contracts/Contract-addresses)
  on 2026-10-09 — re-verify before a demo). If `MONAD_TESTNET_RPC_URL` /
  `MONAD_MAINNET_RPC_URL` isn't set, `backend/src/lib/orderbook.ts` falls
  back to a deterministic synthetic book instead of crashing — and says so.
  **Verified live**, not just type-checked: with `MONAD_TESTNET_RPC_URL`
  pointed at the public `https://testnet-rpc.monad.xyz` endpoint, `backend/scripts/verify-kuru-live.ts`
  connects to real Monad testnet (chain `10143`), reads real `MarketParams`
  and a real resting ask from the live MON-USDC `OrderBook` contract at
  `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9`, and `GET /strategies/:id/analyze`
  returns `orderBookSource: "live-kuru"` with real on-chain depth feeding the
  capacity engine end to end. **Execution itself is also verified live**,
  independent of the Agent Wallet plugin: `backend/scripts/real-kuru-margin-deposit.ts`
  uses a plain `ethers.Wallet` to call the real Kuru `MarginAccount.deposit`
  on Monad testnet — confirmed on-chain
  (`0xdcc502e53630e57ef93d0bdbc196b76fdab6ef337c59c1bbb51db2e71753b76b`,
  block `69518421`, status `1`), then independently re-verified by reading
  the deposit back via Kuru's own `MarginAccount.getBalance()`, which
  correctly reported the credited amount. A real GTC *order* on this same
  testnet market was also attempted end-to-end (`backend/scripts/real-kuru-sell.ts`)
  and reached the real contract, which correctly rejected it with a decoded
  `"Size Error"` — the market's live minimum order size is 200 MON
  (`minSize / sizePrecision` from `ParamFetcher.getMarketParams`), more than
  the testnet faucet provides in a day; the deposit test above exists because
  it proves the same signing/submission/confirmation path without being
  gated by that unrelated liquidity minimum.
- **Nansen Smart Money** (`backend/packages/nansen-client`) calls the real
  `POST https://api.nansen.ai/api/v1/smart-money/dex-trades` with
  `chains: ["monad"]`. Without `NANSEN_API_KEY`, `backend/src/lib/nansen.ts`
  returns one labeled synthetic trade instead. **Verified live** with a real
  key: `GET /smart-money/opportunities` returns `source: "live-nansen"` with
  real Monad Smart Money trades (real tx hashes, a wallet labeled
  `"High Activity"`, MON bought against USDC/DUST in the trailing 24h) — each
  one automatically mapped to the real Kuru MON-USDC market and run through
  the **real live Kuru order book** for a real `LIMITED_CAPACITY` /
  `COPYABLE` verdict. This is the full Nansen -> Kuru -> capacity pipeline
  from `overall.md` §20, proven end to end with two live sponsor APIs at
  once, not asserted.
- **MetaMask Agent Wallet execution** (`agent-plugin/src/commands/mirrorcap/copy.ts`)
  is not mocked at all — it builds real Kuru calldata and signs/submits
  through `ctx.walletExecutor(...)`. **Verified against the real, installed
  `mm` CLI (v7.1.0)**: the plugin links successfully (`mm plugins link
  --install --accept-permissions`), `mm mirrorcap strategies`/`follow` run
  real code against the real API, and `mm mirrorcap copy` is correctly
  blocked with `AUTH_FAILED` when not logged in — proven by actually trying
  it unauthenticated, not asserted. See `agent-plugin/README.md` for the
  exact verified install sequence, the one beta-CLI rough edge found along
  the way, and the one documented limitation: the recorded entry price
  after a fill is the bounded-order estimate, not a decoded on-chain `Trade`
  event.

## Capacity engine design decisions (pinned down, not left implicit)

`overall.md` specifies the *steps* of the capacity algorithm but not the
exact formula. `backend/packages/capacity-engine/src/index.ts` pins down:

- `referencePrice = strategyEntryMin` (the KOL's most favorable entry
  boundary) — both the follower's drift tolerance and the reported
  deviation are measured from this anchor.
- `followerBoundPrice = referencePrice * (1 + maxDriftBps / 10000)`
- `effectiveMaxPrice = min(strategyEntryMax, followerBoundPrice)` — the
  stricter of the two, per `overall.md` §28.
- `expectedAveragePrice` / `expectedDeviationBps` are computed only over the
  book levels needed to fill *this follower's* requested notional, not the
  whole book.
- `DEGRADING` vs `COPYABLE`: fully fillable, but the fill would consume more
  than 60% of the allowed drift budget -> `DEGRADING` (still executes, but
  flagged as a degrading opportunity).

All of this is covered by 13 unit tests against synthetic order books
(`backend/packages/capacity-engine/test/capacity.test.ts`), built and passing
*before* any live Kuru connection was written, per the required build order.

## Lifecycle

```text
WAITING_FOR_ENTRY -> ENTRY_ACTIVE -> POSITION_ACTIVE -> EXIT_ACTIVE -> CLOSED
                  \-> EXPIRED (entry window passed with no entry — never auto-enters later)
```

Implemented as an explicit event-driven state machine
(`backend/packages/strategy-engine/src/lifecycle.ts`), not a pure function of price —
whether an entry/exit actually *executed* is a real action, not something
price alone implies. 25 unit tests cover every transition and the rules in
`overall.md` §34 (no re-entry after expiry, positions can outlive the entry
window, unfollowing never force-closes an open position, no invented market
exit on expiry).

## MetaMask Agent Wallet: how signing actually stays out of this process

`agent-plugin/src/commands/mirrorcap/copy.ts` is the only command that moves
funds. It builds the Kuru `IOC.placeMarket` calldata with the real SDK, but
hands it an `ethers.Signer` adapter
(`backend/packages/kuru-client/src/executorSigner.ts: AgentWalletSigner`) whose
`sendTransaction` does nothing but forward the populated `{to, data, value}`
to `ctx.walletExecutor(io, "mirrorcap:copy")` — real Agent Wallet policy,
MFA, and signing. `signTransaction`/`signMessage` are left throwing on
purpose. No private key exists anywhere in this codebase.

```text
MirrorCap plugin -> capacity/strategy validation -> wallet-submit
  -> Agent Wallet policy / signing / MFA -> Kuru transaction
```

## Running it

```bash
npm install            # installs the whole workspace
cp .env.example .env    # fill in RPC URLs / Nansen key if you have them

npm run test --workspaces --if-present   # 38 passing unit tests (capacity + lifecycle)
npm run build --workspaces --if-present  # typechecks + builds every package

npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:3000 (set MIRRORCAP_API_URL if not localhost:4000)
```

The agent plugin is a separate install into the real `mm` CLI — see
[`agent-plugin/README.md`](./agent-plugin/README.md).

## Demo script

### Positive flow

```bash
curl -s -X POST http://localhost:4000/strategies -H 'content-type: application/json' -d '{
  "creator": "0x1111111111111111111111111111111111111111",
  "market": {"marketAddress":"0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9","symbol":"MON-USDC","baseToken":"0x0000000000000000000000000000000000000000","quoteToken":"0x0000000000000000000000000000000000000000","network":"monad-testnet"},
  "breakoutLevel": 10.0, "entryMin": 10.0, "entryMax": 10.2,
  "targetMin": 11.0, "targetMax": 11.5, "stopLevel": 9.7,
  "entryExpiresAt": "2030-01-01T00:00:00Z", "description": "MON momentum breakout demo"
}'
# -> note the returned "id"

curl -s -X POST http://localhost:4000/strategies/<id>/follow -H 'content-type: application/json' -d '{
  "wallet": "0x2222222222222222222222222222222222222222",
  "maxTradeNotional": 1000, "maxDailyOutflow": 5000, "maxDriftBps": 200, "allowPartialFill": true
}'

curl -s "http://localhost:4000/strategies/<id>/analyze?wallet=0x2222222222222222222222222222222222222222&notional=100"
# -> status: COPYABLE, full Reproducible Capacity breakdown
```

Or open `http://localhost:3000/strategies/<id>?wallet=0x2222...&amount=100` to
see the same thing with the capacity curve rendered.

### Negative flow (the one that proves this isn't ordinary copy trading)

Follow with a much larger size than the book can support inside the bound:

```bash
curl -s -X POST http://localhost:4000/strategies/<id>/follow -H 'content-type: application/json' -d '{
  "wallet": "0x3333333333333333333333333333333333333333",
  "maxTradeNotional": 50000, "maxDailyOutflow": 100000, "maxDriftBps": 200, "allowPartialFill": true
}'
curl -s "http://localhost:4000/strategies/<id>/analyze?wallet=0x3333333333333333333333333333333333333333&notional=50000"
# -> status: LIMITED_CAPACITY — "Only 30000.00 of your requested 50000.00 is reproducible..."
```

Or a follower whose drift tolerance is tighter than the current best ask:

```bash
curl -s -X POST http://localhost:4000/strategies/<id>/follow -H 'content-type: application/json' -d '{
  "wallet": "0x4444444444444444444444444444444444444444",
  "maxTradeNotional": 1000, "maxDailyOutflow": 5000, "maxDriftBps": 0, "allowPartialFill": true
}'
curl -s "http://localhost:4000/strategies/<id>/analyze?wallet=0x4444444444444444444444444444444444444444&notional=100"
# -> status: OUTSIDE_POLICY — no auto-trade is sent.
```

Both flows (and position recording + the 10% realized-profit leader fee on
close) were exercised end-to-end against the running API while building
this — see `docs/demo-script.md` for the full transcript.

## What's intentionally not built

Per `overall.md` §43: no cross-chain funding, no perps, no custom DEX, no
lending, no generic AI chatbot, no sell-side automation (BUY-side only for
this MVP), no yield/staking/tokenomics. The 10% leader fee is computed on
realized profit only, never on capital (`backend/packages/strategy-engine/src/fees.ts`).
