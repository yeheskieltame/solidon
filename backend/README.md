# backend

Node.js services and spike scripts that support the contracts. None of them holds a key that controls a treasury: the meme contract signs through Chain Signatures, and anyone can broadcast what it signed.

| Path | Purpose |
| --- | --- |
| `keeper/` | Testnet keeper: mock oracle prices, treasury housekeeping (EVM and Solana), broadcaster for MPC-signed transactions, testnet bridge for `fund_chain`; indexer + read API (price history, event log) |
| `spike/` | Integration spike scripts behind [docs/SPIKE.md](../docs/SPIKE.md) |
| `solana-spike/` | Raydium CLMM venues and the MPC-signed swap on Solana devnet (S25) |

API keys for the backend and spikes go in `backend/.env` (gitignored); see `backend/.env.example`.

## keeper

```bash
cd backend/keeper
npm install
npm test                              # pure logic + flow tests, no network
node keeper.js --once --dry-run       # real reads, no transaction; no key needed
node keeper.js                        # loop every LOOP_SECS (60 s), plus the indexer + read API
node indexer.js                       # indexer + read API only: no key, never signs
```

Node 20+. Flags: `--once` (one cycle, no API), `--dry-run` (every write is logged as `DRY ... would ...` instead of sent), `--no-api` (no indexer, no HTTP API), `--meme=a.testnet,b.testnet`, `--only=oracle,broadcast,bridge,treasury,solana`. Logs are one line per event with explorer links; RPC URLs and keys are redacted.

One cycle:

| Step | What it does | Trust |
| --- | --- | --- |
| Oracle (testnet only), every `ORACLE_INTERVAL_SECS` | Reads `latestRoundData()` of the 8 official Chainlink proxies on Robinhood Chain mainnet (Alchemy, docs/SPIKE.md S19) and sets them on the mock oracle (`pyth.<factory>`, `set_price`), 8 actions in one NEAR transaction. A feed older than `ORACLE_MAX_FEED_AGE_SECS` (25 h: weekend or broken) is not pushed, so the contracts' 15-minute staleness brake applies. Refuses to write to a real Pyth receiver | The mock is trusted on testnet (anyone can set it) |
| Broadcast | Per meme and chain: sends `get_signed_tx(chain, nonce)` for every nonce between the treasury's on-chain nonce and the meme's next nonce, waits for the receipt, logs the explorer link. A reverted swap is logged as an error (the ledger booked `minAmountOut`). Tops up the treasury's gas from the keeper wallet when it is below `TREASURY_GAS_MIN_ETH` | None: the transactions are signed by the MPC and checked by the contract; anyone can run this |
| Bridge (testnet stand-in for Intents/1Click) | Lists USDC transfers to the keeper account on NearBlocks v3, reads each one back from NEAR RPC (`EXPERIMENTAL_receipt`: sender is a factory meme, `ft_transfer`, memo `solidon fund <chain> <treasury>`, the treasury `0x…` on EVM or base58 on Solana), then sends the same amount (6 → 6 decimals on Base Sepolia, 6 → 18 on Robinhood testnet, 6 → 6 Circle devnet USDC on Solana, into the treasury's USDC associated token account, created if missing) from the keeper wallet to the treasury, capped by the meme's `in_transit` minus what is already delivered. Then proves it: `credit_cash(chain, tx_hash, log_index, log)` on Base (MPC-verified log, 300 TGas), `report_cash(chain, tx_hash, amount)` on Robinhood and on Solana (`tx_hash` = the transaction signature, base58). `state.json` keys every transfer by NEAR receipt id; the signed transaction is saved before broadcast, so a restart resumes it instead of paying twice. A Solana delivery that never landed is replaced only once the finalized block height has passed its `lastValidBlockHeight` (it can no longer land) | Testnet bridge is trusted to deliver (docs/SPEC.md threat model); Robinhood and Solana arrivals are relayer-reported |
| Treasury | Per meme: `init_treasury` if no address; `approve_router(chain)` when not approved; `buy_stock(chain)` when the chain holds USDC and the price is fresh; `fund_chain(chain)` when nothing is in transit, the chain's USDC is spent and the estimated cash above the 20% buffer is at least `FUND_MIN_USDC`; `rebalance()` when the cooldown is over and the price is fresh. Signing steps wait while a signature is in flight | None: open methods, the contract decides |
| Solana (per meme with a Solana venue) | `init_solana_treasury()` if no address. `set_solana_accounts(usdc_bump, stock_bump)` (relayer only) with the canonical bumps of the treasury's USDC (SPL Token) and stock (Token-2022) associated token accounts, also when the stored ones differ. Keeps the treasury above `TREASURY_SOL_MIN` SOL from the keeper wallet (it pays its swap fees and the first stock account rent, ~0.002 SOL). Then the **last signed buy** first: landed → done; unknown with a valid blockhash → `sendTransaction` again; expired (or landed with an error, which moves nothing) → `resign_solana(blockhash, tick_arrays)` once NEAR is 200 blocks past its `signed_at`, then broadcast the new sequence number (at most `SOLANA_MAX_RESIGNS` times). Only once the last buy landed: `buy_stock_solana(blockhash, tick_arrays)` (300 TGas) when the ledger holds at least `FUND_MIN_USDC`, the price is fresh and nothing is in flight: reads the pool (`tick_current`, default bitmap), picks up to 3 initialized tick arrays in the swap direction (one-sided pools need 2) with their PDA bumps and a `confirmed` blockhash, then sends `get_signed_tx("solana", seq)` (base64, preflight on) at once and confirms it. `fund_chain("solana")` under the same rule as the EVM chains | None for the buy (MPC-signed, built by the contract; wrong live inputs only make it fail). The relayer sets the token accounts |

The fund estimate counts the Solana ledger too, as the contract's NAV does.

Memes on pre-multichain code (no `get_treasury_chains`, like the current `elondoge.solidon.testnet`) only get `rebalance()`; a factory without `get_chains` is reported and the chain list is taken from `contracts/stocks/`.

### Indexer and read API

The web app's activity feed reads NearBlocks, which rate-limits, and the contracts keep no price history. The indexer (`src/indexer.js`) fills both gaps and serves them over HTTP (`src/api.js`, `node:http`, JSON, CORS `*`, read-only). It starts with the keeper (`--no-api` turns it off) and runs alone as `node indexer.js` for a hosted read-only deployment: that process loads no key and sends no transaction. It has its own timers, so a slow indexer source never delays the treasury loop.

- **Snapshots**, every `SNAPSHOT_SECS` (default `LOOP_SECS`, 60 s): per meme `get_pool`, `get_treasury`, `get_treasury_chains` and the oracle price (`get_price_no_older_than`, else `get_price_unsafe` with `oracle_stale: true`), turned into one point with the contract's math (`Meme::assets` / `Meme::nav`, the same as `frontend/src/lib/math.ts`): treasury value = NEAR cash + USDC on and in transit to every chain + stock on every chain at one price; `nav` = value / circulating; `mnav` = (TWAP, else spot) / NAV. Every point is kept for 24 h, then one per 15 minutes (compacted hourly).
- **Events**, every `INDEXER_POLL_SECS` (20 s): the [FastNear transactions API](https://tx.test.fastnear.com) lists the transactions of the factory and of every meme (`POST /v0/account`, newest first, paged by `resume_token`); new ones are fetched with every receipt and log (`POST /v0/transactions`, 20 per call). Each `EVENT_JSON:` log of a receipt executed by the factory or a meme is stored under that account, one record per `data` item; NEP-141 events of the USDC contract that name a meme (buys, payouts, `fund_chain` transfers with their memo) are stored under that meme. A transaction is stored once all its receipts have executed. **Backfill**: the first run walks every page back to the account's creation (e2etest: 48 transactions in ~6 s); `data/cursor.json` records each indexed transaction and each fully backfilled account, so a restart resumes and a new meme is backfilled on its first poll.
- **Why not neardata block-following**: measured on 11 Nov 2026, the free tier of `testnet.neardata.xyz` answers "rate-limit exceeded of 30 blocks per minute" (HTTP 429), while testnet produces ~100 blocks a minute (0.6 s blocks), so it cannot even follow the head; a backfill from the factory deploy (~180k blocks) would take days. The FastNear tx API indexes per account, so the cost scales with Solidon's own transactions, not with the chain.

Data dir `backend/keeper/data/` (gitignored; `INDEXER_DATA` moves it):

| File | Content |
| --- | --- |
| `history/<meme>.jsonl` | `{t, price, twap, nav, mnav, stock_price, oracle_stale, treasury_value, circulating, chains: {base, robinhood, solana}}`, ascending. Prices and values in USD per whole token; `chains` is the stock held per chain in raw units of its venue token; `twap`/`nav`/`mnav` are `null` when not computable |
| `events/<account>.jsonl` | `{block_height, timestamp, tx_hash, receipt_id, log_index, data_index, signer, predecessor, receiver, event, standard, version, data}`; `receiver` is the contract that emitted it (the meme, the factory, or the USDC contract) |
| `cursor.json` | `{done: {<tx_hash>: <block>}, backfilled: {<account>: true}}` |

Routes (`INDEXER_PORT`, default 8788). `limit` is 1..500; errors are `{"error": "..."}` with 400 (bad parameter or account id), 404 (unknown meme or route) or 405 (not GET):

| Route | Answer |
| --- | --- |
| `GET /health` | `{ok, last_block, memes, lag_s, events, transactions, backfilled, tracked, last_snapshot}`; `last_block` is the final NEAR block at the last finished poll, `lag_s` the seconds since; `ok` is false before the first poll or when it is late |
| `GET /v1/memes` | `{memes: [{id, symbol, name, creator, ticker, latest, events}]}`, `latest` = the newest snapshot or `null` |
| `GET /v1/memes/:id/history?since=<unix s>&limit=` | `{meme, history: [snapshot...], more}`, ascending from `since` (default all, limit 500) |
| `GET /v1/memes/:id/events?limit=50&before=<block>` | `{meme, events: [event...], more}`, newest first; page with `before` = the last `block_height` seen |
| `GET /v1/accounts/:id/activity?limit=50&before=<block>` | `{account, events, more}`: events of every meme and the factory where the account is the signer, the predecessor, or named in `data` (`account`, `owner_id`, `old_owner_id`, `new_owner_id`, `caller`, `creator`) |

### Keeper setup (maintainer)

1. **NEAR account `keeper.<factory>`** (`keeper.solidon.testnet`). `contracts/deploy-testnet.sh` names it as every meme's `bridge` and `relayer`, so it must exist before memes are funded. Create it with a key the keeper can read, e.g. near-cli-rs's legacy keychain:
   ```bash
   near account create-account fund-myself keeper.solidon.testnet '5 NEAR' autogenerate-new-keypair \
     save-to-legacy-keychain sign-as solidon.testnet network-config testnet sign-with-keychain send
   ```
   This writes `~/.near-credentials/testnet/keeper.solidon.testnet.json`, which the keeper reads; or set `KEEPER_NEAR_PRIVATE_KEY=ed25519:...`. Gas: the oracle push burns roughly 0.003 NEAR every 5 minutes (about 1 NEAR a day); signing calls are paid by the meme. On its first run the keeper registers itself on the USDC contract (`storage_deposit`, 0.00125 NEAR), without which every `fund_chain` transfer bounces back.
2. **Keeper EVM wallet**: the testnet deployer `EVM_DEPLOYER_ADDRESS` / `EVM_DEPLOYER_PRIVATE_KEY` from `contracts/.env` (or `KEEPER_EVM_PRIVATE_KEY`). Each `fund_chain` moves at most 5 USDC (`max_swap_usdc`), so 20 USDC per chain covers four lots:
   - **Base Sepolia**: Circle USDC from [faucet.circle.com](https://faucet.circle.com) (Base Sepolia). ETH for gas and treasury top-ups.
   - **Robinhood testnet**: ETH from the faucet, then USDC (18 decimals) from the testnet Uniswap fork's WETH/USDC 0.3% pool (about 74 USDC per ETH on 10 Nov 2026, an arbitrary testnet price, so 20 USDC costs about 0.27 ETH). `amountOutMinimum` 0 is acceptable only because these are testnet tokens:
     ```bash
     cast send 0x3ce954107b1a675826b33bf23060dd655e3758fe \
       "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
       "(0x33e4191705c386532ba27cbf171db86919200b94,0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F,3000,$EVM_DEPLOYER_ADDRESS,270000000000000000,0,0)" \
       --value 0.27ether --rpc-url "https://robinhood-testnet.g.alchemy.com/v2/$ALCHEMY_API_KEY" --private-key "$EVM_DEPLOYER_PRIVATE_KEY"
     ```
   The keeper logs its balances on every start (`[wallet:base]`, `[wallet:robinhood]`) and warns when a delivery cannot be paid.
3. **Keeper Solana wallet**: a throwaway devnet keypair the keeper creates on its first run in `backend/keeper/.secrets/solana-keeper.json` (ignored by git, mode 600; `KEEPER_SOLANA_KEYPAIR` overrides the path). It logs the public address (`[wallet:solana]`), never the key, and signs only its own transfers: USDC deliveries and treasury SOL top-ups. It needs:
   - **devnet SOL**: the keeper asks for a 1 SOL airdrop (Alchemy `requestAirdrop`, 1 SOL a request) when it holds less than `KEEPER_SOL_MIN`; a treasury top-up is up to 0.02 SOL, a delivery up to ~0.003 SOL (fee, plus the treasury USDC account rent the first time).
   - **Circle devnet USDC** (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) from [faucet.circle.com](https://faucet.circle.com) (Solana Devnet, captcha); 20 USDC covers four 5-USDC `fund_chain` lots.
4. **Factory**: the multichain factory (`contracts/deploy-testnet.sh`) must be deployed for anything but the oracle and `rebalance()` to run; the live `solidon.testnet` still runs the BSC-era code.

### Known gaps

- **Solana holdings are booked, not read**: the keeper checks only the last signed buy, because the contract can re-sign only its `last_buy`; so it never starts a new buy before the last one landed. A buy that keeps failing on-chain (e.g. the pool moved past `minOut`) is re-signed at most `SOLANA_MAX_RESIGNS` times, then left for a human.
- **Stuck signatures**: the keeper does not call `clear_stuck_signature` (300 blocks), on EVM or Solana.
- **MPC log index**: `credit_cash` uses one `log_index` both to select the log and as the log's `logIndex` in the payload hash. The keeper sends the receipt's `logIndex` (as backend/spike/s8 did). Both live checks (S18, S26) had `logIndex` equal to the log's position in the receipt, so whether the MPC selects by position or by block-wide `logIndex` is unconfirmed; when they differ, the keeper warns, and a failed credit is retried `CREDIT_MAX_ATTEMPTS` times, then left as `credit-failed` in `state.json`.
- **Bridge source**: incoming transfers are listed through NearBlocks v3 (v1 was retired on 5 Nov 2026; v3 has no memo, hence the receipt read-back). If NearBlocks is down the bridge waits; nothing is lost.
- **Restarts**: a transfer seen but not yet delivered when `state.json` is lost is still capped by `in_transit`, so it cannot be delivered twice.
- **Indexer source**: one free third-party API (FastNear tx API, rate-limited; the client waits and backs off on 429). If it is down, history keeps accumulating and events catch up on the next good poll. Events of memes are read from receipts the meme executed; events of other contracts are not indexed except USDC transfers that name a meme. Failed receipts emit no logs, so failed buys/sells do not appear.
- **History starts at the first indexer run**: the contracts keep no price history, so there are no points before that (events, in contrast, are backfilled). Gaps appear while no indexer runs.
- **Indexer storage** is JSONL files held in memory (fine for hackathon volume: tens of memes, thousands of events); `activity` scans every event per request.
