# Nansen in CopyCap

CopyCap uses Nansen to discover recent Smart Money token purchases on Monad.
For a purchase that matches a supported Kuru market, the backend adds a buy
capacity estimate and displays the result in the Smart Money Feed.

Nansen supplies the discovery signal. Kuru supplies order-book liquidity,
and CopyCap's capacity engine evaluates that liquidity against price limits.
This document describes the implementation in this repository.

## Where the integration lives

| File | Responsibility |
| --- | --- |
| [Nansen client](../../backend/packages/nansen-client/src/index.ts) | `fetchSmartMoneyDexTrades()` sends the request; `toDomain()` normalizes fields; `mapTradeToSupportedMarket()` matches a bought symbol. |
| [Opportunity service](../../backend/src/lib/nansen.ts) | `getSmartMoneyOpportunities()` selects live or synthetic trades and enriches supported purchases. |
| [Order-book service](../../backend/src/lib/orderbook.ts) | `getOrderBookForMarket()` reads Kuru liquidity or returns a synthetic book. |
| [Capacity engine](../../backend/packages/capacity-engine/src/index.ts) | `calculateBuyCapacity()` estimates executable notional, average price, deviation, and status. |
| [Smart Money route](../../backend/src/routes/smartMoney.ts) | Serves `GET /smart-money/opportunities`. |
| [Shared types](../../backend/packages/shared-types/src/index.ts) | Defines `NansenSmartMoneyTrade` and `SmartMoneyOpportunity`. |
| [Frontend API client](../../frontend/lib/api.ts) | `api.smartMoney()` requests the backend feed. |
| [Smart Money page](../../frontend/app/smart-money/page.tsx) | Renders source labels, counts, and opportunity rows. |
| [Opportunity row](../../frontend/components/SmartMoneyRow.tsx) | Displays trader identity, token pair, trade value, age, and capacity result. |

## Configuration

Use the repository-root `.env`, based on [.env.example](../../.env.example):

```dotenv
NANSEN_API_KEY=your_nansen_api_key_here
MONAD_TESTNET_RPC_URL=your_monad_testnet_rpc_url_here
MONAD_TESTNET_MARKET_ADDRESS=0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9
```

These are placeholders; keep the real Nansen key in the server environment.
The [backend server](../../backend/src/server.ts) loads the root `.env`.
The frontend calls CopyCap's backend and does not need a public Nansen key.
The RPC and market settings control Kuru enrichment, independently of Nansen.

`GET /health` includes `checks.nansenApiKeyConfigured`. This reports whether
the environment value exists; it does not validate the key with Nansen.

## The outbound Nansen request

The service sends this HTTP request, with the placeholder replaced at runtime:

```http
POST /api/v1/smart-money/dex-trades HTTP/1.1
Host: api.nansen.ai
Content-Type: application/json
apikey: your_nansen_api_key_here

{
  "chains": ["monad"],
  "pagination": { "page": 1, "per_page": 10 },
  "order_by": [{ "field": "trade_value_usd", "direction": "DESC" }]
}
```

The complete URL is `https://api.nansen.ai/api/v1/smart-money/dex-trades`.
The service requests the first page of up to ten trades, ordered by trade
value descending. It does not pass label, token, or minimum-value filters,
although the client request type supports them. It does not fetch later pages.

`toDomain()` converts response fields such as `block_timestamp`,
`trader_address_label`, and `token_bought_symbol` to the camel-case fields
used by the API and UI. Transaction hashes, token addresses, trade value,
and optional token ages are retained in the domain object.

The route's response note and the page describe a trailing 24-hour window.
The request contains no date-range parameter. This documents the app's
current behavior and messaging, rather than an independently verified
statement about Nansen's current service limits.

## From signal to capacity

```text
Nansen DEX trades
  -> normalize trade fields
  -> match bought-token symbol to a supported Kuru market
  -> read that market's asks
  -> calculate buy capacity
  -> return discovery opportunities to the Smart Money page
```

The supported-market list currently contains one `MON-USDC` market on
`monad-testnet`. Its address can be overridden with
`MONAD_TESTNET_MARKET_ADDRESS`; its base and quote token addresses in this
discovery list are zero-address placeholders.

Matching compares the bought-token symbol, case-insensitively, with the
portion before `-` in the market symbol. It does not compare chain identity,
token contract addresses, or the token sold. A matching `MON` purchase is
therefore an illustrative mapping into the configured testnet market.
An unmatched purchase is returned as `{ trade }`, with no market or capacity.

For matched purchases, the current calculation uses fixed inputs:

| Input | Current value |
| --- | --- |
| Side | `BUY` |
| Reference price / entry minimum | `1.0` |
| Entry maximum | `1.02` |
| Maximum drift | `100` basis points, or `1%` |
| Requested notional | `500` quote-token units |
| Liquidity | Asks returned by `getOrderBookForMarket()` |

These values are not inferred from the Nansen trade or a user's strategy.
The effective maximum price is `min(1.02, 1.0 * 1.01)`, which is `1.01`.
The engine walks asks within that boundary and returns estimated executable
size, average price, deviation, a status, and a human-readable reason.

## API response and frontend

`GET http://localhost:4000/smart-money/opportunities` returns `source`,
`note`, and `opportunities`. Each opportunity always has `trade`; a matched
opportunity also has `market` and `capacity`.

Open `http://localhost:3000/smart-money` when both development servers are
running. The page shows the feed source, returned-trade count, mapped-market
count, and a "Currently copyable" count. That last count includes both
`COPYABLE` and `LIMITED_CAPACITY`; it does not promise a complete fill.

Rows show the trader label and shortened address, sold and bought symbols,
USD trade value, and relative timestamp. Matched rows show the market and
capacity status/reason. Other rows explain that the token is discovery only.
The displayed trade count is the returned page size, not a full daily total.

## Fallback behavior and current limits

- Missing `NANSEN_API_KEY` returns one synthetic MON purchase with
  `source: "synthetic-fallback"`. A failed live request also logs the error
  and uses that fallback. Successful requests use `source: "live-nansen"`,
  including when Nansen returns no trades.
- The page always displays `source`. Its extra fallback message currently
  says the key is not configured, even when a configured request failed.
- Kuru independently falls back to synthetic asks when its RPC is missing
  or a live read fails. The order-book service records its own source, but
  the Smart Money opportunity response does not include that field.
  Consequently, `live-nansen` confirms only the discovery-feed source;
  it does not establish that the attached capacity used live Kuru liquidity.
- This path has no automatic strategy creation, follow action, order
  submission, or wallet signing. The Smart Money page presents discoveries;
  strategy creation and copy execution are separate application flows.
- There is no weekly winning-trader record, historical performance ranking,
  or backtest in this integration. A Nansen trader label is displayed as
  supplied, and the current request ranks returned trades by value.
- The client performs one request per service invocation and implements no
  pagination loop, retry/backoff, cache, or runtime response-schema validation.

For application setup and the separate trading flow, see the
[root README](../../README.md).
