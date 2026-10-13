# Kuru integration in CopyCap

CopyCap uses Kuru as its execution venue and its source of market depth.
Before copying a momentum-breakout strategy, it calculates how much of the
follower's requested trade fits inside their price tolerance using Kuru's
order book. Approved market buys and sells then settle through Kuru on Monad,
with transactions signed by a [Privy trading wallet](../privy/README.md).

This integration addresses a practical problem for signal-group followers:
a leader's entry price does not prove the same trade is still available to
someone following later or trading a different size. CopyCap checks that
question against the available depth before submitting the order.

## Where Kuru is used

| Source | Responsibility |
| --- | --- |
| [Kuru client](../../backend/packages/kuru-client/src/client.ts) | Load market parameters and read resting orders plus the Kuru AMM vault's implied liquidity ladder. |
| [Market addresses](../../backend/packages/kuru-client/src/addresses.ts) | Repository-configured Monad testnet and mainnet markets and chain IDs. |
| [Order-book service](../../backend/src/lib/orderbook.ts) | Select the network RPC and label the snapshot `live-kuru` or `synthetic-fallback`. |
| [Capacity engine](../../backend/packages/capacity-engine/src/index.ts) | Walk asks for buys and bids for sells to calculate reproducible capacity. |
| [Pre-trade checks](../../backend/packages/strategy-engine/src/pretrade.ts) | Combine strategy conditions, follower risk limits, daily outflow, and buy capacity. |
| [Bounded order builders](../../backend/packages/strategy-engine/src/execution.ts) | Turn capacity results into order parameters with minimum output protection. |
| [Kuru orders](../../backend/packages/kuru-client/src/orders.ts) | Encode, simulate, and submit buys and sells; place GTC limit sells using the SDK. |
| [Relay signer](../../backend/packages/kuru-client/src/relaySigner.ts) | Adapt ethers transactions to an external signer without holding a local signing key. |
| [Execution service](../../backend/src/lib/execution.ts) | Recheck capacity and balances, call Privy, and record confirmed transactions. |
| [Strategy routes](../../backend/src/routes/strategies.ts) | Expose analysis, copying, position closing, and trading-wallet operations. |

The [strategy detail page](../../frontend/app/strategies/[id]/page.tsx)
shows the analysis and order-book source. [Copy controls](../../frontend/components/CopyActionPanel.tsx)
and [close controls](../../frontend/components/ClosePositionButton.tsx) call
the backend and show the returned transaction hash. The
[Nansen feed](../nansen/README.md) also uses Kuru depth to enrich supported signals.

## From market depth to reproducible capacity

`getLiveOrderBook` reads raw `getL2Book()` bytes and decodes large integers
with ethers `BigNumber` before converting prices and sizes for the capacity
calculation. It also reads vault parameters through `@kuru-labs/kuru-sdk`,
builds an implied AMM ladder, merges matching price levels, and sorts asks
ascending and bids descending. Kuru depth here includes both resting orders
and vault liquidity; it is not modeled as unlimited liquidity.

For a buy, the capacity engine calculates:

```text
followerBoundPrice = strategyEntryMin * (1 + maxDriftBps / 10000)
effectiveMaxPrice = min(strategyEntryMax, followerBoundPrice)
reproducibleCapacityNotional = sum(price * size) inside that bound
```

It separately walks only the depth needed for the requested size to estimate
the follower's average execution price. The result includes capacity,
executable notional, expected deviation, and a status such as `COPYABLE`,
`DEGRADING`, `LIMITED_CAPACITY`, or `OUTSIDE_POLICY`.

Closing a position mirrors this process on bids. The price floor is the
current best bid multiplied by `1 - maxDriftBps / 10000`; capacity is measured
in base-asset units. A limited-capacity trade can proceed with a smaller
amount when the follower allows partial fills and executable size is positive.

## What happens when a follower copies

1. `POST /strategies/:id/copy` authenticates the user and resolves a wallet
   they control. The follow must already have a Privy trading wallet.
2. `executeCopy` reevaluates strategy conditions, per-trade and daily limits,
   and capacity. It refuses to execute using a synthetic order book.
3. The bounded order is rounded to the market's amount precision. The backend
   checks quote-token funds and native MON for gas.
4. `submitBoundedBuyOrder` checks that the configured buy selector appears in
   the market or its proxy implementation. It approves the required quote
   amount if the current allowance is insufficient.
5. The buy is simulated with `estimateGas`, then passed through `RelaySigner`
   to Privy for signing and broadcast. A needed approval is a separate
   transaction and can spend gas before this buy simulation.
6. After a successful receipt, the backend records a position and transaction
   hash, updates daily outflow, and advances the strategy lifecycle.

The buy calldata uses
`placeAndExecuteMarketBuy(uint96,uint256,bool,bool)`. The repository encodes
this directly because its SDK compatibility checks found a different buy
signature in the SDK version used during development. Minimum output is
encoded in the transaction; a successful pre-trade estimate alone is not a
guarantee that the book will remain unchanged.

## Sells and limit orders

`POST /strategies/:id/positions/:positionId/close` uses sell-side capacity,
checks balances, and submits `placeAndExecuteMarketSell` with a minimum
quote output. This implementation supports native-base markets such as the
configured MON pair. The base amount travels as transaction value.

`POST /strategies/:id/follow/sell` sells native MON from the trading wallet
for quote tokens without requiring an existing CopyCap position.
`POST /strategies/:id/follow/limit-sell` places a GTC limit sell through
`GTC.placeLimit`. A confirmed resting order proves placement, not a fill;
it can remain unmatched when there is no opposing liquidity.

## Configuration and local checks

Use the root [.env.example](../../.env.example) as the configuration template.
The default app flow targets the configured Monad testnet MON-USDC market.

| Variable | Use |
| --- | --- |
| `MONAD_TESTNET_RPC_URL` | Read and submit against Monad testnet. |
| `MONAD_TESTNET_MARKET_ADDRESS` | Override the default testnet market in app paths that read this setting. |
| `MONAD_MAINNET_RPC_URL` | Mainnet reads and market diagnostics. |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Backend wallet and signing operations. |

Run the existing offline engine tests from the repository root:

```bash
npm test --workspace @mirrorcap/capacity-engine
npm test --workspace @mirrorcap/strategy-engine
```

[check-mainnet-markets.ts](../../backend/scripts/check-mainnet-markets.ts)
reads configured mainnet MON-USDC and MON-AUSD books. It is a read-only
diagnostic, not evidence that the complete app is ready for mainnet.
Other scripts in `backend/scripts/` can submit real transactions; inspecting
their source and funding requirements is separate from running unit tests.

## Current implementation boundaries

- Missing RPC configuration or a failed book read can produce an explicitly
  labeled synthetic snapshot for analysis. Market buy and sell execution
  rejects that fallback instead of treating it as executable liquidity.
- Entry price, recorded base amount, and quote spent are currently based on
  bounded estimates, not fully decoded buy fills. Sell proceeds use matching
  quote-token transfer logs when present and otherwise fall back to minimum
  output. Transaction confirmation and exact fill accounting are different.
- Partial closes currently mark the position closed even if only the
  executable portion was sold. Residual-position accounting needs refinement.
- The frontend offers labeled local simulations after some failed actions.
  They do not create a confirmed transaction or persist an executed position.
- The application calculates a leader fee from realized-profit accounting;
  this is not an implemented on-chain fee distribution contract.
- Mainnet addresses and read support exist, while wallet UI defaults and
  explorer links target testnet. No new live execution verification was run
  to produce this document.

Further work includes more supported markets, complete fill and residual
accounting, verified leader performance, and broader mainnet validation.
