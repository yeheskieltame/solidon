# Solidon — Development References

Every reference link used to build Solidon. Contract addresses, feed IDs, and SDK versions are **always verified against the official source** before use, never taken from memory or from this document alone.

Last updated: 8 Nov 2026 · Owner: [@yeheskieltame](https://github.com/yeheskieltame)

## 1. Hackathon

| Source | Link | Used for |
| --- | --- | --- |
| NEAR HACKATHON website | https://nearhackathon.com/ | General info, submission form |
| HACKATHON.md (official rules, live) | https://nearhackathon.com/HACKATHON.md | Rules Q-000 to Q-017, submission API. **Re-read before submitting** |
| Request changes to a submission | https://nearhackathon.com/request-changes | Fixing a submission already sent |
| Example prompts per track | https://github.com/nearai/near-hackathon-prompt-examples | What judges expect |
| DeFi track prompt | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/01-defi.md | Track `defi` |
| Memecoins track prompt | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/11-memecoins.md | Track `memecoins` (60-day simulation, no admin key, sybil) |
| NEAR Builders | https://nearbuilders.org/build | Extra ecosystem resources |
| NEAR AI Cloud (credits + API key) | https://cloud.near.ai | If inference is needed |
| NEAR Discord | https://discord.gg/nearprotocol | Questions to organizers and builders |
| NEAR builders Telegram | https://t.me/nearbuilderschat | Technical questions |
| NEAR Protocol on X | https://x.com/NEARProtocol | Announcements, tag in the demo post |

## 2. NEAR core

| Source | Link | Used for |
| --- | --- | --- |
| NEAR Docs | https://docs.near.org/ | Main reference |
| NEAR + AI | https://docs.near.org/ai/introduction | Shade Agent, tools for agents |
| RPC providers (public, free) | https://docs.near.org/api/rpc/providers | Testnet/mainnet RPC |
| Access keys (function call keys) | https://docs.near.org/protocol/accounts-contracts/access-keys | Keeper/relayer accounts with limited permissions |
| NEP-141 (fungible token) | https://github.com/near/NEPs/blob/master/neps/nep-0141.md | Meme token |
| NEP-245 (multi token) | https://github.com/near/NEPs/blob/master/neps/nep-0245.md | Balance format in `intents.near` |
| NEAR agent skills | https://github.com/near/agent-skills | `near-smart-contracts` and `near-intents` skills for coding agents |

## 3. Chain Signatures (BSC treasury)

| Source | Link | Notes |
| --- | --- | --- |
| Chain Signatures implementation | https://docs.near.org/chain-abstraction/chain-signatures/implementation | Address derivation, `sign`, relay. Includes the Omni Transaction section for building transactions inside a Rust contract |
| Multichain example (EVM, BNB Chain, etc.) | https://github.com/near-examples/near-multichain | Frontend example + EVM adapter |
| Script + proxy contract example | https://github.com/near-examples/chainsig-script | Pattern for a contract calling `sign` |
| MPC contract | mainnet `v1.signer`, testnet `v1.signer-prod.testnet` | Addresses from the docs above |

## 4. NEAR Intents (cross-chain in and out)

| Source | Link | Notes |
| --- | --- | --- |
| NEAR Intents docs | https://docs.near-intents.org/ | Full index: https://docs.near-intents.org/llms.txt |
| 1Click API quickstart | https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/introduction.md | Deposits from any chain |
| Supported tokens (live) | https://1click.chaindefuser.com/v0/tokens | Check the `assetId` of USDC/USDT on NEAR and BSC |
| Account abstraction | https://docs.near-intents.org/integration/verifier-contract/account-abstraction.md | Contracts can use `intents.near` through predecessor auth |
| Intent types | https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution.md | transfer, withdraw, token_diff |
| Deposits and balances | https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/deposits.md | `ft_transfer_call` to `intents.near` |
| 1Click JWT (optional) | https://partners.near-intents.org | Without a JWT there is a 0.2% fee (Q-006) |

**Important:** Intents has no testnet (Q-007). Use a separate dev account on mainnet, small amounts, and `dry: true` quotes.

## 5. Oracle

| Source | Link | Notes |
| --- | --- | --- |
| Oracles on NEAR (Pyth + OutLayer) | https://docs.near.org/primitives/oracles | Mainnet `pyth-oracle.near`, testnet `pyth-oracle.testnet`, Hermes `hermes.pyth.network` |
| Pyth price feed list | https://pyth.network/price-feeds | Find the NVDA/USD feed ID (equity, follows US market hours) |
| Pyth NEAR receiver source | https://github.com/pyth-network/pyth-crosschain/tree/main/target_chains/near/receiver/src | `get_price_no_older_than(price_id, age)` returns `Option<Price { price: I64, conf: U64, expo: i32, publish_time: i64 }>`; `price_id` is 64 hex characters without `0x` |
| NVDA/USD feed ID (verified 9 Nov 2026) | https://hermes.pyth.network/v2/price_feeds?query=NVDA&asset_type=equity | `Equity.US.NVDA/USD` = `b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593`, same ID on Hermes beta. Schedule: US market hours only |

Notes from verification on 9 Nov 2026:

- The NVDA feed does not exist on `pyth-oracle.near` yet (`price_feed_exists` = `false`). Pyth on NEAR is pull-based: the keeper must push the first `update_price_feeds`.
- Hermes `/v2/updates/price/latest` answered `401 unauthorized` without credentials, while `/v2/price_feeds` stayed public. The keeper needs a Hermes API key or another update source.

## 6. NEAR ecosystem partners

| Partner | Link | Relevance |
| --- | --- | --- |
| Rhea (DEX + lending) | https://guide.rhea.finance/ · SDK: https://github.com/rhea-finance/rhea-sdk-docs | Optional: meme liquidity after graduation |
| OutLayer (TEE) | https://outlayer.fastnear.com/ · https://app.outlayer.ai/docs/getting-started | Keeper upgrade + BSC balance attestation |
| meme.cooking | https://docs.meme.cooking/ | Comparison point for memecoin launchpads on NEAR |
| SVRN | https://svrn.net/research/near-protocol | Reference for the treasury company + mNAV narrative |

## 7. BNB Smart Chain and bStocks

| Source | Link | Notes |
| --- | --- | --- |
| BNB Chain docs | https://docs.bnbchain.org/ | RPC, chain ID, testnet faucet |
| bStocks launch on BNB Chain | https://bnbchain.org/en/blog/introducing-bstocks-on-bnb-chain-trade-24-7-with-zero-fees-deploy-across-defi-protocols-with-full-self-custody | bStocks are BEP-20, self-custodial, usable on PancakeSwap |
| DefiLlama research on bStocks | https://defillama.com/research/spotlight/stocks-onchain-how-binance-stocks-and-bstocks-cover-the-full-equities-spectrum | 1:1 backing, issuer, composability |
| bStocks list (Trust Wallet) | https://trustwallet.com/blog/announcements/access-bstocks-on-trust-wallet-tokenized-shares-on-chain | Initial tickers: TSLAB, CRCLB, MUB, SNDKB, NVDAB. **Take full addresses from BscScan/Binance** |
| BscScan | https://bscscan.com/ | Verify token, pool, and treasury balances |
| PancakeSwap developer docs | https://developer.pancakeswap.finance/ | Router addresses and swap ABI |
| PancakeSwap v3 addresses (verified 9 Nov 2026) | https://developer.pancakeswap.finance/contracts/v3/addresses | Mainnet: Factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`, SwapRouter `0x1b81D678ffb9C0263b24A97847620C99d213eB14`, QuoterV2 `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`. Testnet: same Factory and SwapRouter, QuoterV2 `0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2` |
| Verified bStocks list | [docs/STOCKS.md](STOCKS.md) | Token, Pyth feed, and pool per listed stock, with evidence |
| Tokenized equities on BNB (xStocks, KYC) | https://www.bnbchain.org/en/blog/the-next-step-for-tokenized-equities-funding-paths-matter-after-assets-move-onchain | xStocks alternative, KYC at the platform level |

## 8. Internal

| Document | Link |
| --- | --- |
| Product & technical spec | [docs/SPEC.md](SPEC.md) · living version: https://claude.ai/artifact/HZkuPm9XMMWj3UmzHVEGU6 |
| Hackathon rules summary | [docs/HACKATHON_RULES.md](HACKATHON_RULES.md) |
| Working rules, PRs, issues | [CONTRIBUTING.md](../CONTRIBUTING.md) |
