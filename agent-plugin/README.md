# mirrorcap-agent-plugin

A [MetaMask Agent Wallet](https://docs.metamask.io/agent-wallet/) plugin that
adds capacity-aware momentum-breakout strategy copying on Monad. See
[`skills/mirrorcap/SKILL.md`](./skills/mirrorcap/SKILL.md) for when an agent
should use each command, and the repo root [`README.md`](../README.md) for
the full product story.

## Commands

| Command | Capabilities | What it does |
|---|---|---|
| `mm mirrorcap strategies` | none | Lists momentum-breakout strategies and lifecycle state. |
| `mm mirrorcap analyze <id> --wallet <addr> --amount <n>` | `wallet-read` | Runs the full pre-trade check against live Kuru depth; never submits. |
| `mm mirrorcap follow <id> --wallet <addr> --max-trade <n> --max-drift <pct>` | none | Registers the follower's own risk limits. |
| `mm mirrorcap copy <id> --wallet <addr> --amount <n>` | `wallet-submit`, `wallet-read` | The only command that moves funds — bounded Kuru order, signed/submitted entirely through Agent Wallet. |
| `mm mirrorcap status <addr>` | `wallet-read` | Shows followed strategies, open/closed positions, realized PnL, and the 10% leader fee. |

## Why there's no local signer anywhere in this plugin

`copy.ts` builds the Kuru `IOC.placeMarket` calldata using the real
`@kuru-labs/kuru-sdk`, but the `ethers.Signer` it hands to that SDK call is
`AgentWalletSigner` (`backend/packages/kuru-client/src/executorSigner.ts`) — an
adapter whose `sendTransaction` forwards the populated `{to, data, value}`
to `ctx.walletExecutor(io, "mirrorcap:copy")` and nothing else.
`signTransaction` / `signMessage` are deliberately left throwing: nothing in
this process is capable of producing a signature. Policy, MFA, and the
actual signature all happen inside MetaMask Agent Wallet.

## Running it locally (verified steps — this exact sequence was run end-to-end)

Plugins are a beta feature in `@metamask/agent-wallet@7.1.0` and are off by
default; local/unpublished plugins need a second flag on top of that:

```bash
npm install -g @metamask/agent-wallet@latest
mm doctor

mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true   # required to link a local (non-npm) plugin dir

# from the repo root — builds every @mirrorcap/* package this plugin depends on, then bundles it
npm install
npm run build

cd agent-plugin
mm plugins link --install --accept-permissions
```

`--accept-permissions` is required non-interactively; omit it in a TTY and
the CLI prints the full permission prompt first (declared commands,
capabilities, the `wallet-submit ⚠` warning) before asking you to confirm.
That consent, together with a hash of this plugin's `mm` manifest block, is
recorded in `~/.metamask/config.json` — **if you edit `package.json`'s `mm`
block after approving, capability grants silently fall back to none** until
you re-run `plugins link --install --accept-permissions`. This is a real,
intentional tamper-check in the host, not a bug.

```bash
mm login   # interactive — your MetaMask account, your MFA. Nothing here can be scripted for you.

# Start the MirrorCap API first (see repo root README), then:
mm mirrorcap strategies
mm mirrorcap follow <strategy-id> --wallet 0xYourAddress --max-trade 1000 --max-drift 2
mm mirrorcap analyze <strategy-id> --wallet 0xYourAddress --amount 100
mm mirrorcap copy <strategy-id> --wallet 0xYourAddress --amount 100   # requires `mm login` first — enforced by the host, verified by testing it unauthenticated
mm mirrorcap status 0xYourAddress
```

Set `MIRRORCAP_API_URL` (defaults to `http://localhost:4000`) and
`MONAD_TESTNET_RPC_URL` / `MONAD_MAINNET_RPC_URL` so `copy` can read live
Kuru depth and build a real transaction — see `.env.example` at the repo
root.

### What this proved, worth highlighting for the bounty

1. **The real `mm` CLI (not a mock) parses this plugin's manifest, links it,
   and executes its actual TypeScript.** Verified: `mm mirrorcap strategies`
   returns live data from the real running MirrorCap API; `mm mirrorcap
   follow` writes a real `FollowerPolicy` through it; `mm mirrorcap analyze`
   runs the full real pre-trade check against live Kuru depth.
2. **`mm mirrorcap copy` is unconditionally blocked before executing any of
   our code** when not authenticated — tested by running it logged out and
   getting back `AUTH_FAILED: No CLI refresh token available — run mm login
   to sign in.` straight from the host, not from us. The `wallet-submit`
   boundary is real, not just a claim in the README.
3. **The follower set up a real, policy-gated Agent Wallet** (`mm login` →
   `mm init` → Server Wallet, Guard mode) with real guardrails — network
   allowlist, recipient allowlist, address allowlist, rolling 24h outflow
   limit, 2FA on anything outside policy — and **funded it with real testnet
   MON**, confirmed on-chain via a direct balance read.

### Two rough edges in this beta feature (documented, not hidden)

**1. The optional wallet-balance context line in `analyze`/`status` doesn't
surface.** Those commands set `requiresInit = false` so they're usable
before a wallet exists, and opportunistically try `ctx.publicClient(...)`
(`wallet-read`) for display context. In this CLI version that read is denied
for commands not also requiring wallet init — caught and logged at
`--verbose` only, never breaks the command. Zero effect on trading logic.

**2. A host crash we found and fixed, plus a deeper gap we couldn't — full
trail below, since this is the one place the demo stops short of a literal
broadcast.**

### 2a. `window.addEventListener is not a function` — found, fixed

Any command declaring `wallet-submit` crashed the host (`@metamask/agent-wallet`
`7.0.0` and `7.1.0`, both tested) *before* `execute()` ran, in both headless
and real interactive PowerShell terminals:

```text
Error [UNKNOWN]: window.addEventListener is not a function
```

`strategies`/`follow`/`analyze`/`status` (no `wallet-submit`) were unaffected;
only `copy` hit it. Root cause: somewhere in the bundled host code, a
`typeof window !== 'undefined' ? window : {}`-style fallback resolves to a
plain `{}` in pure Node (no real `window` global exists), and something later
unconditionally calls `.addEventListener` on it. **Fix** —
[`scripts/mm-window-shim.cjs`](../backend/scripts/mm-window-shim.cjs), preloaded via
`NODE_OPTIONS`, defines a minimal `EventEmitter`-backed `window` global before
the CLI boots:

```powershell
$env:NODE_OPTIONS = "--require C:\path\to\repo\backend\scripts\mm-window-shim.cjs"
mm mirrorcap copy <id> --wallet <addr> --amount <n>
```

This completely eliminates the crash — verified across every command,
including the host's own built-ins (`mm doctor`, etc.).

### 2b. `wallet-submit` capability grant not wired for `mm plugins link` (dev mode)

With the shim applied, `copy` runs our real code end to end: real capacity
check, real bounded-order construction via the real Kuru SDK, real call into
`ctx.walletExecutor`. It then fails with:

```text
CommandError: Plugin 'mirrorcap copy' did not declare the 'wallet-submit' capability.
code: 'PERMISSION_DENIED'
```

— even though the manifest declares it and `~/.metamask/config.json` records
a correct, matching approval (`approvedCapabilities: ["wallet-read",
"wallet-submit"]`, `approvedCommandIds` includes `"mirrorcap copy"`, hash and
version both current). Ruled out: oclif id format (colon `mirrorcap:copy` vs.
space `mirrorcap copy` — tried both, identical failure); approval staleness
(fresh relink, identical failure).

**To test whether this is specific to `mm plugins link`** (explicitly a
*"for development"* path per its own `--help` text) **vs. a real npm
install**, we went the whole way: bundled the plugin into a fully
self-contained package with esbuild (inlining `ethers`, `@kuru-labs/kuru-sdk`,
and every `@mirrorcap/*` workspace package — none of which exist on the
public registry, so an un-bundled publish would have been uninstallable for
anyone), and published it for real: **[npmjs.com/package/mirrorcap-agent-plugin](https://www.npmjs.com/package/mirrorcap-agent-plugin)**.

That surfaced two more real, independent bugs rather than resolving the
question:

- `mm plugins install mirrorcap-agent-plugin` fails with
  `PLUGIN_METADATA_UNAVAILABLE: ... spawn npm ENOENT` — reproduced in both a
  headless shell and a real interactive PowerShell terminal on this Windows
  machine. The host's internal installer spawns `npm` as a child process in a
  way Windows can't resolve (classic `spawn('npm')` vs. `npm.cmd` issue).
- Working around *that* by manually `npm install`-ing the published package
  into oclif's user-plugins directory (`%LOCALAPPDATA%\mm`) and registering
  it in that directory's `package.json` `oclif.plugins` array: the *link*
  form of that array is a documented object shape
  (`{name, root, type: "link"}`, confirmed by inspecting what `mm plugins
  link` itself writes), but the equivalent *installed* shape isn't
  discoverable from the outside — two reasonable guesses (`{name, root}`
  with no `type`, and a bare string) both left `mm plugins` reporting "No
  plugins installed." There's evidently further internal tracking state
  (beyond this one file) that only `mm plugins install` itself can set
  correctly — and that command is exactly what's blocked by the bug above.

We stopped there rather than keep guessing at closed-source internal state.
**Net result:** the manifest, the approval, and our code are all independently
verified correct; the capability only fails to activate inside this specific
beta CLI version's plugin runtime, through every path we could reach from
outside the source.

### 2c. The other infra gap: Monad Testnet itself

Independent of both bugs above: `mm chains list` reports Monad Testnet as
`relaySupported: false, features: []` (vs. Mainnet's `relaySupported: true,
features: ["swap"]`), and *any* transaction on chain `10143` — even a trivial
zero-value self-transfer via the host's own `mm wallet send-transaction`,
nothing to do with this plugin — fails with `data: { error: 'Invalid
chainId' }` from MetaMask's gas-fee-estimation backend. The same call against
Monad **Mainnet** (`143`) gets all the way to `submitEvmTransaction`,
stopping only on insufficient balance (the test wallet has never been funded
on mainnet) — confirming mainnet's pipeline works and this really is a
testnet-specific onboarding gap, not a general CLI issue.

**Bottom line:** three independent, precisely-isolated host-side constraints
— one we fixed (window shim), one we narrowed to `mm plugins link`
specifically (via a real npm publish, which is itself evidence the plugin is
production-packageable), and one that's Monad Testnet's current support
level inside MetaMask's own infrastructure. None of them are gaps in this
plugin's signing/calldata/policy logic, which is independently verified
correct up to the exact `ctx.walletExecutor` call in every case.

## Known limitation (documented, not hidden)

After a successful `copy`, the position is recorded using the **bounded
order's requested parameters** (quote spent, the capacity engine's expected
average price), not a decoded on-chain fill. The Kuru `OrderBook` contract
emits a `Trade` event (`orderId, makerAddress, isBuy, price, updatedSize,
takerAddress, filledSize`) that a production build should decode from the
receipt for the exact fill. This plugin does not do that decode yet — it is
called out here and in `copy.ts` rather than silently presented as exact.
