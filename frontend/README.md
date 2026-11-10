# frontend

The Solidon web front: a marketing **landing site** and the **app** (Markets, Launch, Dashboard and one page per meme with trading and the proof dashboard: NAV, mNAV against the locked thresholds, cash buffer, treasury per chain with ledger vs on-chain balances, event log).

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui on Base UI, [`motion`](https://motion.dev) for the few animations that need JavaScript, and [`@hot-labs/near-connect`](https://github.com/hot-dao/near-selector) for wallets (HOT, Meteor, MyNearWallet, Intear and others from its manifest). There is no backend: every read goes from the browser to public RPCs.

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
| Landing | `<domain>` | `(landing)/page.tsx` at `/` | `(landing)/layout.tsx`: landing header (Product, How it works, Proof, FAQ, Docs, **Open app**) and footer. No wallet |
| App | `app.<domain>`, or `/app` on a single host | `(app)/app/*`: `/app` Markets, `/app/launch`, `/app/dashboard`, `/app/meme/[account]` | `(app)/app/layout.tsx`: wallet and toast providers, app header with the tabs, wallet and "Get test USDC", the rounded content surface, a one-line footer, a bottom tab bar on phones |

`src/proxy.ts` (Next.js 16 renamed `middleware` to `proxy`) routes by host:

- A host that starts with `app.` is rewritten into the `/app` tree: `app.<domain>/` shows Markets, `app.<domain>/launch`, `app.<domain>/dashboard`, `app.<domain>/meme/<account>`. Paths that already start with `/app` pass through, so server-rendered links work on both hosts.
- On the landing host, `/app/*` is redirected (308) to `NEXT_PUBLIC_APP_URL` only when that is an absolute URL on another host; with the default `/app` it is served in place.
- Old deep links keep working: `/launch` and `/meme/<account>` on the landing host redirect to the app.
- Static files (`/logos/*.svg`, fonts, `_next`) skip the proxy; meme accounts with dots (`/meme/e2etest.solidon.testnet`) do not.

Inside the app, links go through `AppLink` / `useAppHref` (`src/lib/app-link.tsx`): the server renders the `/app/...` form and the browser switches to the short form on `app.<domain>` after hydration. The landing's "Open app" buttons use `NEXT_PUBLIC_APP_URL`.

## Configuration

All settings are public `NEXT_PUBLIC_*` variables read at build time. Copy `.env.example` to `.env.local` to change them; the defaults target NEAR testnet on a single host.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `/app` | Where the app lives. Production: `https://app.<domain>` |
| `NEXT_PUBLIC_SITE_URL` | empty (same host) | The landing site, for links back from the app and `metadataBase`. Production: `https://<domain>` |
| `NEXT_PUBLIC_NETWORK` | `testnet` | NEAR network for RPC, wallets and explorer links |
| `NEXT_PUBLIC_FACTORY` | `solidon.testnet` | Factory account: `get_memes`, `get_stocks`, `launch_cost`, `create_meme` |
| `NEXT_PUBLIC_USDC` | `usdc.solidon.testnet` | USDC token on NEAR (testnet: `mock-ft` with an open `mint`) |
| `NEXT_PUBLIC_NEAR_RPC` | `test.rpc.fastnear.com`, then `rpc.testnet.near.org` (deprecated, rate-limited) | Comma-separated, tried in order |
| `NEXT_PUBLIC_NEARBLOCKS_API` | `https://api-testnet.nearblocks.io` | Event log (v3 API) |
| `NEXT_PUBLIC_BASE_RPC` | `https://sepolia.base.org` | On-chain treasury balances, Base Sepolia |
| `NEXT_PUBLIC_ROBINHOOD_RPC` | `https://rpc.testnet.chain.robinhood.com` | On-chain treasury balances, Robinhood Chain testnet |
| `NEXT_PUBLIC_SOLANA_RPC` | `https://api.devnet.solana.com` | On-chain treasury balances, Solana devnet |

## Pages

| Route | What it does |
| --- | --- |
| `/` (landing) | Hero with a live product visual (the balance sheet of `e2etest.solidon.testnet`: open stats for treasury value, price, NAV and mNAV, the mNAV gauge and where the treasury sits per chain; a frozen snapshot renders first and works offline), a marquee of the eight listed stocks, how it works (four steps beside a diagram: meme contract, NEAR Chain Signatures, Base / Robinhood Chain / Solana with their venues), the mNAV rules with a playable example gauge, "Proof, not promises" (one table: ledger vs on-chain per chain, proof type, MPC-signed swaps with explorer links), the infrastructure it is built on, live factory figures as open stats, FAQ, closing call to action, minimal footer |
| `/risks` (landing) | The full risk wording the footer's one legal line points to: NAV floor, synthetic stocks, relayer-reported cash, oracle pauses, US persons, no admin key, trademarks |
| `/app` Markets | Open stats (treasury value, memes, holding stock, stocks listed), then every meme on the factory as a table on one panel (rows on phones): meme, thesis stock logo, price, NAV per token, mNAV with zone badge and mini gauge, treasury value, chains holding stock. Search, filter chips by thesis stock, sortable column headers |
| `/app/launch` | A three-step wizard (a stepper, Morpho-style input cards, a stock picker, a live preview panel): `create_meme` (attaches `launch_cost()`), seed the pool (`storage_deposit` of the meme on USDC + `ft_transfer_call` with `{"action":"seed"}`), `init_treasury()`. `?meme=<account>` resumes a launch |
| `/app/dashboard` | The connected account's portfolio as open stats: value at pool price (and what a full sell returns), value at NAV, USDC balance with the faucet, claimable USDC; a positions table with one row per position with balance, share of the treasury, zone, Claim and a Redeemable badge when the window is open; recent trades by the account on the memes it holds. `?account=<id>` shows any account read-only, also without a wallet |
| `/app/meme/[account]` | A Morpho market page. Header: the meme icon and ticker beside the thesis stock logo and ticker, the contract account with copy and explorer, the chains it holds on; open stats for price (TWAP), NAV per token, mNAV and treasury value. A sticky section nav (Overview, Treasury, Rules, Activity): the mNAV gauge with a Live / Last rebalance toggle, the mNAV chart when the event log holds at least three rebalances, where the treasury sits per chain, the balance sheet as attribute rows, the cash buffer; the treasury as one grouped table (address, proof type, ledger vs on-chain, in transit); the locked rules as attribute rows; the event table. Beside it, a sticky action panel: Buy / Sell / Redeem tabs, "You pay" and "You receive" input cards with balance and MAX, a summary (network, minimum received, average price, price impact, fee, slippage), one full-width button with the exact action, Get test USDC when short, claim, and Run the rules. One column on phones, with the action panel right after the stats |
| any other path | `not-found.tsx` |

## Design system

One dark theme after [Morpho](https://app.morpho.org)'s market pages: a near-black chrome, one large rounded content surface a step lighter, panels a step lighter again, high contrast text, light weights for big figures and a single blue accent. Colour is reserved for meaning (the mNAV zones, proof types, verdicts). No boxed stat grids and no cards inside cards: figures stand on their own, lists are hairline rows, data sits in tables on one panel. The playful part is only motion: count-ups, a sliding tab key, scroll reveals on the landing, the chart line drawing in, and a burst of gold coins on a successful transaction. Everything lives in `src/app/globals.css` (tokens on `:root`, mapped to Tailwind in `@theme`, component classes in `@layer components`).

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

Each data colour has an `-ink` (AA text on dark) and a `-wash` (quiet fill). Chain identities come from the networks' own marks (Base `#0000FF`, Robinhood `#CCFF00`, Solana gradient).

- **Type**: Geist for everything, with tabular numerals; big figures in weight 300 (`.stat-value`, `.type-num`), headings in 400 (`.type-display`, `.type-h1`, `.type-h2`, `.type-section`). Bricolage Grotesque is loaded only for the `solidon` wordmark (`font-brand`).
- **Open stats** (`Stat`, `StatRow` in `components/stat.tsx`): a muted label with an (i) tooltip (`Hint`), a large light figure whose less significant tail is dimmed (`splitFigure` in `lib/figure.ts`: `$15` + `.33`, `128` + `×`, `$1.62` + `B`, and for tiny prices `$0.0₅` dimmed + `3926` bright), and one small line under it. No borders, no cells. `fmtUsdCompact` shortens big values to K / M / B.
- **Controls**: `.btn` is a 10px-radius rectangle, blue by default (+ `-white` for the dark secondary, `-golden`, `-red`, `-ghost`, `-sm`, `-lg`). `ui/tabs.tsx` is plain text tabs with a sliding dark key (Buy | Sell | Redeem). `.seg` is the segmented toggle (Live | Last rebalance, slippage). `.input-card` is Morpho's amount card: label and token icon on top, a big light number, the dollar value, the balance and a `.max-chip`, blue border on focus. `.attr` is a key/value row with a hairline. `.subnav` is the sticky section nav with a blurred backdrop (`SectionNav`, scroll-spy, active item blue). `.table` sits on a `.panel` with a soft header row, hover rows, grouped `tbody` sections and `.num-link` underlined figures that link. `CopyButton` and `ExplorerLink` are the small icons after an address.
- **Key components**: `MnavGauge` (a thin bar split into the four rule zones, a needle with the value, 0.9× / 1.0× / 2.0× ticks, `role="meter"`); `MnavChart` (mNAV at each rebalance: thin blue line, soft gradient fill, dotted average with its label, threshold guides, date ticks); `Composition` (where the treasury sits: one stacked bar per chain and the cash buffer, with a legend list); `TreasuryChains` (one grouped table: per chain a header row with the proof type and the treasury address, then ledger against on-chain for the stock and USDC); `TradePanel` (the sticky Morpho action panel); `LogoTile`, `StockLogo`, `ChainLogo`, `ChainStack` (real logos in round tiles); `Term` and `Hint` (tooltips on a word or an (i)); `Notice`; `ToastProvider`; `CountUp` (optionally split into bright and dim parts); `Reveal`.
- **Motion**: the hero's one orchestrated entrance (headline lines rise out of masks, then the product frame) is CSS. Landing sections reveal on scroll, the stock marquee drifts, the app tabs share a sliding key (`motion` `layoutId`), table rows settle in, figures count up, the chart line draws in. `prefers-reduced-motion` turns all of it off.
- **Footer**: brand, five links and one line of legal text (`LEGAL_LINE`); the full risk wording is on `/risks` (`DISCLAIMERS`, `TRADEMARK_NOTE` in `components/disclaimers.tsx`). The app footer is that one line and a link to the risks.
- **Display helpers** (pure, in `src/lib`): `figure.ts` (bright / dim split, compact USD and amounts), `market.ts`, `portfolio.ts`, `brands.ts`, `site.ts` and `app-link.tsx`, `showcase-snapshot.ts`, `mnav.ts`, `price.ts` (tiny prices as `$0.0₅39`), `proof.ts`. The contract and data logic in the other `src/lib` files is unchanged.

## Logos

Real marks for the eight listed stocks (NVIDIA, Apple, Microsoft, Alphabet, Amazon, Meta, Tesla, SpaceX), the chains (NEAR, Base, Robinhood Chain, Solana) and the infrastructure (NEAR Chain Signatures and NEAR Intents use the NEAR mark, Uniswap, Raydium, Chainlink, Circle USDC), stored in `public/logos/{stocks,chains,platforms}` (24 KB in total). Each file's source is listed in [`public/logos/SOURCES.md`](public/logos/SOURCES.md): the official Base brand kit, Wikimedia Commons, Simple Icons and cryptologos.cc. They are trademarks of their owners, shown to identify the assets; the footer and `/risks` say so.

## Design credits

The layout language follows Morpho's market pages (app.morpho.org) at the maintainer's request: the dark chrome and single content surface, open stats with dimmed tails, the sticky section nav, attribute rows, chart panels with segmented toggles and the action panel with input cards. No Morpho asset or code is used; everything is rebuilt in CSS and the only images are the logos above. The hero entrance, the stock marquee and the single-open FAQ come from earlier [MotionSites](https://motionsites.ai) prompts (`ledgely`, `scroll-marquee`, `rocket-faq`), now restyled for the dark theme.

## Contract calls

| UI | Call |
| --- | --- |
| Get test USDC | `usdc.mint({account_id, amount})`: 1,000 USDC |
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

It is a standard Next.js app with no server secrets, so any Next.js host works: Vercel with the project root set to `frontend/`, or `npm run build && npm run start` behind a proxy. For the two-domain setup, point both `<domain>` and `app.<domain>` at the same deployment and build with `NEXT_PUBLIC_SITE_URL=https://<domain>` and `NEXT_PUBLIC_APP_URL=https://app.<domain>`: the proxy serves the app on the subdomain and sends `<domain>/app/*` there. Set the `NEXT_PUBLIC_*` variables before building, and point `NEXT_PUBLIC_FACTORY` at the redeployed multichain factory.

## Known limits

- Testnet only. The oracle is a mock with settable prices, and every stock venue is a Solidon synthetic token.
- The NearBlocks public API is rate limited. The event log reads the latest 10 transactions and falls back to a NearBlocks link.
- Enter from any chain (NEAR Intents 1Click) is not wired in the UI yet. Buying needs USDC on NEAR.
- Success toasts link to the signer's account on NearBlocks, not to the transaction: the wallet layer does not return transaction hashes.
- The Markets table has no 24-hour change column: the contracts keep no price history and the UI does not index trades.
- There is no price or NAV history chart. The only history the UI can read without an indexer is the event log (the latest 10 transactions from NearBlocks), so the meme page charts mNAV at each `rebalance` event, and only when that log holds at least three of them; otherwise it shows the gauge and the composition. No point is ever interpolated or invented.
- The Dashboard's activity reads the latest transactions of the memes the account holds (up to three) from the rate-limited NearBlocks API, so it can be empty or unavailable for a minute.
