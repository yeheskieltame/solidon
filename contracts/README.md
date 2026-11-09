# contracts

Rust smart contracts for NEAR, one cargo workspace.

| Crate | Purpose |
| --- | --- |
| `meme` | NEP-141 meme token, internal meme/USDC pool, mNAV engine, BSC treasury via Chain Signatures |
| `factory` | Deploys each meme as a sub-account, e.g. `nvda.solidon.near` |
| `mock-ft` | Minimal NEP-141 used as USDC in sandbox tests and on testnet |
| `mock-pyth` | Pyth read interface with settable prices, for sandbox tests and testnet |
| `evm/` | Foundry project: `MockERC20` and `deploy-bsc-testnet.sh` for mock bStocks and PancakeSwap v3 pools on BSC testnet (not a NEAR crate) |

`stocks/bsc-mainnet.json` is the verified list of stocks the factory lists; `python3 stocks/verify.py` re-checks it on-chain ([docs/STOCKS.md](../docs/STOCKS.md)).

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
| `init_treasury()` | anyone, once | Reads the MPC-derived key (`bsc-treasury` path) and stores the BSC treasury address |
| `approve_router()`, 300 TGas | anyone, once | MPC-signs `approve(router, max)` on USDT for the treasury |
| `buy_stock()`, 300 TGas | anyone | Fresh Pyth price, then MPC-signs a PancakeSwap v3 swap of up to `max_swap_usdt` into the stock (`minOut` = oracle − 1%) |
| `clear_stuck_signature()` | anyone, 300 blocks after a signature request | Frees a signing slot whose callback never completed; the nonce is not consumed |
| `get_bsc_treasury`, `get_signed_tx(nonce)` | view | Treasury address, nonce, ledger; signed raw transactions for any relayer |
| `get_params`, `get_info`, `get_pool`, `get_treasury`, `quote_buy`, `quote_sell`, `claimable_of` | view | Locked parameters, stock config, reserves and TWAP, NAV/mNAV state |

Every BSC transaction is built inside the contract from locked config and checked with `ecrecover` against the treasury address before it is stored. There is no owner method. Prices are USDC raw units per meme raw unit, scaled by 1e30.
