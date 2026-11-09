# Solidon

**Memes with a balance sheet.** A memecoin launchpad on NEAR where every meme is an on-chain treasury company holding tokenized stocks on Base, Robinhood Chain and Solana at once, controlled by the NEAR contract through Chain Signatures, with capital rules locked in code.

Built for NEAR HACKATHON 2026 · Tracks: `defi`, `memecoins` · Maintainer: [@yeheskieltame](https://github.com/yeheskieltame)

> This README is a working index. The judge-facing README (problem, "do X, see Y" steps, threat model, simulation results, tools & disclosure, disclosure of NYXERON) is written before submission.

**Live on NEAR testnet:** factory [`solidon.testnet`](https://testnet.nearblocks.io/address/solidon.testnet) listing 8 large-cap stocks. Details: [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

## Repository layout

| Path | Contents |
| --- | --- |
| [`contracts/`](contracts) | Rust smart contracts on NEAR: `meme` (token, pool, mNAV engine), `factory`, `mock-ft` |
| [`backend/`](backend) | Node.js relayer and keeper |
| [`frontend/`](frontend) | Next.js app and proof dashboard |
| [`simulation/`](simulation) | 60-day mNAV simulation |
| [`docs/`](docs) | Spec, references, hackathon rules, [deployments](docs/DEPLOYMENTS.md), PR evidence |

Each folder is self-contained, with its own README, manifest, and commands. Nothing is installed at the root.

## Documents

| Document | Contents |
| --- | --- |
| [docs/SPEC.md](docs/SPEC.md) | Product and technical spec: mNAV, features, architecture, parameters, flows, threat model, plan |
| [docs/REFERENCES.md](docs/REFERENCES.md) | Links: hackathon, NEAR, Chain Signatures, Intents, Pyth, BNB Chain, bStocks, PancakeSwap |
| [docs/HACKATHON_RULES.md](docs/HACKATHON_RULES.md) | Summary of the official hackathon rules that affect Solidon |
| [docs/SPIKE.md](docs/SPIKE.md) | What every external integration actually does, tested live |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Working rules: GitHub identity, branches, commits, severity, PR evidence |

## Working rules in one line

All GitHub activity goes through **@yeheskieltame**, every change starts from an issue, and every PR carries before/after evidence, root cause, and severity.
