# frontend

The Solidon web front: a marketing **landing site** and the **app** (Markets, Launch, Dashboard and one page per meme with trading and the proof dashboard: NAV, mNAV against the locked thresholds, cash buffer, treasury per chain with ledger vs on-chain balances, event log).

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui on Base UI, [`motion`](https://motion.dev) for the few animations that need JavaScript, and [`@hot-labs/near-connect`](https://github.com/hot-dao/near-selector) for wallets (HOT, Meteor, MyNearWallet, Intear and others from its manifest). Every read goes from the browser to public RPCs and, when it runs, the keeper's indexer. The only server code is three route handlers: the testnet faucet (`/api/faucet`), which signs with a server-only key, a narrow proxy to NEAR Intents 1Click (`/api/oneclick/*`), and a read-only RPC proxy for the treasury balance checks (`/api/rpc/<chain>`), so no network has to reach every chain's public RPC and no RPC key reaches the browser.

## Run

```bash
cd frontend
npm install
npm run dev          # landing http://localhost:3000, app http://localhost:3000/app and http://app.localhost:3000
npm run lint
npm run build && npm run start
```

Node 20 or newer. Nothing is installed at the repo root. `*.localhost` resolves to 127.0.0.1 in Chrome, Firefox and Safari, so the subdomain setup works locally without editing `/etc/hosts`.

## Architecture: one build, two sites

| Site | Served at | Routes (`src/app`) | Layout |
| --- | --- | --- | --- |
| Landing | `<domain>` | `(landing)/page.tsx` at `/` | `(landing)/layout.tsx`: landing header (Product, How it works, Proof, FAQ, the theme toggle, **Open app**) and footer. No wallet |
| App | `app.<domain>`, or `/app` on a single host | `(app)/app/*`: `/app` Markets, `/app/launch`, `/app/dashboard`, `/app/meme/[account]` | `(app)/app/layout.tsx`: wallet and toast providers, app header with the tabs, the theme toggle, wallet and "Get test funds", the connect modal, the no-gas banner, the rounded content surface, a one-line footer, a bottom tab bar on phones |

`src/proxy.ts` (Next.js 16 renamed `middleware` to `proxy`) routes by host:

- A host that starts with `app.` is rewritten into the `/app` tree: `app.<domain>/` shows Markets, `app.<domain>/launch`, `app.<domain>/dashboard`, `app.<domain>/meme/<account>`. Paths that already start with `/app` pass through, so server-rendered links work on both hosts.
- On the landing host, `/app/*` is redirected (308) to `NEXT_PUBLIC_APP_URL` only when that is an absolute URL on another host; with the default `/app` it is served in place.
- Old deep links keep working: `/launch` and `/meme/<account>` on the landing host redirect to the app.
- Static files (`/logos/*.svg`, fonts, `_next`) skip the proxy; meme accounts with dots (`/meme/e2etest.solidon.testnet`) do not.

Inside the app, links go through `AppLink` / `useAppHref` (`src/lib/app-link.tsx`): the server renders the `/app/...` form and the browser switches to the short form on `app.<domain>` after hydration. The landing's "Open app" buttons use `NEXT_PUBLIC_APP_URL`.

## Configuration

All settings but two are public `NEXT_PUBLIC_*` variables read at build time. Copy `.env.example` to `.env.local` to change them; the defaults target NEAR testnet on a single host.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `/app` | Where the app lives. Production: `https://app.<domain>` |
| `NEXT_PUBLIC_SITE_URL` | empty (same host) | The landing site, for links back from the app and `metadataBase`. Production: `https://<domain>` |
| `NEXT_PUBLIC_NETWORK` | `testnet` | NEAR network for RPC, wallets and explorer links |
| `NEXT_PUBLIC_FACTORY` | `solidon.testnet` | Factory account: `get_memes`, `get_stocks`, `launch_cost`, `create_meme` |
| `NEXT_PUBLIC_USDC` | `usdc.solidon.testnet` | USDC token on NEAR (testnet: `mock-ft` with an open `mint`) |
| `NEXT_PUBLIC_NEAR_RPC` | `test.rpc.fastnear.com`, then `rpc.testnet.near.org` (deprecated, rate-limited) | Comma-separated, tried in order |
| `NEXT_PUBLIC_NEARBLOCKS_API` | `https://api-testnet.nearblocks.io` | Event log (v3 API) |
| `NEXT_PUBLIC_BASE_RPC` | `/api/rpc/base` (this app's read proxy) | On-chain treasury balances, Base Sepolia. Only set it to bypass the proxy with a public, key-free URL |
| `NEXT_PUBLIC_ROBINHOOD_RPC` | `/api/rpc/robinhood` (this app's read proxy) | On-chain treasury balances, Robinhood Chain testnet. Only set it to bypass the proxy with a public, key-free URL |
| `NEXT_PUBLIC_SOLANA_RPC` | `/api/rpc/solana` (this app's read proxy) | On-chain treasury balances, Solana devnet. Only set it to bypass the proxy with a public, key-free URL |
| `NEXT_PUBLIC_INDEXER_URL` | `http://localhost:8788` | The keeper's indexer: price / NAV history and events. Optional: everything falls back when it is down |

Server-only, read at request time by the route handlers and never sent to the browser (no `NEXT_PUBLIC_` prefix, never logged). Set them in `.env.local` locally and as encrypted environment variables on the host:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FAUCET_ACCOUNT_ID` | none | The testnet account that pays the faucet (e.g. `solidon-faucet.testnet`) |
| `FAUCET_PRIVATE_KEY` | none | Its full-access key, `ed25519:…`. Without both, `/api/faucet` answers 503 |
| `FAUCET_DAILY_NEAR` | `5` | NEAR the faucet may send per UTC day, all users together |
| `FAUCET_IP_PER_HOUR` | `6` | Faucet requests per client IP per hour |
| `ALCHEMY_API_KEY` | none | Upstream for `/api/rpc/<chain>`, the read-only proxy the treasury balance checks use: `https://{base-sepolia,robinhood-testnet,solana-devnet}.g.alchemy.com/v2/<key>`. Without it, and without the URLs below, the proxy uses the chains' public RPCs |
| `BASE_RPC_URL`, `ROBINHOOD_RPC_URL`, `SOLANA_RPC_URL` | none | Per-chain upstream for `/api/rpc/<chain>`, taking precedence over `ALCHEMY_API_KEY`. The proxy forwards only ERC-20 `balanceOf` (`eth_call`) and `getTokenAccountsByOwner` |
| `ONECLICK_JWT` | none | Optional 1Click API key, sent as a bearer token by `/api/oneclick/*`. Without it quotes work and 1Click charges its default 0.2% fee |

## Pages

| Route | What it does |
| --- | --- |
| `/` (landing) | Hero with a live product visual (the balance sheet of `e2etest.solidon.testnet`: open stats for treasury value, price, NAV and mNAV, the mNAV gauge and where the treasury sits per chain; a frozen snapshot renders first and works offline), a marquee of the eight listed stocks, how it works (four steps beside a diagram: meme contract, NEAR Chain Signatures, Base / Robinhood Chain / Solana with their venues), the mNAV rules with a playable example gauge, "Proof, not promises" (one table: ledger vs on-chain per chain, proof type, MPC-signed swaps with explorer links), the infrastructure it is built on, live factory figures as open stats, FAQ, closing call to action, minimal footer |
| `/risks` (landing) | The full risk wording the footer's one legal line points to: NAV floor, synthetic stocks, relayer-reported cash, oracle pauses, US persons, no admin key, trademarks |
| `/app` Markets | Open stats (treasury value, memes, holding stock, stocks listed), then every meme on the factory as a table on one panel (rows on phones): meme, thesis stock logo, price (with a 7-day sparkline when the indexer has history), NAV per token, mNAV with zone badge and mini gauge, treasury value, chains holding stock. Search, filter chips by thesis stock, sortable column headers |
| `/app/launch` | A three-step wizard (a stepper, Morpho-style input cards, a stock picker, a live preview panel): `create_meme` (attaches `launch_cost()`), seed the pool (`storage_deposit` of the meme on USDC + `ft_transfer_call` with `{"action":"seed"}`), `init_treasury()`. `?meme=<account>` resumes a launch |
| `/app/dashboard` | The connected account's portfolio as open stats: value at pool price (and what a full sell returns), value at NAV, USDC balance with the faucet, claimable USDC; "Pay from another chain" (see below); a positions table with one row per position with balance, share of the treasury, zone, Claim and a Redeemable badge when the window is open; recent activity of the account: from the indexer when it answers, else the latest NearBlocks transactions of the memes it holds. `?account=<id>` shows any account read-only, also without a wallet |
| `/app/meme/[account]` | A calm market page built on progressive disclosure: the first screen answers what the coin is, what state it is in and how to buy. Visible: the meme icon, ticker, name and "holds" the thesis stock with its logo, the zone badge, a small "View on NearBlocks" link and refresh; three figures only (price, the TWAP when the pool has history with spot in its tooltip; mNAV with the one (i); treasury value); the plain-language mNAV sentence, which says what the next rebalance can really do (the epoch issuance cap left, or when it reopens; spare cash above the buffer for a buyback; the redemption window), over a slim gauge (plus one orange line while the oracle price is stale), and one quiet line under it: anyone can run the rules for the caller tip, with "Run rebalance" once the cooldown is over and the price is fresh (the toast reports the outcome from the transaction's `rebalance` event), else "Next in 34 min"; "Where the treasury is": the composition bar and one row per chain (logo, stock amount, value, a quiet "Verified on-chain" tick when the chain holds at least the ledger) and the cash on NEAR, with "How is this verified?" opening Details. Beside it (below the status on phones) a sticky trade panel: Buy / Sell (Redeem only while the window is open), one amount card with MAX, one line "You get ≈ … · fee 1%", one full-width button with the exact action, Get test funds when short, "Pay from another chain" folded under it, claim when claimable; minimum received, average price, price impact, the fee split, slippage (default 1%) and the network sit behind a small Details disclosure. Everything else is one **Details** accordion, collapsed by default (heading buttons with `aria-expanded`): History (the meme against its thesis stock, both indexed to 100 at the start of the range, and mNAV over time, with 24h / 7d / All, from the keeper's indexer; one quiet line until it has two points), Treasury per chain (`TreasuryChains`: addresses with copy and explorer, ledger vs on-chain, MPC-proven / relayer-reported, in transit), Rules (`RulesSection` and the redemption note), Balance sheet and cash buffer (NAV per token, mNAV at the last rebalance, oracle price and age), Activity (the event table from the indexer, or NearBlocks when it is down; the mNAV-at-rebalance chart only when there is no indexer history and the log holds three rebalances) and Contract (account, creator, oracle). On-chain balances are read once (`useOnChainReadings`) and shared by the summary rows and the table |
| any other path | `not-found.tsx` |

## Design system

Two themes after [Morpho](https://app.morpho.org)'s market pages, dark by default. The dark one: a near-black chrome, one large rounded content surface a step lighter, panels a step lighter again, high contrast text, light weights for big figures and a single blue accent. Colour is reserved for meaning (the mNAV zones, proof types, verdicts). No boxed stat grids and no cards inside cards: figures stand on their own, lists are hairline rows, data sits in tables on one panel. The playful part is only motion: count-ups, a sliding tab key, scroll reveals on the landing, the chart line drawing in, and a burst of gold coins on a successful transaction. Everything lives in `src/app/globals.css` (tokens on `:root`, mapped to Tailwind in `@theme`, component classes in `@layer components`).

| Token | Value | Used for |
| --- | --- | --- |
| `page` | `#0E0E10` | The chrome: header, footer, behind the surface |
| `card` | `#151518` | The one large rounded content surface (`.surface`) |
| `panel` | `#1C1C20` | Panels on the surface: charts, input cards, tables, the action panel |
| `page-deep` | `#26262B` | Active tab key, pills, chips, the MAX chip |
| `ink`, `ink-2` | `#F4F4F6`, `#D4D4DA` | Text, attribute keys |
| `soft`, `faint` | `#9C9CA6`, `#6C6C76` | Labels and secondary text (AA), the dimmed tail of a figure |
| `line`, `line-strong` | `#24242A`, `#34343B` | Hairlines under rows and table headers |
| `blue` | `#3A6FF7` | The accent: primary buttons, active section, focus, chart lines, focused input card |
| `green` / `orange` / `red` / `lilac` | `#2FBF71` / `#F2994A` / `#EF5350` / `#8F7CFF` | Free band and healthy / buyback and caution / redemption and errors / issuance. The mNAV zones use exactly these |
| `golden` | `#F5B700` | The coin mark and claims only |

Each data colour has an `-ink` (AA text on dark) and a `-wash` (quiet fill).

**Light theme.** The same language on paper: `page` `#F7F7F8` chrome, a white `card` surface, `panel` `#F2F2F4`, `page-deep` `#E7E7EB`, ink `#16161A` / `#3A3A42`, `soft` `#5E5E68` and `faint` `#767680` (both AA on white), hairlines `#E8E8EC` / `#D4D4DA`, and the same blue `#3A6FF7` (`blue-ink` `#2456D9` for text). Zone fills keep their hue (`#22A863`, `#EC8A32`, `#E5484D`, `#7B66F0`); their `-ink` text is deepened for AA on white and their `-wash` is a pale tint. Interaction tones that used to be literal hex values are tokens too: `--hover`, `--chart-bg`, `--tip-bg` / `--tip-ink` (tooltips stay dark in both themes), `--skeleton-hi`, `--logo-ring` (the hairline around white logo tiles, so they read on a white surface), `--selection`, `--glow-opacity`.

**How the theme is chosen.** Tokens live on `:root` (dark) and `:root[data-theme="light"]` in `globals.css`. The root layout renders `<html data-theme="dark">` and runs `THEME_SCRIPT` (`src/lib/theme.ts`) inline in `<head>`, before first paint: a stored choice (`localStorage["solidon-theme"]`) wins, then `prefers-color-scheme`, then dark; until the visitor picks, it also follows system changes. `suppressHydrationWarning` on `<html>` lets React keep that attribute, so there is no flash and no hydration error. `ThemeToggle` (`components/theme-toggle.tsx`) is the sun / moon button in both headers: it writes the attribute and the stored choice; its icon is picked in CSS from `html[data-theme]`, so it is right before hydration. `color-scheme` follows the theme, so native scrollbars and form controls match, and `theme-color` has a light and a dark value. The choice is stored per origin, so on the two-domain setup the landing and `app.<domain>` remember it separately. Chain identities come from the networks' own marks (Base `#0000FF`, Robinhood `#CCFF00`, Solana gradient).

- **Type**: Geist for everything, with tabular numerals; big figures in weight 300 (`.stat-value`, `.type-num`), headings in 400 (`.type-display`, `.type-h1`, `.type-h2`, `.type-section`). Bricolage Grotesque is loaded only for the `solidon` wordmark (`font-brand`).
- **Open stats** (`Stat`, `StatRow` in `components/stat.tsx`): a muted label with an (i) tooltip (`Hint`), a large light figure whose less significant tail is dimmed (`splitFigure` in `lib/figure.ts`: `$15` + `.33`, `128` + `×`, `$1.62` + `B`, and for tiny prices `$0.0₅` dimmed + `3926` bright), and one small line under it. No borders, no cells. `fmtUsdCompact` shortens big values to K / M / B.
- **Controls**: `.btn` is a 10px-radius rectangle, blue by default (+ `-white` for the dark secondary, `-golden`, `-red`, `-ghost`, `-sm`, `-lg`). `ui/tabs.tsx` is plain text tabs with a sliding dark key (Buy | Sell, plus Redeem while the window is open). `.seg` is the segmented toggle (Live | Last rebalance, slippage). `.input-card` is Morpho's amount card: label and token icon on top, a big light number, the dollar value, the balance and a `.max-chip`, blue border on focus. `.attr` is a key/value row with a hairline. `.table` sits on a `.panel` with a soft header row, hover rows, grouped `tbody` sections and `.num-link` underlined figures that link. `CopyButton` and `ExplorerLink` are the small icons after an address.
- **Key components**: `MnavGauge` (a thin bar split into the four rule zones, a needle with the value, 0.9× / 1.0× / 2.0× ticks, `role="meter"`); `MnavChart` (mNAV at each rebalance: thin blue line, soft gradient fill, dotted average with its label, threshold guides, date ticks); `Composition` (where the treasury sits: one stacked bar per chain and the cash buffer, with a legend list); `TreasuryChains` (one grouped table: per chain a header row with the proof type and the treasury address, then ledger against on-chain for the stock and USDC); `TradePanel` (the sticky Morpho action panel); `LogoTile`, `StockLogo`, `ChainLogo`, `ChainStack` (real logos in round tiles); `Term` and `Hint` (tooltips on a word or an (i)); `Notice`; `ToastProvider`; `CountUp` (optionally split into bright and dim parts); `Reveal`.
- **Motion**: the hero's one orchestrated entrance (headline lines rise out of masks, then the product frame) is CSS. Landing sections reveal on scroll, the stock marquee drifts, the app tabs share a sliding key (`motion` `layoutId`), table rows settle in, figures count up, the chart line draws in. `prefers-reduced-motion` turns all of it off.
- **Footer**: brand, four links (Markets, Launch, FAQ, Risks; no link to the source repository) and one line of legal text (`LEGAL_LINE`); the full risk wording is on `/risks` (`DISCLAIMERS`, `TRADEMARK_NOTE` in `components/disclaimers.tsx`). The app footer is that one line and a link to the risks.
- **Display helpers** (pure, in `src/lib`): `figure.ts` (bright / dim split, compact USD and amounts), `market.ts`, `portfolio.ts`, `brands.ts`, `site.ts` and `app-link.tsx`, `showcase-snapshot.ts`, `mnav.ts`, `price.ts` (tiny prices as `$0.0₅39`), `proof.ts`. The contract and data logic in the other `src/lib` files is unchanged.

## Logos

Real marks for the eight listed stocks (NVIDIA, Apple, Microsoft, Alphabet, Amazon, Meta, Tesla, SpaceX), the chains (NEAR, Base, Robinhood Chain, Solana) and the infrastructure (NEAR Chain Signatures and NEAR Intents use the NEAR mark, Uniswap, Raydium, Chainlink, Circle USDC), stored in `public/logos/{stocks,chains,platforms}` (24 KB in total). Each file's source is listed in [`public/logos/SOURCES.md`](public/logos/SOURCES.md): the official Base brand kit, Wikimedia Commons, Simple Icons and cryptologos.cc. They are trademarks of their owners, shown to identify the assets; the footer and `/risks` say so.

## Design credits

The layout language follows Morpho's market pages (app.morpho.org) at the maintainer's request: the dark chrome and single content surface, open stats with dimmed tails, attribute rows, chart panels with segmented toggles and the action panel with input cards. No Morpho asset or code is used; everything is rebuilt in CSS and the only images are the logos above. The hero entrance, the stock marquee and the single-open FAQ come from earlier [MotionSites](https://motionsites.ai) prompts (`ledgely`, `scroll-marquee`, `rocket-faq`), now restyled for the dark theme.

## Enter from any chain (NEAR Intents 1Click)

"Pay from another chain" (`components/pay-from-chain.tsx`, `lib/oneclick.ts`) sits in the trade panel's Buy tab and on the Dashboard as a collapsed line. Opened, it shows an amount card with an asset button: a curated list first (SOL on Solana, ETH on Base and Arbitrum, BTC, USDC on Base, Solana and Arbitrum, with their logos), then a search over every asset 1Click lists (about 230). The amount starts at about $25 of the asset. 500 ms after the last keystroke it asks for a quote into **USDC on NEAR** and shows one line, "You get ≈ 24.77 USDC on NEAR · about 20 s", with minimum received, route cost (dollars in minus dollars out, including the 0.2% 1Click fee), arrival time and recipient behind Details. 1Click errors are reworded: minimums come back in the asset's own unit ("send at least 0.15 USDC"), unknown assets and unquotable pairs get a plain sentence.

Every call goes through `src/app/api/oneclick/[op]/route.ts`: `GET tokens` (trimmed list, cached 5 minutes), `POST quote` and `GET status?depositAddress=`. The destination is fixed to USDC on NEAR and inputs are validated, so the proxy cannot be used as an open relay; `ONECLICK_JWT` stays on the server.

- **Testnet** (default): the meme trades against a mock USDC, so the panel is labelled "Mainnet route preview — on testnet use Get test funds". The server forces `dry: true`: quotes are real mainnet prices, but no deposit address is issued and nothing is swapped. 1Click answers a generic error for a recipient that does not exist on mainnet, so a `.testnet` account is replaced by `intents.near` for the preview (said under the quote); the demo wallet's implicit account is quoted as is.
- **Mainnet** (`NEXT_PUBLIC_NETWORK=mainnet`): the same panel adds an optional refund address on the origin chain (otherwise refunds go to the user's NEAR account inside NEAR Intents) and "Get a SOL deposit address": a non-dry quote, then the deposit address with copy, memo if any, the deadline, and the swap status polled every 5 s (`PENDING_DEPOSIT` → `PROCESSING` → `SUCCESS`, or refunded). On success the balances reload. This path is built against the 1Click API but has only been exercised dry.

## History from the keeper's indexer

`lib/indexer.ts` reads `NEXT_PUBLIC_INDEXER_URL`: `GET /health` (shared for 30 s; anything but `ok` counts as down), `/v1/memes/:id/history` (ascending points: price, TWAP, NAV, mNAV, stock price, treasury value), `/v1/memes/:id/events` and `/v1/accounts/:id/activity` (NEP-297 events, expanded to one row per data item). It is used for the History detail and the sparklines, and first for both activity tables. When it is unreachable, the charts are replaced by "History appears after the keeper has run a while", the sparklines are absent and the tables read NearBlocks as before. Charts are inline SVG; only recorded points are drawn.

## Testnet onboarding: faucet and demo wallet

A new testnet wallet holds 0 NEAR, so any signed call (even the open `mint` on the mock USDC) fails with "does not have enough balance". Two things fix that.

**Gasless faucet** (`src/app/api/faucet/route.ts`, logic in `src/lib/faucet-server.ts`, which imports `server-only`). `POST /api/faucet` with `{"accountId": "...", "memeId"?: "..."}`, no wallet signature. It refuses unless `NEXT_PUBLIC_NETWORK=testnet`, then, signing as `FAUCET_ACCOUNT_ID` through `NEXT_PUBLIC_NEAR_RPC`'s first endpoint (fastnear):

1. validates the account id; a named account must exist on chain, a 64-hex implicit account may be new (the transfer creates it);
2. sends 0.5 NEAR when the account holds less than 0.3 NEAR;
3. in one transaction to USDC: `storage_deposit` for the user when it is not registered (paid by the faucet), then `mint` of 1,000 test USDC;
4. with `memeId` (a meme under the factory account), `storage_deposit` on that meme so a first buy cannot fail on storage.

Limits: one request per account per 10 minutes, `FAUCET_IP_PER_HOUR` per IP, `FAUCET_DAILY_NEAR` NEAR per day, storage deposits above 0.01 NEAR refused, requests run one at a time (one signer, one nonce sequence). The counters are in memory: they reset when the server restarts and are not shared between serverless instances, so a public deployment needs a shared store (KV) and ideally a captcha. The answer is JSON with the transaction hashes (`near`, `usdc`, `meme`) and `notes` for skipped steps; errors are `{"error": "..."}` with a friendly sentence and a status (400, 404, 429 with `retry-after`, 503). Cost per new user: 0.5 NEAR plus 0.00125 NEAR of USDC storage (and 0.00125 per meme) and about 0.001 NEAR of gas.

Every faucet entry point is the same `GetTestFundsButton` ("Get test funds", with the line "Free testnet NEAR for gas + 1,000 test USDC"): the app header, the trade panel when USDC is short (it passes the meme as `memeId`), the Dashboard USDC stat, the Launch seed step, the no-gas banner and the connect modal, which also funds any account id typed in. Progress and the result are toasts with one explorer link per transaction.

**Demo wallet** (`src/lib/demo-wallet.ts`, testnet only). "Try a demo wallet" in the header and the connect modal generates an ed25519 key in the browser with `near-api-js`, uses its implicit account (the hex of the public key), stores `{accountId, secretKey, active}` in `localStorage["solidon-demo-wallet-testnet"]` and calls the faucet to create and fund it. `WalletProvider` (`src/lib/wallet.tsx`) then reports `kind: "demo"`, and `send()` signs each call locally and sends it through RPC: every existing action (create_meme, seed, buy, sell, redeem, claim, rebalance, init_treasury, storage deposits) works with no popup and resolves to the transaction hashes, so success toasts link to the transaction. The header chip shows "Demo" and the account; its menu copies the id, opens NearBlocks, reveals the key behind a warning ("Export key"), disconnects while keeping the key (the button then reads "Resume demo wallet"), or forgets the key after a confirmation. Anyone with access to this browser profile can use that key: it is for free test tokens only.

**Real wallets.** Connect opens Solidon's own modal: the demo wallet first, then each wallet near-connect offers on this network with one line on what it is ("Browser extension", "Web wallet, opens a new tab", "Hardware wallet over USB", …), "More wallets" for near-connect's own picker, and the faucet for any account. When the connected account holds less than 0.05 NEAR, a banner under the header says "Your wallet has no NEAR for gas" with Get test funds, instead of letting the next call fail.

## Contract calls

| UI | Call |
| --- | --- |
| Get test funds | `POST /api/faucet`: the faucet account sends 0.5 NEAR when low, `usdc.storage_deposit` + `usdc.mint({account_id, amount})` (1,000 USDC), optionally `meme.storage_deposit` |
| Buy | `meme.storage_deposit` on the first buy, then `usdc.ft_transfer_call({receiver_id: meme, amount, msg: {"action":"buy","min_out"}})`, 1 yocto |
| Sell | `meme.sell({amount, min_out})`, 1 yocto |
| Redeem (only while `redemption_open`) | `meme.redeem({amount, min_usdc})`, 1 yocto, 150 TGas |
| Claim | `meme.claim_usdc()` when `claimable_of` > 0 |
| Rebalance | `meme.rebalance()`, anyone, once per cooldown, 150 TGas |
| Reads | `ft_metadata`, `get_info`, `get_pool`, `get_treasury`, `get_params`, `get_treasury_chains`, `ft_balance_of`, `claimable_of`, `storage_balance_of`, and the oracle's `get_price_unsafe` |

Quotes are computed in the browser with the contract's own integer math (`src/lib/math.ts` mirrors `pool.rs`): the 1% fee comes off the USDC side, and `min_out` is the quote minus the chosen slippage (0.5%, 1% or 3%). The live NAV estimate follows `Meme::assets`: NEAR cash, plus USDC and stock on every chain from the ledger, with the stock valued at the oracle price, divided by circulating supply. mNAV divides the 30-minute TWAP by that NAV. The contract's own `last_mnav_bps` from the last rebalance is shown next to it.

## Proof dashboard

For each treasury chain (Base Sepolia, Robinhood Chain testnet, Solana devnet) the dashboard shows the treasury address and stock token with explorer links. It also puts the contract ledger (`usdc`, `stock` from `get_treasury_chains`) next to the balance read live from the chain, as two matching bars: ERC-20 `balanceOf` through `eth_call` on the EVM chains, `getTokenAccountsByOwner` on Solana. A green badge appears when the chain holds at least what the ledger claims. Each chain carries a proof badge, "MPC-proven" or "Relayer-reported", read from `config.proof` when the contract reports it (the SPEC's trust assumptions otherwise), and the USDC still `in_transit`. The event log parses the meme's NEP-297 `EVENT_JSON` logs from the NearBlocks v3 API: the account's receipts, then each transaction's receipt tree.

Every view fails soft. A meme on older contract code without `get_treasury_chains` still renders, with a note, and its stock venues come from `src/lib/venues.ts`. That file is generated from `contracts/stocks/*.json`, so regenerate it when the registries change. Solana fields (`solana`, `solana_address`, or a chain entry named `solana`) are optional and picked up when the contract reports them.

## Deploy

It is a standard Next.js app whose only secrets are the two faucet variables, so any Next.js host with a Node runtime works: Vercel with the project root set to `frontend/`, or `npm run build && npm run start` behind a proxy. For the two-domain setup, point both `<domain>` and `app.<domain>` at the same deployment and build with `NEXT_PUBLIC_SITE_URL=https://<domain>` and `NEXT_PUBLIC_APP_URL=https://app.<domain>`: the proxy serves the app on the subdomain and sends `<domain>/app/*` there. Set the `NEXT_PUBLIC_*` variables before building and `FAUCET_ACCOUNT_ID` / `FAUCET_PRIVATE_KEY` as server environment variables (Vercel: not exposed to the browser), and point `NEXT_PUBLIC_FACTORY` at the redeployed multichain factory.

## Known limits

- Testnet only. The oracle is a mock with settable prices, and every stock venue is a Solidon synthetic token.
- The NearBlocks public API is rate limited. The event log reads the latest 10 transactions and falls back to a NearBlocks link.
- On testnet, paying from another chain is a preview (dry quotes); the deposit and status path for mainnet is built but unexercised. Buying on testnet needs the faucet's test USDC.
- Success toasts link to the transaction when the signer returns its hash (the demo wallet always does, near-connect wallets usually do); otherwise to the signer's account on NearBlocks.
- The faucet's rate limits and daily cap live in server memory (see above). The demo wallet's key sits unencrypted in `localStorage`.
- The Markets table has no 24-hour change column; it shows a 7-day sparkline only when the keeper's indexer has history.
- Price, NAV and mNAV history come only from the keeper's indexer. Without it the meme page can chart mNAV only at the `rebalance` events of the latest 10 NearBlocks transactions (when there are at least three). No point is ever interpolated or invented.
- Without the indexer, the Dashboard's activity reads the latest transactions of the memes the account holds (up to three) from the rate-limited NearBlocks API, so it can be empty or unavailable for a minute.
