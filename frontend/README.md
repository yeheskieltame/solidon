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
| `/` | Explains mNAV and the four capital rules, lists every meme from the factory with price, NAV per token and mNAV |
| `/launch` | Three steps: `create_meme` (attaches `launch_cost()`), seed the pool (`storage_deposit` of the meme on USDC + `ft_transfer_call` with `{"action":"seed"}`), `init_treasury()`. `?meme=<account>` resumes a launch |
| `/meme/[account]` | Buy, sell, redeem, claim, rebalance, and the proof dashboard |

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

For each treasury chain (Base Sepolia, Robinhood Chain testnet, Solana devnet) the dashboard shows the treasury address and stock token with explorer links. It also puts the contract ledger (`usdc`, `stock` from `get_treasury_chains`) next to the balance read live from the chain: ERC-20 `balanceOf` through `eth_call` on the EVM chains, `getTokenAccountsByOwner` on Solana. The event log parses the meme's NEP-297 `EVENT_JSON` logs from the NearBlocks v3 API: the account's receipts, then each transaction's receipt tree.

Every view fails soft. A meme on older contract code without `get_treasury_chains` still renders, with a note, and its stock venues come from `src/lib/venues.ts`. That file is generated from `contracts/stocks/*.json`, so regenerate it when the registries change. Solana fields (`solana`, `solana_address`, or a chain entry named `solana`) are optional and picked up when the contract reports them.

## Deploy

It is a standard Next.js app with no server secrets, so any Next.js host works: Vercel with the project root set to `frontend/`, or `npm run build && npm run start` behind a proxy. Set the `NEXT_PUBLIC_*` variables before building, and point `NEXT_PUBLIC_FACTORY` at the redeployed multichain factory.

## Known limits

- Testnet only. The oracle is a mock with settable prices, and every stock venue is a Solidon synthetic token.
- The NearBlocks public API is rate limited. The event log reads the latest 10 transactions and falls back to a NearBlocks link.
- Enter from any chain (NEAR Intents 1Click) is not wired in the UI yet. Buying needs USDC on NEAR.
