# contracts

Rust smart contracts for NEAR, one cargo workspace.

| Crate | Purpose |
| --- | --- |
| `meme` | NEP-141 meme token, internal meme/USDC pool, mNAV engine, BSC treasury via Chain Signatures |
| `factory` | Deploys each meme as a sub-account, e.g. `nvda.solidon.near` |
| `mock-ft` | Minimal NEP-141 used as USDC in sandbox tests and on testnet |

## Requirements

- Rust (see `rust-toolchain.toml` when present) with the `wasm32-unknown-unknown` target
- [cargo-near](https://github.com/near/cargo-near) 0.23+

## Commands

```bash
cd contracts
./build.sh          # build every contract to target/near/
cargo test          # unit tests + sandbox integration tests
```
