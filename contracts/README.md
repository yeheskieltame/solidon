# contracts

Rust smart contracts for NEAR, one cargo workspace.

| Crate | Purpose |
| --- | --- |
| `meme` | NEP-141 meme token, internal meme/USDC pool, mNAV engine, multichain treasury via Chain Signatures (EVM: Base and Robinhood Chain; Solana follows) |
| `factory` | Deploys each meme as a sub-account, e.g. `nvda.solidon.near` |
| `mock-ft` | Minimal NEP-141 used as USDC in sandbox tests and on testnet |
| `mock-pyth` | Pyth read interface with settable prices, for sandbox tests and testnet |
| `evm/` | Foundry project: `MockERC20` and `deploy-testnet-stocks.py` for synthetic stock tokens and Uniswap v3 pools on Base Sepolia and Robinhood Chain testnet (not a NEAR crate) |

`stocks/` holds what the factory lists: `feeds.json` (oracle feed id per stock) and one venue registry per chain (`base-sepolia.json`, `hood-testnet.json`: USDC, SwapRouter02, stock token, decimals, pool). `deploy-testnet.sh` builds the factory's init args from them; `DRY_RUN=1 ./deploy-testnet.sh` prints the args and sends nothing.

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
| `report_cash(chain, tx_hash, amount)` | the factory's `relayer`, `Relayer` chains (Robinhood) | Same credit, capped by in transit, once per tx; `amount` in the chain's raw USDC units |
| `buy_stock(chain)`, 300 TGas | anyone | Fresh oracle price, then MPC-signs a Uniswap v3 SwapRouter02 `exactInputSingle` of up to `max_swap_usdc` of that chain's USDC into the stock (`minOut` = oracle value − 1%) |
| `clear_stuck_signature()` | anyone, 300 blocks after a signature request | Frees a signing slot whose callback never completed; the nonce is not consumed |
| `get_treasury_chains`, `get_signed_tx(chain, nonce)` | view | Treasury address, signing flag, and per chain: config, stock venue, nonce, ledger (USDC, stock, USDC in transit); signed raw transactions for any relayer |
| `get_params`, `get_info`, `get_pool`, `get_treasury`, `quote_buy`, `quote_sell`, `claimable_of` | view | Locked parameters, stock config, reserves and TWAP, NAV/mNAV state |

`chain` is a name from the factory's chains config (`base`, `robinhood`). Each chain keeps its own nonce and ledger (USDC and stock in raw units, USDC in transit at 6 decimals); one signature is in flight at a time across all chains. NAV values the stock on every chain at one oracle price per stock and adds USDC on and in transit to every chain (normalised to 6 decimals) to the NEAR cash. A chain's USDC is only credited out of its in-transit amount, so moving cash NEAR → in transit → chain never changes NAV.

Every EVM transaction is built inside the contract from locked config and checked with `ecrecover` against the treasury address before it is stored. There is no owner method. Prices are USDC raw units per meme raw unit, scaled by 1e30.

Factory: `new(usdc, oracle, chains, stocks)` with `chains = {mpc, bridge, relayer, evm: [{name, chain_id, usdc, usdc_decimals, swap_router, pool_fee, max_fee_per_gas, max_priority_fee_per_gas, max_swap_usdc, proof}]}`, `proof` = `{"Mpc": {"foreign_chain": "Base", "finality": "Latest"}}` (the MPC's chain name and `Latest | Safe | Finalized`) or `"Relayer"` and `stocks = [{ticker, price_id, venues: [{chain, token, decimals}]}]`; views `get_chains`, `get_stocks`, `get_memes`, `launch_cost`.
