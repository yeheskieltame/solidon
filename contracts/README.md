# contracts

Rust smart contracts for NEAR, one cargo workspace.

| Crate | Purpose |
| --- | --- |
| `meme` | NEP-141 meme token, internal meme/USDC pool, mNAV engine, multichain treasury via Chain Signatures (EVM: Base and Robinhood Chain; Solana: Raydium CLMM) |
| `factory` | Deploys each meme as a sub-account, e.g. `nvda.solidon.near` |
| `mock-ft` | Minimal NEP-141 used as USDC in sandbox tests and on testnet |
| `mock-pyth` | Pyth read interface with settable prices, for sandbox tests and testnet |
| `evm/` | Foundry project: `MockERC20` and `deploy-testnet-stocks.py` for synthetic stock tokens and Uniswap v3 pools on Base Sepolia and Robinhood Chain testnet (not a NEAR crate) |

`stocks/` holds what the factory lists: `feeds.json` (oracle feed id per stock) and one venue registry per chain (`base-sepolia.json`, `hood-testnet.json`: USDC, SwapRouter02, stock token, decimals, pool; `solana-devnet.json`: Circle USDC, Raydium CLMM program and AMM config, stock mint, decimals, pool and its vaults, observation and bitmap extension). `solana-accounts.py` derives those pool accounts and checks them against devnet (`--write` fills them in after `backend/solana-spike/1_setup.js`). `deploy-testnet.sh` runs that check and builds the factory's init args from the registries; `DRY_RUN=1 ./deploy-testnet.sh` prints the args and sends nothing.

## Requirements

- Rust (see `rust-toolchain.toml` when present) with the `wasm32-unknown-unknown` target
- [cargo-near](https://github.com/near/cargo-near) 0.23+

## Commands

```bash
cd contracts
./build.sh          # build every contract to target/near/
cargo test          # unit tests + sandbox integration tests
./deploy-testnet.sh # one-shot testnet deploy, signs with your keychain (see docs/DEPLOYMENTS.md)
```

## Meme contract methods

| Method | Who | What it does |
| --- | --- | --- |
| `ft_transfer_call` on USDC, `msg: {"action":"seed"}` | creator, once | First USDC liquidity |
| `ft_transfer_call` on USDC, `msg: {"action":"buy","min_out":"<u128>"}` | anyone | Buy; full refund if `min_out` is not met |
| `sell(amount, min_out)` + 1 yocto | holder | Sell for USDC |
| `rebalance()`, 100 TGas | anyone, once per hour | Reads Pyth, then issuance (mNAV > 2.0), buyback (< 1.0), redemption window (< 0.9); 0.05% tip to the caller |
| `redeem(amount, min_usdc)` + 1 yocto, 100 TGas | holder, window open | Burns and pays NAV per token in USDC from cash; refunds on any failure |
| `claim_usdc()` | creator, callers, failed payouts | Withdraws claimable USDC |
| `init_treasury()` | anyone, once | Reads the MPC-derived key (`evm-treasury` path, domain 0) and stores the treasury's EVM address, the same on every EVM chain |
| `approve_router(chain)`, 300 TGas | anyone, once per chain | MPC-signs `approve(router, max)` on that chain's USDC for the treasury |
| `fund_chain(chain)`, 100 TGas | anyone | Fresh oracle price, then sends NEAR cash above the 20% buffer (at most `max_swap_usdc`) to the factory's `bridge` with memo `solidon fund <chain> <treasury>`; booked as in transit for that chain (counted in NAV). A failed transfer returns it |
| `credit_cash(chain, tx_hash, log_index, log)`, 300 TGas | anyone, `Mpc` chains (Base) | `log` = `{block_hash, block_number, transaction_index, address, topics, data}` from `eth_getTransactionReceipt`. Checks it is a USDC `Transfer` to the treasury, computes the MPC payload hash and calls `verify_foreign_transaction` (domain 3) with it as `expected_payload_hash`; on success moves `min(value, in transit)` into the chain's USDC. Once per log |
| `report_cash(chain, tx_hash, amount)` | the factory's `relayer`, `Relayer` chains (Robinhood) and Solana | Same credit, capped by in transit, once per tx; `amount` in the chain's raw USDC units. On Solana `tx_hash` is the transaction signature (base58) |
| `buy_stock(chain)`, 300 TGas | anyone | Fresh oracle price, then MPC-signs a Uniswap v3 SwapRouter02 `exactInputSingle` of up to `max_swap_usdc` of that chain's USDC into the stock (`minOut` = oracle value − 1%) |
| `init_solana_treasury()` | anyone, once | Reads the MPC-derived EdDSA key (`solana-treasury` path, domain 1): the treasury's Solana address |
| `set_solana_accounts(usdc_account_bump, stock_account_bump)` | the factory's `relayer` (may correct it) | Stores the treasury's USDC (SPL Token) and stock (Token-2022) associated token accounts, derived with the given canonical bumps |
| `buy_stock_solana(blockhash, tick_arrays)`, 300 TGas | anyone | Fresh oracle price, then MPC-signs (EdDSA) a legacy message: `CreateIdempotent` for the stock account + Raydium CLMM `swap_v2` of up to `max_swap_usdc` USDC into the stock (`minOut` = oracle value − 1%). `blockhash`: recent, base58. `tick_arrays`: 1–3 `[start_index, bump]` of the pool's initialized tick arrays in the swap direction, nearest first. The signature is checked with `ed25519_verify`; the ledger books it at signing |
| `resign_solana(blockhash, tick_arrays)`, 300 TGas | anyone, 200 blocks after the last Solana signature | Signs the last Solana buy again (same amount and `minOut`) with a new blockhash, for one that expired unlanded; the ledger is not touched |
| `clear_stuck_signature()` | anyone, 300 blocks after a signature request | Frees a signing slot whose callback never completed; the nonce is not consumed |
| `get_treasury_chains`, `get_signed_tx(chain, nonce)` | view | Treasury address, signing flag, per EVM chain: config, stock venue, nonce, ledger (USDC, stock, USDC in transit); `solana`: config, venue, address, token accounts, next sequence number, ledger, last buy (`seq`, amounts, `signed_at` block). Signed transactions for any relayer: `0x` hex on EVM, base64 on Solana (`[1] ‖ signature ‖ message`, ready for `sendTransaction`) |
| `get_params`, `get_info`, `get_pool`, `get_treasury`, `quote_buy`, `quote_sell`, `claimable_of` | view | Locked parameters, stock config, reserves and TWAP, NAV/mNAV state |

`chain` is a name from the factory's chains config (`base`, `robinhood`, `solana`). Each chain keeps its own nonce (a sequence number on Solana) and ledger (USDC and stock in raw units, USDC in transit at 6 decimals); one signature is in flight at a time across all chains. NAV values the stock on every chain at one oracle price per stock and adds USDC on and in transit to every chain (normalised to 6 decimals) to the NEAR cash. A chain's USDC is only credited out of its in-transit amount, so moving cash NEAR → in transit → chain never changes NAV.

Every transaction is built inside the contract from locked config (plus a Solana buy's blockhash and tick arrays, which can only make it fail) and checked against the treasury key (`ecrecover`, `ed25519_verify`) before it is stored. There is no owner method. Prices are USDC raw units per meme raw unit, scaled by 1e30.

Factory: `new(usdc, oracle, chains, stocks)` with `chains = {mpc, bridge, relayer, evm: [{name, chain_id, usdc, usdc_decimals, swap_router, pool_fee, max_fee_per_gas, max_priority_fee_per_gas, max_swap_usdc, proof}], solana: {name, usdc_mint, usdc_token_program, stock_token_program, clmm_program, amm_config, max_swap_usdc} | null}`, `proof` = `{"Mpc": {"foreign_chain": "Base", "finality": "Latest"}}` (the MPC's chain name and `Latest | Safe | Finalized`) or `"Relayer"` and `stocks = [{ticker, price_id, venues: [{chain, token, decimals, solana}]}]`, where `solana` is `{pool, usdc_vault, stock_vault, observation, bitmap_extension}` on the Solana venue and `null` elsewhere (Solana addresses base58); views `get_chains`, `get_stocks`, `get_memes`, `launch_cost`.
