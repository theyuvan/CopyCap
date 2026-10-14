<p align="center">
  <img src="frontend/public/copycap-badge.png" alt="CopyCap logo" width="96" height="96" />
</p>

<h1 align="center">CopyCap</h1>

<p align="center">
  <strong>Copy it while it's still real.</strong><br />
  Capacity-aware momentum-breakout copy trading on Kuru's live Monad order book.<br />
  Before any copy executes, it answers one question honestly: how much of this trade can <em>this</em> follower actually get, right now?
</p>

<p align="center">
  <img alt="Monad testnet" src="https://img.shields.io/badge/Monad-testnet%20(chain%2010143)-d4ff72?labelColor=0d0f0c" />
  <img alt="Kuru order book" src="https://img.shields.io/badge/Kuru-live%20order%20book-d4ff72?labelColor=0d0f0c" />
  <img alt="Stack" src="https://img.shields.io/badge/stack-Next.js%20%2B%20Express-d4ff72?labelColor=0d0f0c" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-55%20vitest-d4ff72?labelColor=0d0f0c" />
  <img alt="Not deployed" src="https://img.shields.io/badge/live%20app-local%20only-f87171?labelColor=0d0f0c" />
</p>

```bash
git clone <this repo>
cd metropolois && npm install
```

**Run it locally** (nothing is deployed publicly yet — see [Limitations](#limitations-and-honest-notes)):
[Quickstart](#quickstart-about-5-minutes) gets both the API and the app running in about five minutes.

CopyCap is built on one pattern: **a leader's strategy means nothing to a follower until it's checked against what the follower can actually execute.** Most copy-trading products show a leader's historical return and let you click "copy" without ever checking whether that trade is fillable for you, at that size, right now. On a real on-chain order book — not an AMM with effectively infinite liquidity — that's the gap where followers get silently worse fills than promised. CopyCap closes it upstream of the order: every copy first computes **Reproducible Capacity** by walking the live Kuru book, and every trading wallet signs under a Privy policy that bounds exactly what it can do — enforced by Privy itself at signing, not just suggested by this app's UI.

Fork it for any "leader defines an idea, follower bounds their own risk, execution only happens while the market can still reproduce it" pattern — portfolio-rebalance copying, DAO-treasury mirrored trades, or a signal-group bot that refuses to fake a fill.

## Contents

- [The problem](#the-problem)
- [User flow](#user-flow)
- [Bounty checklist](#bounty-checklist)
- [Ecosystem integration: Kuru](#ecosystem-integration-kuru)
- [Services used](#services-used)
- [What it demonstrates](#what-it-demonstrates)
- [Tech stack](#tech-stack)
- [Proof it works](#proof-it-works)
- [Quickstart](#quickstart-about-5-minutes)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Configuration](#configuration)
- [Extend it](#extend-it)
- [Security](#security)
- [Limitations and honest notes](#limitations-and-honest-notes)
- [Troubleshooting](#troubleshooting)
- [Testing](#testing)

## The problem

| Without CopyCap | With CopyCap |
| --- | --- |
| You see a leader's historical return, not whether it's reproducible for you | Every copy shows **Reproducible Capacity**: how much is actually fillable, computed from the live order book, before you click |
| "Copy" either fills badly or silently fails | The gate (`NOT_COPYABLE_*`, `LIMITED_CAPACITY`, `OUTSIDE_POLICY`) refuses *before* anything is signed, with the reason |
| Your downside is bounded by trusting the app's UI | Your downside is bounded by a Privy policy enforced at signing — the app's own checks are a second layer, not the only one |
| A demo under thin liquidity just fakes a fill to look good | A real refusal (`INSUFFICIENT_FUNDS`, `NO_BIDS`) shows as what it is; a `SIMULATED` fallback is always visibly labeled, never passed off as real |
| Leader fees come off your capital | The 10% fee is computed on **realized profit only** — zero on a flat or losing close (`strategy-engine/src/fees.ts`) |

## User flow

```text
Leader                                    Follower
------                                    --------
Sign in (Google/email/wallet)             Sign in (Google/email/wallet — can be
Define a momentum-breakout strategy       a different method than the leader's)
(entry range, target, stop)          Open the strategy, click Analyze
                                      -> Reproducible Capacity, live from Kuru
                                      Follow: set max/trade, max/day, max drift
                                      -> Privy trading wallet + policy created
                                      Fund the trading wallet (from their own wallet)
                                      Copy now
                                      -> real Kuru buy, signed under the policy
                                         or: an honest refusal -> Simulate instead (labeled)
                                      Try an over-cap trade -> Privy refuses it live
                                      Limit sell / Close position
                                      -> real GTC sell, confirms even with no live bid
                                      Withdraw all -> only back to their own wallet
```

## Bounty checklist

What each sponsor's eligibility bar asks for, and where to check it.

**Kuru — "Build the Next Consumer Trading App on Kuru"**

| Requirement | Status | Evidence |
| --- | --- | --- |
| Meaningful use of Kuru, not a cosmetic integration | ✅ | Every price shown and every trade signed goes through the real Kuru order book — see [Ecosystem integration: Kuru](#ecosystem-integration-kuru) |
| Defined target user segments | ✅ | Leaders with a track record, signal-group copy traders, Nansen smart-money watchers, early Monad-native users |
| Roadmap beyond the hackathon | ✅ | Security review before real funds, mainnet market expansion, leader analytics, deeper Nansen auto-strategy detection |

**Nansen AI — "Best use of Nansen"**

| Requirement | Status | Evidence |
| --- | --- | --- |
| Meaningful integration of a Nansen API endpoint | ✅ | Real `POST /smart-money/dex-trades` call, filtered to Monad, each trade mapped to the live Kuru market and run through the real capacity engine — not a display widget |
| Honest fallback, not silent fake data | ✅ | `source: "live-nansen"` vs `"synthetic-fallback"` returned explicitly by the API |

**Privy — "Integrate Privy beyond authentication"**

| Requirement | Status | Evidence |
| --- | --- | --- |
| Used for more than login | ✅ | Server (embedded) trading wallets, a compiled signing policy, real `sendTransaction` for every buy/sell/limit-sell/withdrawal |
| Demo clearly shows Privy-powered functionality | ✅ | The guardrail test — Privy refusing an over-cap transaction, live — see [Security](#security) |

## Ecosystem integration: Kuru

**Kuru's live order book is load-bearing.** It isn't a price feed CopyCap glances at — it's the thing the entire product's honesty claim depends on. Remove it and Reproducible Capacity has nothing real to compute from.

- Every strategy's capacity figure comes from walking Kuru's real `getL2Book()` depth (`backend/packages/kuru-client/src/client.ts`), not a cached or assumed price.
- Every buy, market sell, and limit sell is a real signed call against the deployed Kuru order-book contract, encoded against its actual bytecode selector — not just the SDK's published ABI, which was found to be wrong for the live buy function (see [Security](#security)).
- The capacity engine (`backend/packages/capacity-engine`) is Kuru-shaped on purpose: it walks asks for buys and bids for sells, bounded by the follower's own drift tolerance, exactly matching how a real order book fills a real order.

What a follower gets that's hard to build without this: a pre-trade number that's actually reproducible, not a backtest.

## Services used

| Service | Where | What it does here |
| --- | --- | --- |
| **Kuru order book reads** | `backend/packages/kuru-client/src/client.ts` | Live `MarketParams`, `getL2Book()` depth, and AMM vault levels merged in, feeding the capacity engine |
| **Kuru market buy / sell / limit sell** | `backend/packages/kuru-client/src/orders.ts` | Real signed calls, encoded against the deployed contract's verified selectors |
| **Privy auth** | `frontend/components/WalletProvider.tsx` | Google, email or external wallet (e.g. MetaMask) sign-in, all resolving to the same user model |
| **Privy server wallets** | `backend/src/lib/execution.ts` (`provisionTradingWallet`) | A dedicated wallet per (strategy, follower), signed server-side — no popup, no local key |
| **Privy policy engine** | `backend/packages/privy-client/src/policy.ts` | 6 named rules compiled from the follower's own risk settings, enforced at signing |
| **Nansen Smart Money** | `backend/packages/nansen-client`, `backend/src/lib/nansen.ts` | Real DEX-trades signal, mapped to the live Kuru market and run through the real capacity engine |

## What it demonstrates

| Capability | How it's used here |
| --- | --- |
| **Reproducible Capacity** (the core idea) | Walks the live book bounded by the follower's own drift tolerance — a computed number, not a promise. Buy side walks asks, sell side walks bids, same engine, same honesty. |
| **Privy policy enforcement at signing** | The trading wallet's policy is checked by Privy itself, independent of this app's own pre-trade gate — proven live by the guardrail test, not just asserted. |
| **Real market + limit execution** | `submitBoundedBuyOrder`, `submitBoundedSellOrder` (IOC, needs live liquidity) and `placeLimitSellOrder` (GTC, confirms even with none) — all real signed calls, not simulated backend writes. |
| **Honest refusal over fake success** | `NO_LIVE_BOOK`, `INSUFFICIENT_FUNDS`, `NO_BIDS`, `PRIVY_POLICY_DENIED` are real refusals shown as what they are; nothing silently substitutes a fake fill. |
| **Clearly-labeled simulation as a last resort** | When real execution genuinely can't proceed (no faucet for this testnet's quote token — see Limitations), the UI offers a `SIMULATED` result computed from real, live numbers — never indistinguishable from a real transaction. |
| **10% profit-only leader fee** | Computed on realized profit, zero on flat/loss, never on capital (`strategy-engine/src/fees.ts`). |

## Tech stack

| Layer | Choice |
| --- | --- |
| Chain | Monad testnet (chain `10143`) |
| Order book | Kuru (`@kuru-labs/kuru-sdk`, plus bytecode-verified custom encoding) |
| Wallets / signing | Privy (embedded + server wallets, compiled policies) |
| Off-chain signal | Nansen Smart Money DEX Trades API |
| Backend | Express, TypeScript, npm workspaces |
| Frontend | Next.js 14 (App Router), React 18, Tailwind, Framer Motion |
| Testing | Vitest — 55 unit tests across capacity, lifecycle and policy logic |

## Proof it works

Everything below is a real Monad testnet transaction, not a fixture.

| Step | Evidence |
| --- | --- |
| `MarginAccount.deposit` via a plain `ethers.Wallet` against the live Kuru contract | [`0xdcc502e5…b76b`](https://testnet.monadexplorer.com/tx/0xdcc502e53630e57ef93d0bdbc196b76fdab6ef337c59c1bbb51db2e71753b76b), block `69518421`, independently re-verified by reading the deposit back via `MarginAccount.getBalance()` |
| Real GTC limit sell resting on the live book right now | 220 MON at 1.1, confirmed by reading `getL2Book()` directly (`backend/scripts/real-kuru-sell.ts`) |
| Kuru market address in active use | [`0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9`](https://testnet.monadexplorer.com/address/0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9) |

This list is intentionally short rather than padded — every row above is something you can re-verify yourself on the explorer right now. More transactions (a full copy → close loop) need a small amount of this market's quote token, which has no public faucet; see [Limitations](#limitations-and-honest-notes).

## Quickstart (about 5 minutes)

**Prerequisites**

- Node.js (developed on v24; no `engines` field pinned, but recent LTS should work)
- A [Privy](https://dashboard.privy.io) app, with email + Google login enabled and Monad testnet (chain `10143`) added as a supported chain
- A Monad testnet RPC URL (the public `https://testnet-rpc.monad.xyz` works) and some testnet MON from [faucet.monad.xyz](https://faucet.monad.xyz)

**1. Install**

```bash
npm install
cp .env.example .env
```

Fill in `.env` — see [Configuration](#configuration) for what each variable does. RPC URLs are the minimum for real demo credibility; without them, Kuru reads fall back to a clearly-labeled synthetic book instead of crashing.

**2. Run it**

```bash
npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:3000
```

**3. Try the flow.** Sign in, open a strategy, Follow with your own risk limits, fund the trading wallet it creates, then Copy. If the quote token isn't funded (see Limitations), use **Simulate this instead** to see the same flow with clearly-labeled figures. **Try an over-cap trade** shows Privy's own refusal live.

**Prefer the terminal?**

```bash
npx tsx backend/scripts/verify-privy-live.ts   # real Privy policy + Monad testnet check
npx tsx backend/scripts/real-kuru-sell.ts      # real GTC limit sell on the live book
```

## How it works

```text
Follower -> Privy login -> POST /strategies/:id/follow
  -> Privy policy compiled from the follower's own limits
  -> Privy server wallet created, bound to that policy

POST /strategies/:id/copy
  -> KOL condition -> follower risk + daily outflow -> live Kuru capacity
  -> bounded buy simulated first (eth_estimateGas) -> Privy checks policy, signs -> Kuru -> Monad

POST /strategies/:id/follow/limit-sell
  -> live book checked for context -> GTC order encoded against the verified
     deployed selector -> Privy checks policy, signs -> rests on Kuru's book
     -> confirms on-chain whether or not it's ever matched
```

**Reproducible Capacity**, pinned down (`overall.md` specifies the steps, not the formula — this is what `capacity-engine/src/index.ts` actually computes):

- `referencePrice = strategyEntryMin` for buys (the leader's most favorable boundary); the live best bid for sells.
- `effectiveMaxPrice` (buys) / `effectiveMinPrice` (sells) = the follower's own drift bound, clamped by the strategy's own range — the **stricter** of the two always wins, never silently widened.
- `expectedAveragePrice` is computed only over the book levels needed to fill *this follower's* requested size, not the whole book.
- `DEGRADING` vs `COPYABLE`: fully fillable, but the fill would burn more than 60% of the allowed drift budget → `DEGRADING` (still executes, flagged).

**The daily-outflow cap is enforced by CopyCap's own pre-trade check, not Privy** — Privy's cumulative-spend conditions only apply to `eth_signTransaction`, and copies use `eth_sendTransaction`. Named honestly here rather than implied as a Privy guarantee it isn't.

## Project layout

```
backend/
  packages/
    shared-types/       domain types (Strategy, FollowerPolicy, CapacityResult, Position, ...)
    capacity-engine/     Reproducible Capacity — buy (asks) and sell (bids), 21 unit tests
    strategy-engine/      lifecycle state machine, pre-trade gate, 10% fee math, 25 unit tests
    kuru-client/          Kuru reads + bounded buy/sell/limit-sell encoding, bytecode-verified
    nansen-client/        real Nansen Smart Money DEX Trades client
    privy-client/         Privy REST client, access-token verification, policy compiler, 9 unit tests
  src/
    lib/execution.ts      wallet provisioning, real copy/close/sell/limit-sell execution
    lib/orderbook.ts      live Kuru reads with a labeled synthetic fallback
    lib/nansen.ts         live Smart Money reads with a labeled synthetic fallback
    routes/strategies.ts  the API surface above
  scripts/                live-chain verification scripts (not part of the running app)

frontend/
  app/                   landing page, strategy feed, strategy detail, smart money, portfolio
  components/
    TradingWalletPanel.tsx    balances, funding, real sell / limit-sell, the policy rule list
    CopyActionPanel.tsx       real copy attempt -> honest refusal -> labeled Simulate fallback
    ClosePositionButton.tsx   same pattern, for closing a position
    WalletProvider.tsx        Privy sign-in: Google, email or external wallet
  public/
    copycap-logo.png, copycap-badge.png, copycap-logo-lockup.png   brand assets
```

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `MONAD_TESTNET_RPC_URL` / `MONAD_MAINNET_RPC_URL` | `.env` | Without these, Kuru reads fall back to a labeled synthetic book |
| `MONAD_TESTNET_MARKET_ADDRESS` | `.env` | Overrides the default demo market; defaults to the real MON-USDC market above |
| `NANSEN_API_KEY` | `.env` | Without it, the Smart Money feed returns one labeled synthetic trade instead of live data |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | `.env` | Required for sign-in and every fund-moving action; without them the API answers `503 PRIVY_NOT_CONFIGURED`, never a fake wallet |
| `NEXT_PUBLIC_PRIVY_APP_ID` | `.env` | Same app id, exposed to the browser for the login modal |
| `NEXT_PUBLIC_API_URL` / `MIRRORCAP_API_URL` | `.env` | Where the frontend finds the backend |

## Extend it

**Add a Kuru market.** `getDefaultMarket` (`backend/packages/kuru-client/src/addresses.ts`) is the one place the demo market is chosen; point `MONAD_TESTNET_MARKET_ADDRESS` at another live Kuru market and the capacity engine, order encoding and policy compiler all follow — none of them hardcode this specific pair beyond that lookup.

**Add a strategy type.** `StrategyType` (`shared-types/src/index.ts`) is currently the single literal `"MOMENTUM_BREAKOUT"` by design, kept narrow for this build rather than generalized speculatively — the capacity engine and lifecycle machine are both written against entry/target/stop semantics generic enough to extend without a rewrite.

**Fork it into something else.** The pattern is "a leader's idea, bounded by a follower's own risk, executed only while it's still reproducible." DAO-treasury mirrored trades, a signal-bot that refuses to fake a fill, or any copy-execution product on a real order book.

## Security

**This has not been audited.** The sell-side execution path, the limit-order path, and the expanded Privy policy were all built and tested this session, not reviewed externally. Treat anything here handling real funds accordingly — see [Limitations](#limitations-and-honest-notes).

### In one picture

```
 Follower                         This app's backend                 Privy + Kuru + Monad
 --------                         -------------------                 --------------------
 signs in (Google/email/wallet)   verifies the Privy access token
 sets max/trade, max/day, drift   runs the pre-trade gate
                                   (KOL condition, risk, live capacity)
                                   builds the bounded order            Privy checks the signed-in-policy
                                   requests a signature          ──►   rules before it will sign anything
                                                                       in or out of cap? in or out of window?
                                                                       right destination for a transfer?
                                                                       ALLOW -> signs -> Kuru -> Monad
                                                                       anything else -> DENY, refused
```

The backend's own pre-trade gate is the first layer; Privy's policy is the second, independent one, checked by Privy itself at the moment of signing — proven live by the guardrail test below, not just asserted in this README.

### The Privy policy

| Allowed transaction | Bound |
| --- | --- |
| `approve` the quote token | spender must be this Kuru market; amount ≤ per-trade cap |
| `placeAndExecuteMarketBuy` on this market | quote size ≤ per-trade cap; only until the entry window closes |
| `placeAndExecuteMarketSell` on this market | scoped to this market's sell function; no size cap — a sell can only convert the wallet's own MON into quote token that stays in the same wallet |
| `addSellOrder` (GTC limit sell) on this market | same scoping, same reasoning |
| `transfer` the quote token | recipient must be the follower's own wallet |
| native MON transfer | recipient must be the follower's own wallet |

Everything else: denied by default. Six rules, no exceptions list.

| Attack | Why it fails | Where it's proven |
| --- | --- | --- |
| Ask the trading wallet to sign a trade over the follower's cap | The calldata condition on the trade-size field rejects it; Privy never signs | the UI's "Try an over-cap trade" — a live refusal, not a mocked one; `policy.test.ts`: *"caps the ERC-20 approve to the Kuru market at the per-trade cap"* |
| Redirect withdrawn funds to another address | The `transfer`/native-send rules require the recipient to be the follower's own wallet, full stop | `policy.test.ts`: *"lets funds leave only toward the follower's own wallet"* |
| Buy after the strategy's entry window has closed | A `system`/`current_unix_timestamp` condition on the buy rule itself | compiled into every policy at follow-time |
| Sell or limit-sell outside the market this wallet is scoped to | Both rules are scoped to the specific market address, verified against its actual deployed selector, not assumed from the SDK | `policy.test.ts`: *"scopes market sell and limit sell to this market, uncapped in size"* |
| A wrong function selector reaching the chain | `assertMarketSupportsBuy` / `assertMarketSupportsSell` check the deployed bytecode contains the expected selector before anything is sent | `kuru-client/src/orders.ts` |
| A fake fill shown as real | Every read/write surfaces its real `source` (`live-kuru`/`live-nansen` vs `synthetic-fallback`); any demo-mode result keeps a `SIMULATED` label on screen for its full duration | `frontend/components/CopyActionPanel.tsx`, `ClosePositionButton.tsx` |

## Limitations and honest notes

- **Not audited.** Said twice on purpose — this is the thing to internalize before trusting this code with real funds.
- **Not deployed anywhere public.** Local only; see Quickstart.
- **This testnet market's quote token has no faucet.** It's a custom test token (`0x3bA3d39…`), not Circle's official Monad testnet USDC — Circle's faucet mints a *different* contract that this market doesn't accept. A real buy genuinely can't execute right now without finding a holder of this specific token.
- **This testnet market currently has real ask liquidity but zero bid liquidity**, verified directly against the live order book. A real *market* sell has nothing to fill into right now; the GTC *limit* sell works regardless, since a resting order doesn't need a counterparty to confirm.
- **One market, one chain, for this build.** Single Kuru MON-USDC pair on testnet; see [Extend it](#extend-it) for what generalizes and what was kept narrow on purpose.
- **No license file yet.** This is original work from this build; a license hasn't been chosen and committed.
- **Nansen depends on a paid API key.** Without `NANSEN_API_KEY`, the Smart Money feed is one clearly labeled synthetic trade, not an error and not silently live-looking data.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Sign-in shows "unavailable" | `NEXT_PUBLIC_PRIVY_APP_ID` isn't set, or the frontend was started before `.env` was filled in — restart `npm run dev:web` after editing `.env` |
| `Copy now` returns `INSUFFICIENT_FUNDS` | The trading wallet has no quote-token balance — this market's quote token has no faucet (see Limitations); use **Simulate this instead** |
| A sell returns `NO_BIDS` | The live book's bid side is genuinely empty right now — use **Limit sell (real, any liquidity)** instead, which rests regardless |
| A buy or sell returns `NO_LIVE_BOOK` | `MONAD_TESTNET_RPC_URL` isn't set, or the RPC call failed — the app refuses to trade on the synthetic fallback rather than fake a fill |
| `PRIVY_POLICY_DENIED` on an action you expected to work | Check the 6 rules in the trading wallet panel — the transaction's `to`, function or recipient doesn't match one of them, by design |
| Navigating between pages shows a blank page | Known App Router issue with `AnimatePresence mode="wait"` keyed by pathname; fixed in `frontend/components/PageTransition.tsx` (enter-only transition, no exit race) |

## Testing

```bash
npm run test --workspaces --if-present   # 55 unit tests: capacity (21), lifecycle (25), Privy policy (9)
npm run build --workspaces --if-present  # typechecks + builds every package

npx tsx backend/scripts/verify-privy-live.ts     # real Privy + Monad testnet check
npx tsx backend/scripts/verify-kuru-live.ts      # real Kuru order-book read check
npx tsx backend/scripts/real-kuru-sell.ts        # real GTC limit sell on the live book
```

## Integration guides

- [Kuru](docs/kuru/README.md): live order-book depth, reproducible capacity, and bounded order execution.
- [Nansen](docs/nansen/README.md): Smart Money discovery and capacity-enriched opportunities.
- [Privy](docs/privy/README.md): sign-in, follower trading wallets, and signing policies.

See [`overall.md`](./overall.md) for the full product spec this build implements.

## License

No license file is committed yet. This is original work built for this hackathon submission.
