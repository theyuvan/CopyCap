# Privy in CopyCap

CopyCap uses Privy for sign-in, wallet identity, and server-side transaction signing.
Each strategy follow can have a separate trading wallet whose attached policy restricts
the transactions the backend requests. Kuru supplies the market execution; CopyCap's
backend calculates capacity and applies the follower's trading limits.

The implementation lives in [privy-client](../../backend/packages/privy-client/),
[API authentication](../../backend/src/lib/auth.ts), and
[execution services](../../backend/src/lib/execution.ts).
Workspace package names retain the earlier `@mirrorcap/*` name.

## Identity and the two wallets

The [wallet provider](../../frontend/components/WalletProvider.tsx) configures wallet,
email, and Google login. Email/social users without a wallet can receive an embedded
Ethereum wallet on login, subject to the app's Privy configuration. The provider uses
Monad testnet, chain `10143`, as its only supported browser chain.

There are two wallet roles:

| Wallet | Purpose | How transactions start |
| --- | --- | --- |
| Signed-in user's wallet | Identifies the follower or creator; funds the trading wallet; receives withdrawals | Browser uses Privy's transaction UI |
| Trading wallet | Holds funds allocated to one strategy and follower | Backend requests signing through Privy's wallet RPC |

The frontend sends the Privy access token as `Authorization: Bearer ...` through
[the API client](../../frontend/lib/api.ts). On protected routes:

1. [`verifyAccessToken`](../../backend/packages/privy-client/src/auth.ts) verifies the
   JWT with the app's remote JWKS, requiring ES256, issuer `privy.io`, the configured
   app ID as audience, and a subject identifying the Privy user.
2. [`requirePrivyUser`](../../backend/src/lib/auth.ts) loads that user's linked Ethereum
   wallet accounts from Privy. [Wallet lookups](../../backend/src/lib/privy.ts) are cached
   for five minutes; embedded wallets are ordered first.
3. `actingWallet` accepts a requested address only if it matches a linked wallet,
   ignoring address case. Without an address, it uses the first verified wallet.

Strategy creation, follow/unfollow, copy, sell, withdrawal, guardrail probing, and
position closing use this check. Closing a strategy requires its creator's wallet;
closing a position requires its follower's wallet. A body-supplied address alone is
insufficient. The persisted Privy user ID is metadata; authorization checks linked
wallet ownership on requests, rather than comparing that stored ID alone.

Read endpoints, including trading-wallet balances and rule names, are currently public.
Follower responses omit the Privy user DID, but can include trading-wallet and policy IDs.
See [strategy routes](../../backend/src/routes/strategies.ts) for the access boundaries.

## Provisioning a trading wallet

`POST /strategies/:id/follow` accepts the follower's limits, verifies the acting wallet,
and enforces the strategy's active-follower cap when configured. It then:

1. Reads the market's chain, quote token, and amount precision from the configured RPC.
2. Compiles the per-trade quote cap and strategy entry expiry into a Privy policy.
3. Creates a policy, or updates the existing policy when risk settings change.
4. Creates a server wallet with that policy attached if this follow has no wallet yet.
5. Saves the policy ID, wallet ID/address, and user ID with the follower record.

The wallet external ID and idempotency key derive from the strategy ID and lowercase
follower address. Updating an existing follow reuses its trading wallet. Following does
not fund the wallet. [TradingWalletPanel](../../frontend/components/TradingWalletPanel.tsx)
provides quote-token transfers, a MON gas top-up, and custom MON transfers from the user's
wallet. Copying needs quote tokens to spend and MON to pay transaction fees.

## What the attached policy permits

[`compileTradingPolicy`](../../backend/packages/privy-client/src/policy.ts) emits six
`ALLOW` rules for `eth_sendTransaction` and relies on Privy denying unmatched requests.
Every rule includes the selected chain ID. Address comparisons accept the supplied
checksummed address and its lowercase representation.

| Action | Conditions compiled into the policy |
| --- | --- |
| Approve quote tokens | Destination is the market's quote token; `approve.spender` is this Kuru market; allowance amount is at most the per-trade cap in token units |
| Market buy | Destination is this market; the buy ABI's quote-size argument is at most the cap in market units; current timestamp is no later than entry expiry |
| Market sell | Destination is this market; calldata matches the sell ABI; size is at most `uint96` maximum |
| Limit sell | Destination is this market; calldata matches `addSellOrder`; size is at most `uint96` maximum |
| Return quote tokens | Destination is the quote-token contract; `transfer.to` is the follower's wallet |
| Return native funds | Transaction destination is the follower's wallet |

The sell bounds are effectively uncapped amounts within the ABI's type range: they
do not apply the buy notional cap or entry expiry. Quote returns have no amount cap.
The native-return rule checks chain and destination only; it does not constrain calldata
or value. The backend's withdrawal implementation sends a plain native transfer.

These rules do not encode every setting shown in the UI:

| Limit or decision | Enforcement in this repository |
| --- | --- |
| Per-buy notional and entry expiry | Backend checks plus Privy policy predicates |
| Daily quote outflow | Backend pre-trade check and JSON-backed accounting |
| Entry range, stop, strategy lifecycle, unfollowed state | Backend strategy evaluation |
| Maximum price drift and available liquidity | Capacity engine and backend order construction |
| Minimum output and fill-or-kill choice | Encoded Kuru transaction parameters |
| Maximum active followers | Backend follow route |

The policy does not independently constrain `minAmountOut`, limit-sell price, or the
fill-or-kill flag. Daily outflow uses the follower address and UTC date, aggregating
recorded buys across strategies; each follow's configured daily cap is used for its
request. It is not a Privy rolling spending limit or a measure of every wallet transfer.
See [pre-trade evaluation](../../backend/packages/strategy-engine/src/pretrade.ts) and
[the store](../../backend/src/lib/store.ts).

## Copy, exit, and withdrawal flows

[QuickFollowButton](../../frontend/components/QuickFollowButton.tsx) creates or updates
the follow. [CopyActionPanel](../../frontend/components/CopyActionPanel.tsx) requests
`POST /strategies/:id/copy`. The backend rechecks strategy state, follower limits, live
book capacity, token balance, and gas. It refuses synthetic books for execution.

The [Kuru order adapter](../../backend/packages/kuru-client/src/orders.ts) constructs
bounded calldata, approves quote tokens when needed, and estimates market-order gas.
[`RelaySigner`](../../backend/packages/kuru-client/src/relaySigner.ts) forwards the
transaction without holding a private key. The [Privy client](../../backend/packages/privy-client/src/client.ts)
calls `/wallets/{id}/rpc` with `eth_sendTransaction`; Privy evaluates the attached policy,
signs, and broadcasts. The backend waits for confirmation and records the transaction hash.
Policy refusals on this path become `PRIVY_POLICY_DENIED` responses for the UI.

[ClosePositionButton](../../frontend/components/ClosePositionButton.tsx) calls
`POST /strategies/:id/positions/:positionId/close`. The backend evaluates bids and builds
a bounded native-token sell. `/follow/sell` uses a similar path without a tracked position.
`/follow/limit-sell` submits a resting order at the requested price; placement does not
prove that an order filled and does not use the market-sell capacity check.

`/follow/withdraw` sends the available quote-token balance and then native funds minus
a gas reserve to the follower's wallet. It does not cancel orders, reclaim funds already
held by market contracts, or reconcile open position records. Unfollowing prevents new
copies through backend checks; it does not withdraw funds or revoke the attached policy.

## Local configuration

Use the root [.env.example](../../.env.example) as the template for a local `.env`.
The backend and [Next.js configuration](../../frontend/next.config.mjs) both load it.
Provide your own values; these are placeholders, not credentials:

```dotenv
PRIVY_APP_ID=<your-privy-app-id>
PRIVY_APP_SECRET=<your-server-app-secret>
NEXT_PUBLIC_PRIVY_APP_ID=<the-same-privy-app-id>
MONAD_TESTNET_RPC_URL=<your-monad-testnet-rpc-url>
NEXT_PUBLIC_MONAD_TESTNET_RPC_URL=<your-monad-testnet-rpc-url>
MIRRORCAP_API_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Configure the Privy app for the login methods and embedded-wallet behavior above, with
Monad testnet available. Keep the app secret server-side; no JWT verification key or
trading-wallet private key is required by this implementation. After dependency setup,
run the root `npm run build`, then `npm run dev:api` and `npm run dev:web` in separate terminals.
Restart the app after environment changes. `/health` reports `privyConfigured` from the
presence of both server values; this is not a live credentials or policy verification.

## Verification and current limits

Run `npm run test --workspace @mirrorcap/privy-client` for the
[policy compiler tests](../../backend/packages/privy-client/test/policy.test.ts).
These test generated rules locally; they do not prove live signing or settlement.

The wallet panel's guardrail action asks Privy to approve one token base unit over the
cap. Only a `policy_violation` response counts as the expected refusal. This is a real
submission attempt: if allowed, it can broadcast an approval and spend gas.
The [live verification script](../../backend/scripts/verify-privy-live.ts) also exercises
approvals, but currently omits the compiler's required `marketSellAbi` and `limitSellAbi`
inputs. Update those inputs before using that script; its presence is not proof of a
successful live run.

Trading wallets are app-controlled server wallets in this code. Creation supplies policy
IDs, but no user owner or delegated authorization key. The backend uses the app secret
to send transactions and update policies. Policy restrictions therefore do not establish
exclusive user custody or immutable protection against the app operator.

The browser targets testnet only. Backend network selection includes mainnet, but the
current code and these instructions do not establish mainnet readiness. Sells and closes
support native base assets, and execution rejects native-quoted markets. Demo seed records
can lack real wallet IDs and transaction hashes. Entry quantities/prices use bounded
estimates; exit proceeds prefer transfer logs and fall back to minimum output. Partial
closes are currently recorded as closed without tracking the remaining position.
JSON persistence and process-local locks also need review before concurrent production use.
