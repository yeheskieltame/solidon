# frontend

The Solidon web app: the launchpad, the launch flow, trading against each meme's internal pool, and the proof dashboard (NAV, mNAV against the locked thresholds, cash buffer, treasury per chain with ledger vs on-chain balances, event log).

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui on Base UI, and [`@hot-labs/near-connect`](https://github.com/hot-dao/near-selector) for wallets (HOT, Meteor, MyNearWallet, Intear and others from its manifest). There is no backend: every read goes from the browser to public RPCs.

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run build && npm run start
```

Node 20 or newer. Nothing is installed at the repo root.

## Configuration

All settings are public `NEXT_PUBLIC_*` variables read at build time. Copy `.env.example` to `.env.local` to change them; the defaults target NEAR testnet.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_NETWORK` | `testnet` | NEAR network for RPC, wallets and explorer links |
| `NEXT_PUBLIC_FACTORY` | `solidon.testnet` | Factory account: `get_memes`, `get_stocks`, `launch_cost`, `create_meme` |
| `NEXT_PUBLIC_USDC` | `usdc.solidon.testnet` | USDC token on NEAR (testnet: `mock-ft` with an open `mint`) |
| `NEXT_PUBLIC_NEAR_RPC` | `rpc.testnet.near.org`, then `test.rpc.fastnear.com` | Comma-separated, tried in order |
| `NEXT_PUBLIC_NEARBLOCKS_API` | `https://api-testnet.nearblocks.io` | Event log (v3 API) |
| `NEXT_PUBLIC_BASE_RPC` | `https://sepolia.base.org` | On-chain treasury balances, Base Sepolia |
| `NEXT_PUBLIC_ROBINHOOD_RPC` | `https://rpc.testnet.chain.robinhood.com` | On-chain treasury balances, Robinhood Chain testnet |
| `NEXT_PUBLIC_SOLANA_RPC` | `https://api.devnet.solana.com` | On-chain treasury balances, Solana devnet |

## Pages

| Route | What it does |
| --- | --- |
| `/` | Hero with the draggable sticker horizon, ticker tape, how it works in four steps, a playable mNAV gauge, every meme from the factory (price, NAV per token, mNAV), the three-chain proof explainer, FAQ, and the mascot call to action |
| `/launch` | A three-step wizard with a stepper and a live preview card: `create_meme` (attaches `launch_cost()`), seed the pool (`storage_deposit` of the meme on USDC + `ft_transfer_call` with `{"action":"seed"}`), `init_treasury()`. `?meme=<account>` resumes a launch |
| `/meme/[account]` | Two columns on desktop: the story (key figures, mNAV gauge, treasury per chain, cash buffer, balance sheet, locked rules, activity timeline) and a sticky panel to buy, sell, redeem, claim and rebalance. One column on mobile, with the trade panel right after the gauge |
| any other path | `not-found.tsx`, with the mascot |

## Design system

One light theme, "a sticker-book treasury": bright, tactile and bouncy, with the numbers set large and plain. Everything lives in `src/app/globals.css` (tokens on `:root`, mapped to Tailwind in `@theme`, component classes in `@layer components`).

| Token | Value | Used for |
| --- | --- | --- |
| `page`, `page-deep` | `#F0EEFA`, `#DFE4F2` | Lavender paper (the mascot clip's own backdrop) |
| `ink`, `soft` | `#100F3E`, `#55547C` | Text; `ink` also outlines every "hero" object (gauge, step cards, toasts) |
| `line`, `line-strong` | `#DCD8F0`, `#BFB8E4` | 2px card and field borders, and the 4px "side" of a card |
| `green` | `#58CC02` | Primary action, healthy state, on-chain bar |
| `blue` | `#1CB0F6` | Connect wallet, links, info, ledger bar |
| `golden` | `#FFC800` | Issuance zone, faucet, rewards |
| `orange` | `#FF9600` | Buyback zone, caution, relayer-reported |
| `red` | `#FF4B4B` | Redemption zone, errors |
| `chain-*` | Base `#0052FF`, Robinhood `#CCFF00`, Solana `#9945FF` to `#14F195` | Chain identity swatches |

Each bright colour also has a `-deep` (the side of a chunky control), an `-ink` (AA text on white and on its wash) and a `-wash` (quiet fill). Text on bright fills is always `ink`, never white, so buttons pass AA.

- **Type**: Epilogue 800/900 for headlines and figures (`.type-display`, `.type-h2`, `.type-h3`, `.type-num`), Nunito for everything else, both through `next/font/google`. Tabular numerals everywhere.
- **Radii**: 12 to 16px on controls, 24px on cards, 28 to 32px on feature panels.
- **Controls**: `.btn` (+ `-blue`, `-golden`, `-red`, `-white`, `-ink`, `-ghost`, `-sm`, `-lg`) is a 2px-bordered button with a 4px solid side that presses flat on `:active`; `ui/button.tsx` maps the shadcn variants to it. Also `.chip` (quick amounts, slippage), `.pill` (badges), `.field` (inputs), `.bar` (fat progress bar), `.card` and `.card-lift`.
- **Key components**: `MnavGauge` (four rule zones, a bouncy marker, `role="meter"`), `Term` (dotted-underline jargon with a tooltip, shown on hover and focus), `Notice` (empty and error states with a sticker and one action), `ToastProvider` (pending, success with a CSS confetti burst, error, with explorer links), `CountUp` (key figures), `Skeleton` (lavender shimmer), `StickerHorizon`, `TickerTape`, `Mascot`, `StickerTrail`.
- **Motion**: one staged entrance in the hero, springy presses and lifts, the ticker tape, draggable stickers, the eye-following mascot. `prefers-reduced-motion` turns off every animation and transition, the scroll-linked tape, the cursor trail, the count-ups and the video playback. Videos load only when they come near the viewport.
- **Display helpers** (pure, in `src/lib`): `mnav.ts` (gauge position, zones, the one-sentence status), `price.ts` (tiny prices as `$0.0₅39`), `proof.ts` (reads `config.proof` and `in_transit` from `get_treasury_chains`). The contract and data logic in the other `src/lib` files is unchanged.

## Design credits

The interface blends several [MotionSites](https://motionsites.ai) prompts, used under the maintainer's Power plan, into one system (same palette, type and radii). Their assets are stored in `public/` (no hotlinking), about 3.7 MB in total.

| MotionSites prompt id | Where it is used |
| --- | --- |
| `orbit-stickers` | Home hero: the eight die-cut space stickers, the unit-based collage scaling, the staged entrance and the drag behaviour (`sticker-horizon.tsx`, `public/stickers/*.webp`). The stickers also illustrate the steps, empty states and the launch page. Its "orbit" wordmark is not used |
| `playful-idea` | The fuzzy lavender mascot whose eyes follow the cursor by scrubbing an all-intra video with the prompt's gaze table (`mascot.tsx`, `public/mascot/*`), on the home call to action and the 404 page. Also the Epilogue Black headline face and the lavender page tones |
| `duolingo-styleguide-hero` | The component language only: chunky 3D buttons, 2px borders, pill badges, fat progress bars, tooltips, card hover lift, Nunito body, and the green, blue, golden, orange and red palette. No Duolingo logo, mascot, flags or Feather Bold font |
| `scroll-marquee` | The two counter-moving ticker rows shifted by scroll position (`ticker-tape.tsx`), with an added idle loop |
| `nexacore-process` | The "four moves" step cards: art that slides and tilts while the card lifts on hover |
| `rocket-faq` | The FAQ layout: a sticky intro column beside a single-open accordion with a rotating chevron |
| `mouse-trail-cta` | The cursor trail of stickers on the closing call to action (`sticker-trail.tsx`) |
| Background gradient "Neon Flux" | The soft colour wash behind the playable mNAV gauge (`public/backgrounds/neon-flux.mp4`) |

Changes made to the assets: the stickers are converted from PNG to WebP (9.1 MB to 1.1 MB; a faint haze in one sticker's alpha channel is removed). The mascot clip is re-encoded at 1280×720: `mascot-scrub.mp4` is the prompt's all-intra, seek-friendly derivative (`-g 1`) trimmed to the first eye orbit that the gaze table uses (2.3 MB instead of 13.4 MB), and `mascot-loop.mp4` is a normal 0.2 MB encode for touch devices and the 404 page. The gradient is re-encoded at 960×540 (69 KB).

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

It is a standard Next.js app with no server secrets, so any Next.js host works: Vercel with the project root set to `frontend/`, or `npm run build && npm run start` behind a proxy. Set the `NEXT_PUBLIC_*` variables before building, and point `NEXT_PUBLIC_FACTORY` at the redeployed multichain factory.

## Known limits

- Testnet only. The oracle is a mock with settable prices, and every stock venue is a Solidon synthetic token.
- The NearBlocks public API is rate limited. The event log reads the latest 10 transactions and falls back to a NearBlocks link.
- Enter from any chain (NEAR Intents 1Click) is not wired in the UI yet. Buying needs USDC on NEAR.
- Success toasts link to the signer's account on NearBlocks, not to the transaction: the wallet layer does not return transaction hashes.
