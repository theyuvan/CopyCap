---
name: mirrorcap
description: Capacity-aware momentum-breakout strategy copying on Monad via Kuru. Use when a user wants to discover a trader's strategy, check whether they can still reproduce it under live market conditions, follow a trader with their own risk limits, or execute a bounded copy through MetaMask Agent Wallet.
---

# MirrorCap

MirrorCap is not a copy-paste trading bot. It answers one question before
every trade: **can this specific follower still reproduce the trader's
intended entry under the live Kuru order book, inside their own risk
limits?** If not, it waits or refuses — it never silently chases a worse
price.

## When to use each command

### `mm mirrorcap strategies`
Use to discover what momentum-breakout strategies currently exist. No wallet
data is touched. Good first step whenever the user asks "what strategies can
I copy?" or "what's going on with [KOL]?".

### `mm mirrorcap analyze <strategy-id> --wallet <address> --amount <notional>`
Use BEFORE ever recommending a copy. This checks, in order:
1. Is the KOL's strategy condition still valid (price in range, stop not
   breached, entry window not expired)?
2. Is the follower's own risk configuration satisfied (trade size, daily
   outflow cap)?
3. What does the LIVE Kuru order book say the follower's **Reproducible
   Capacity** is at their configured max deviation?

It returns one of: `WAITING`, `COPYABLE`, `LIMITED_CAPACITY`, `DEGRADING`,
`OUTSIDE_POLICY`, `EXPIRED`, `EXIT_ACTIVE` — always with a human-readable
reason. Use this status to decide whether to even suggest `copy`. Never
skip straight to `copy` without analyzing first unless the user explicitly
says to execute immediately knowing the risk.

### `mm mirrorcap follow <strategy-id> --wallet <address> --max-trade <n> --max-drift <pct>`
Use when the user wants to start following a KOL's strategy with their own
risk limits. This only writes risk preferences — it never touches funds.
`--max-drift` is a percentage (e.g. `1` = 1%, converted internally to the
stricter-of-two-bounds the capacity engine uses alongside the KOL's own
entry range).

### `mm mirrorcap copy <strategy-id> --wallet <address> --amount <notional>`
The only command that moves funds. It re-runs the exact same analysis as
`analyze` and will **refuse to execute** unless the result is `COPYABLE`,
`DEGRADING`, or `LIMITED_CAPACITY` with the follower's partial-fill
preference allowing a smaller bounded fill. All signing and submission goes
through MetaMask Agent Wallet's `wallet-submit` capability — this plugin
never holds a private key and never widens the follower's configured price
tolerance, even if the market has moved favorably in the other direction.

Only call this after `analyze` has shown a copyable or degrading status, or
when the user has explicitly asked to attempt a copy and accepted that it
may be rejected by live market conditions.

### `mm mirrorcap status <address>`
Use to check on positions already taken: lifecycle state, open/closed
status, and — once a position closes — realized PnL and the 10% leader
performance fee (charged only on realized profit, never on capital).

## Decision flow an agent should follow

```
User wants to discover opportunities
  -> mm mirrorcap strategies

User is considering copying a specific strategy
  -> mm mirrorcap analyze <id> --wallet <addr> --amount <n>
  -> read the status + reason before saying anything to the user

User wants to start following with their own risk limits
  -> mm mirrorcap follow <id> --wallet <addr> --max-trade <n> --max-drift <pct>

User explicitly wants to execute, AND analyze showed COPYABLE/DEGRADING
(or LIMITED_CAPACITY with partial fills allowed)
  -> mm mirrorcap copy <id> --wallet <addr> --amount <n>

User asks "how am I doing" / "what did I make"
  -> mm mirrorcap status <addr>
```

## What this plugin will never do

- Never submit a trade without first checking the KOL strategy condition,
  the follower's own risk condition, AND live Kuru capacity.
- Never use a backend private key or bypass Agent Wallet's policy/MFA.
- Never widen a follower's configured price tolerance because "the market
  moved a little" — if the bound is breached, the correct answer is to wait,
  reduce size, or skip, not to chase.
- Never auto-enter a strategy after its entry window has expired, even if
  price later re-enters the KOL's range.
- Never force-close an existing position just because the follower
  unfollowed the KOL.
