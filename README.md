# CopyCap

Capacity-aware momentum-breakout strategy copying on Monad.

## Integration guides

- [Kuru](docs/kuru/README.md): live order-book depth, reproducible capacity, and bounded order execution.
- [Nansen](docs/nansen/README.md): Smart Money discovery and capacity-enriched opportunities.
- [Privy](docs/privy/README.md): sign-in, follower trading wallets, and signing policies.

These guides map the current implementation to its source files and describe
the current limits of each integration.

> A trader defines the strategy, the follower defines the risk, and the
> system executes only while the market can still reproduce the opportunity.

See [`overall.md`](./overall.md) for the full product spec this build
implements. This README covers what's built, how to run it, and how to
demo the positive/negative flow.

## Why this isn't just slippage protection

Modern copy-trading platforms already support slippage limits, order-size
caps, and IOC/limit execution. CopyCap's difference is upstream of the
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
    kuru-client/        Kuru reads (@kuru-labs/kuru-sdk) + bounded market-buy encoding
    nansen-client/       real Nansen Smart Money DEX Trades client
    privy-client/        Privy REST client, access-token verification, policy compiler
  scripts/               live-chain verification scripts (not part of the app)

frontend/                Next.js UI: Privy sign-in, Strategy Feed, Smart Money Feed,
                        Strategy Detail with the capacity curve and trading wallet
```

Responsibility split:

```text
NANSEN   -> which opportunity should I look at?
KURU     -> can I still get it at acceptable execution?
COPYCAP  -> is it reproducible for THIS follower?
PRIVY    -> is this exact transaction inside the follower's limits? (checked at signing)
MONAD    -> settle the transaction.
```

## What's real vs. labeled fallback

Nothing here pretends to be a production integration it isn't. Every place
that *can* fall back to a synthetic value does so visibly, via a `source`
field the API/UI always surface (`live-kuru` / `live-nansen` vs
`synthetic-fallback`):

- **Kuru order-book reads** (`backend/packages/kuru-client`) use the real
  `@kuru-labs/kuru-sdk` (`ParamFetcher.getMarketParams`,
  `OrderBook.getL2OrderBook`, `CostEstimator.estimateMarketBuy`) against the real Monad testnet/mainnet contract
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
  capacity engine end to end. **Execution itself is also verified live**:
  `backend/scripts/real-kuru-margin-deposit.ts`
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
- **Kuru market buys are encoded against the deployed contract, not the
  SDK's ABI.** `@kuru-labs/kuru-sdk` 1.0.6 encodes
  `placeAndExecuteMarketBuy(uint32,uint256,bool,bool)` (`0x64216b0f`), but
  the deployed MON-USDC market's implementation only exposes the `uint96`
  variant (`0x7c51d6cf`) — checked by reading the EIP-1967 implementation's
  bytecode. Simulating both against the live market: the SDK's calldata
  reverts with empty data (no such function); ours reaches the function and
  fails only on `TransferFromFailed()` for an unfunded caller.
  `kuru-client/src/orders.ts` encodes the `uint96` form, checks the selector
  exists before sending anything, and simulates every buy with
  `eth_estimateGas` first so a moved book is rejected without spending gas.
- **Privy** (`backend/packages/privy-client`) — see the section below. Without
  `PRIVY_APP_ID` / `PRIVY_APP_SECRET`, sign-in and
  every action that moves funds answer `503 PRIVY_NOT_CONFIGURED`; there is
  no fake wallet fallback. `backend/scripts/verify-privy-live.ts` creates a
  real policy and server wallet, asserts Privy *refuses* two out-of-policy
  transactions, and sends one in-policy approve on Monad testnet. The
  recorded entry price after a fill is the bounded estimate the gate
  approved, not a decoded on-chain `Trade` event.

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

## Privy: identity, a bounded trading wallet, and limits enforced at signing

Privy does three separate jobs, none of which is just login:

1. **Embedded wallet as identity.** Followers sign in with email or Google;
   Privy creates an embedded wallet on first login. Every API call that acts
   for a user carries a Privy access token, verified on the server
   (`privy-client/src/auth.ts`, ES256 against the app's published JWKS);
   the server then only lets a request act as a wallet Privy says that user
   controls. Funding the trading wallet is a transaction from the embedded
   wallet, confirmed in Privy's own UI.
2. **A server wallet per follow.** Following a strategy creates a Privy
   server wallet for that (strategy, follower) pair. The backend signs from
   it through Privy's wallet API, so copies execute with no popup and no
   private key anywhere in this codebase.
3. **The follower's limits compiled into a Privy policy.**
   `compileTradingPolicy` (`privy-client/src/policy.ts`) turns the
   `FollowerPolicy` into rules Privy evaluates before it will sign; anything
   not allowed is denied by default:

   | Allowed transaction | Bound |
   | --- | --- |
   | `approve` the quote token | spender must be this Kuru market; amount ≤ per-trade cap |
   | `placeAndExecuteMarketBuy` on this market | quote size ≤ per-trade cap; only until the entry window closes |
   | `transfer` the quote token | recipient must be the follower's own wallet |
   | native MON transfer | recipient must be the follower's own wallet |

   Changing risk settings re-follows, which updates the live Privy policy.
   The UI's "Try an over-cap trade" asks Privy to sign an approve one unit
   over the cap and shows Privy's refusal.

```text
follower -> Privy login (embedded wallet) -> POST /strategies/:id/follow
  -> Privy policy compiled from the limits + Privy server wallet bound to it
POST /strategies/:id/copy
  -> KOL condition -> follower risk + daily outflow -> live Kuru capacity
  -> bounded buy simulated -> Privy checks policy, signs -> Kuru -> Monad
```

The daily-outflow cap is enforced by CopyCap's own pre-trade check: Privy's
cumulative-spend conditions only apply to `eth_signTransaction`, and copies
use `eth_sendTransaction`.

## Running it

```bash
npm install            # installs the whole workspace
cp .env.example .env    # RPC URLs, Nansen key, and the Privy app id/secret

npm run test --workspaces --if-present   # 55 unit tests (capacity, lifecycle, Privy policy)
npm run build --workspaces --if-present  # typechecks + builds every package

npx tsx backend/scripts/verify-privy-live.ts   # real Privy + Monad testnet check

npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:3000
```

In the Privy dashboard: enable email and Google login, and add Monad
testnet (chain `10143`) for the app.

## Demo script

### In the app (the Privy flow)

1. Sign in with email or Google — Privy creates your embedded wallet.
2. Open a strategy, click **Analyze**, then **Follow** with a max per trade,
   max per day and max drift. A Privy trading wallet is created for this
   follow, bound to a policy compiled from those limits; the panel lists
   the rules Privy enforces.
3. **Add USDC** / **Add 0.05 MON gas** — sent from your embedded wallet,
   confirmed in Privy's UI.
4. **Try an over-cap trade** — Privy refuses to sign it, and the refusal is
   shown.
5. **Copy now** — the backend re-runs the pre-trade gate, simulates the
   bounded Kuru buy, and the trading wallet signs it through Privy. The fill
   links to the Monad explorer and appears under Positions.
6. **Withdraw all** — everything goes back to your embedded wallet, the only
   destination the policy allows.

### From the API

Calls that act for a user need their Privy access token
(`Authorization: Bearer <token>`, from `getAccessToken()` in the app);
`wallet` must be a wallet that user controls.

```bash
curl -s -X POST http://localhost:4000/strategies/<id>/follow   -H "authorization: Bearer $PRIVY_TOKEN" -H "content-type: application/json"   -d '{"maxTradeNotional": 10, "maxDailyOutflow": 20, "maxDriftBps": 200}'
# -> the follow, with tradingWalletAddress + privyPolicyId

curl -s "http://localhost:4000/strategies/<id>/analyze?wallet=<your wallet>&notional=10"
# -> COPYABLE / LIMITED_CAPACITY / OUTSIDE_POLICY, with the full capacity breakdown

curl -s -X POST http://localhost:4000/strategies/<id>/copy   -H "authorization: Bearer $PRIVY_TOKEN" -H "content-type: application/json" -d '{"notional": 10}'
# -> { txHash, position } or a coded refusal (NOT_COPYABLE_*, INSUFFICIENT_FUNDS, PRIVY_POLICY_DENIED, ...)
```

The negative flows still hold: follow with a size the book can't support
inside your drift bound and `/analyze` returns `LIMITED_CAPACITY` ("Only X of
your requested Y is reproducible…"); set `maxDriftBps: 0` below the best ask
and it returns `OUTSIDE_POLICY` — and `/copy` refuses in both cases before
anything is signed.

## What's intentionally not built

Per `overall.md` §43: no cross-chain funding, no perps, no custom DEX, no
lending, no generic AI chatbot, no sell-side automation (BUY-side only for
this MVP), no yield/staking/tokenomics. The 10% leader fee is computed on
realized profit only, never on capital (`backend/packages/strategy-engine/src/fees.ts`).
