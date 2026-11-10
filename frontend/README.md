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
| App | `app.<domain>`, or `/app` on a single host | `(app)/app/*`: `/app` Markets, `/app/launch`, `/app/dashboard`, `/app/meme/[account]` | `(app)/app/layout.tsx`: wallet and toast providers, app header with the tabs, wallet and "Get test USDC", a bottom tab bar on phones |

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
| `/` (landing) | Hero with a live product visual (the balance sheet of `e2etest.solidon.testnet`: treasury value, price, NAV, mNAV gauge, NVDA per chain with proof badges; a frozen snapshot renders first and works offline), a marquee of the eight listed stocks, how it works (four steps beside a diagram: meme contract, NEAR Chain Signatures, Base / Robinhood Chain / Solana with their venues), the mNAV rules with a playable example gauge and the 20% cash buffer, "Proof, not promises" (ledger vs on-chain per chain, MPC-signed swaps with explorer links, MPC-proven vs relayer-reported), the infrastructure it is built on, live factory figures, FAQ, closing call to action, footer with the risk statements and the trademark note |
| `/app` Markets | Every meme on the factory as a table (cards on phones): meme, thesis stock logo, price, NAV per token, mNAV with zone badge and mini gauge, treasury value, chains holding stock. Search, filter by thesis stock, sort |
| `/app/launch` | A three-step wizard with a stepper and a live preview card: `create_meme` (attaches `launch_cost()`), seed the pool (`storage_deposit` of the meme on USDC + `ft_transfer_call` with `{"action":"seed"}`), `init_treasury()`. `?meme=<account>` resumes a launch |
| `/app/dashboard` | The connected account's portfolio: value at pool price (and what a full sell returns), value at NAV, USDC balance with the faucet, claimable USDC; one row per position with balance, share of the treasury, zone, Claim and a Redeemable badge when the window is open; recent trades by the account on the memes it holds. `?account=<id>` shows any account read-only, also without a wallet |
| `/app/meme/[account]` | Two columns on desktop: key figures, the mNAV story with the gauge, treasury per chain, cash buffer, balance sheet, locked rules and activity, beside a sticky panel to buy, sell, redeem, claim and rebalance. One column on phones, with the trade panel right after the gauge |
| any other path | `not-found.tsx` |

## Design system

One light theme, "a modern treasury terminal with a friendly coin": porcelain page, white surfaces with 1px hairlines and soft shadows, ink for text and primary actions, and colour reserved for meaning. The playful part is small and deliberate: the coin mark, a few soft chain-coloured glows, spring hovers, count-ups and a burst of gold coins on a successful transaction. Everything lives in `src/app/globals.css` (tokens on `:root`, mapped to Tailwind in `@theme`, component classes in `@layer components`).

| Token | Value | Used for |
| --- | --- | --- |
| `page`, `page-deep` | `#F6F7FB`, `#ECEEF4` | Page background, quiet fills (segmented controls, chips) |
| `card` | `#FFFFFF` | Surfaces |
| `ink`, `ink-2` | `#0B1020`, `#1B2236` | Text, primary buttons, the one dark band (Proof) |
| `soft`, `faint` | `#586074`, `#8A91A3` | Secondary text (AA on page and card), placeholders |
| `line`, `line-strong` | `#E4E7EE`, `#CFD4DE` | 1px borders and table rules |
| `golden` | `#F5B700` | The coin: brand moments, claims, the success burst |
| `green` / `red` / `orange` / `lilac` | `#12A46B` / `#E5484D` / `#F08A24` / `#7457E8` | Healthy and up / redemption and errors / buyback and caution / issuance. The mNAV zones use exactly these |
| `blue` | `#3355FF` | Links, focus ring, info |
| `shadow-xs` … `shadow-lg` | layered, low-alpha navy | Depth for cards, lifted cards, the product frame |

Each data colour has an `-ink` (AA text) and a `-wash` (quiet fill). Chain identities come from the networks' own marks (Base `#0000FF`, Robinhood `#CCFF00`, Solana gradient).

- **Type**: Bricolage Grotesque (variable, `opsz` and `wdth` axes) for display and headings (`.type-display`, `.type-h1`, `.type-h2`); Geist for the UI and every figure, with tabular numerals (`.type-num`). Both through `next/font/google`.
- **Radii**: pill buttons, chips and badges; 10 to 12px fields and panels; 16px cards; 20 to 28px feature panels.
- **Controls**: `.btn` (+ `-blue`, `-golden`, `-red`, `-white`, `-ghost`, `-sm`, `-lg`) is a pill with a 1px lift and a soft shadow on hover; `ui/button.tsx` maps the shadcn variants to it. Also `.chip` (filters, quick amounts, slippage; `aria-pressed` turns it ink), `.pill` (badges), `.field` (inputs, blue focus ring), `.panel` (quiet inset), `.bar` (thin progress), `.table` (hairline data table), `.card` and `.card-lift`. `ui/tabs.tsx` is a segmented control whose white key slides between tabs.
- **Key components**: `MnavGauge` (a thin bar split into the four rule zones, a needle with the value, precise 0.9× / 1.0× / 2.0× ticks, `role="meter"`) and `ZoneBadge`; `LogoTile`, `StockLogo`, `ChainLogo`, `ChainStack` (real logos in neutral rounded tiles of one size); `TreasuryShowcase` (the landing's live product card); `Term` (dotted-underline jargon with a tooltip on hover and focus); `Notice` (empty and error states with one action); `ToastProvider` (pending, success with the coin burst, error, with explorer links); `CountUp`; `Reveal` / `RevealItem` (scroll reveal with a short stagger, `motion`).
- **Motion**: the hero's one orchestrated entrance (headline lines rise out of masks, then the product frame) is CSS, so it never waits for JavaScript. Sections reveal with a short stagger on scroll, the stock marquee drifts and is nudged by the scroll position, the app tabs share a sliding pill (`motion` `layoutId`), table rows settle in, cards lift on hover, figures count up, the flow diagram's dashes travel. `prefers-reduced-motion` turns all of it off (animations and transitions end at once, reveals and the marquee render static).
- **Display helpers** (pure, in `src/lib`): `market.ts` (one summary row per meme, shared by Markets, the landing and the Dashboard, with a 30-second read cache), `portfolio.ts` (positions valued at the pool price, at a full-sell quote and at NAV, share of treasury, totals), `brands.ts` (logo map), `site.ts` and `app-link.tsx` (landing and app URLs), `showcase-snapshot.ts` (the frozen read of the test meme), `mnav.ts`, `price.ts` (tiny prices as `$0.0₅39`), `proof.ts`. The contract and data logic in the other `src/lib` files is unchanged.

## Logos

Real marks for the eight listed stocks (NVIDIA, Apple, Microsoft, Alphabet, Amazon, Meta, Tesla, SpaceX), the chains (NEAR, Base, Robinhood Chain, Solana) and the infrastructure (NEAR Chain Signatures and NEAR Intents use the NEAR mark, Uniswap, Raydium, Chainlink, Circle USDC), stored in `public/logos/{stocks,chains,platforms}` (24 KB in total). Each file's source is listed in [`public/logos/SOURCES.md`](public/logos/SOURCES.md): the official Base brand kit, Wikimedia Commons, Simple Icons and cryptologos.cc. They are trademarks of their owners, shown to identify the assets; the footer says so.

## Design credits

The interface blends a few [MotionSites](https://motionsites.ai) prompts, used under the maintainer's Power plan, into one system (same palette, type and radii). No MotionSites asset is shipped: the look is rebuilt in CSS and the only images are the logos above.

| MotionSites prompt id | Where it is used |
| --- | --- |
| `ledgely` | The landing hero: centred headline whose lines rise out of their masks, then a framed product showcase rising into two coloured glows over a halftone dot field. Brought to a light theme, with Base-blue and Solana-mint glows and the live treasury card instead of a dashboard mock |
| `nimbus-demo` | The console feel of the app: a hairline data table with a quiet header row and state badges (Markets), and the confirmation toast |
| `scroll-marquee` | The supported-stocks marquee: two rows drifting in opposite directions, shifted further by the scroll position |
| `rocket-faq` | The FAQ layout: a sticky intro column beside a single-open accordion with a rotating chevron |

Also reviewed and not used: `crypto-vault`, `pulse`, `moxly-hero`, `zapline-cta`, `fundora`, `zeno-bank` (all dark or too loud for a light, data-first product).

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
- The Dashboard's activity reads the latest transactions of the memes the account holds (up to three) from the rate-limited NearBlocks API, so it can be empty or unavailable for a minute.
