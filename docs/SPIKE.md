# Integration spike (9 Nov 2026)

Every external dependency tested with real calls or transactions before more product code. Documentation was used only to find endpoints; every result below comes from a live call, a transaction, or a fork of mainnet state. Scripts: [`backend/spike/`](../backend/spike).

**Legend:** ✅ works · ⚠️ works with limits · ❌ does not work · ⏳ needs a mainnet account to test

## Summary

| # | Integration | Result | Consequence for Solidon |
| --- | --- | --- | --- |
| S1 | NEAR MPC ECDSA signature → BSC transaction | ✅ | Treasury control works (approve mined from the MPC-derived address) |
| S2 | NEAR MPC EdDSA domain | ✅ exists (domain 1, testnet and mainnet) | Not needed after S8 |
| S3 | bStock liquidity on BSC mainnet | ✅ deep for 5 stocks, ⚠️ thinner for MSFT, AMZN, META | Per-swap cap: 1,000 USDT is safe for all 8 |
| S4 | A fresh EOA can buy, hold, and sell bStocks | ✅ (mainnet fork) | The MPC treasury can hold bStocks |
| S5 | Stock prices from Pyth on NEAR | ❌ | Every Hermes update endpoint needs an API key; no NEAR or BSC Pyth feed for the listed stocks is fresh |
| S6 | 1Click: user entry from other chains into USDC on NEAR | ✅ from $20 | Usable for the "buy from any chain" flow |
| S6 | 1Click: USDC on NEAR → USDT on BSC (treasury leg) | ⚠️ minimum $1,000 | Too large for the demo; not usable from a contract anyway |
| S8 | NEAR MPC verifies a BSC transaction log | ✅ | A contract can prove USDT arrived at, or stock reached, the treasury, with no trusted relayer |
| S9 | Chainlink equity feeds | ✅ live on Arbitrum mainnet for 7 of 8 (no SPCX) · ❌ none on any testnet | Trustless price on NEAR via S8, ⏳ needs a mainnet MPC test |
| S10 | bStock pool price vs oracle price (weekend) | ⚠️ up to 4.4% apart | 1% slippage against the oracle makes buys of MSFT, GOOGL, META revert |

## S1 · MPC ECDSA → BSC ✅

Test meme `chainsig-e2e.solidon.testnet`. `init_treasury` stored `0xe15043b65217a97b43b81307e3fea2d51ec2d7e2`, the same address as an off-chain derivation from `derived_public_key`. `approve_router` was signed by `v1.signer-prod.testnet` ([NEAR tx](https://testnet.nearblocks.io/txns/5M9QxkrbZjSDVhWaKuc3AGpjNjEmyGANJLPT3Djdg4H3)), and the relayer broadcast it ([BSC tx](https://testnet.bscscan.com/tx/0xf76fd30e239dc4c87cb4c1aa929458cd80dd39050b4160c6e692c03101bd9475), status 1, `from` = treasury). Signed transactions match `cast mktx` byte for byte (unit test). A live swap waits for the BSC USDT ledger to be credited (S8 design).

## S2 · MPC domains ✅

`state` on `v1.signer-prod.testnet` and `v1.signer`: domain 0 ECDSA Sign, 1 EdDSA (Frost) Sign, 2 CKD, **3 ECDSA ForeignTx**. Calling `verify_foreign_transaction` with domain 0 panics: "Domain 0 has purpose Sign, but this method requires ForeignTx."

## S3 · bStock liquidity (BSC mainnet, QuoterV2) ✅ / ⚠️

`python3 backend/spike/s3_quotes.py`. Cost = fee + price impact against the pool's mid price.

| Stock | Mid $ | 100 | 500 | 1,000 | 5,000 | 20,000 |
| --- | --- | --- | --- | --- | --- | --- |
| NVDA | 178.86 | 0.25% | 0.26% | 0.27% | 0.34% | 0.60% |
| AAPL | 344.06 | 0.25% | 0.26% | 0.26% | 0.32% | 0.55% |
| MSFT | 537.51 | 0.26% | 0.29% | 0.33% | 0.67% | 2.04% |
| GOOGL | 288.40 | 0.25% | 0.26% | 0.27% | 0.33% | 0.57% |
| AMZN | 261.39 | 0.26% | 0.28% | 0.31% | 0.54% | 1.63% |
| META | 617.63 | 0.27% | 0.34% | 0.43% | 1.16% | 3.81% |
| TSLA | 361.13 | 0.25% | 0.25% | 0.26% | 0.28% | 0.38% |
| SPCX | 136.92 | 0.25% | 0.25% | 0.26% | 0.28% | 0.37% |

Mainnet pools are concentrated liquidity and far deeper than their USDT balance suggests. The testnet mock pools are full range, so impact there is much higher (1.25% for 1,000 USDT).

## S4 · Fresh EOA buys, holds, sells a bStock ✅

Anvil fork of BSC mainnet (`bsc-dataseed1.defibit.io`; `bsc-rpc.publicnode.com` refuses forks without an archive token). A brand-new EOA (nonce 0) received 2,000 USDT, approved the SwapRouter, and:

| | Buy 1,000 USDT | Sell all back |
| --- | --- | --- |
| NVDAB | status 1, 184,590 gas, 5.5752 NVDAB | status 1, 164,653 gas, back to 1,995.01 USDT |
| SPCXB | status 1, 210,313 gas, 7.2850 SPCXB | status 1, 189,947 gas, back to 1,990.01 USDT |

No allowlist blocked the new address (matches the source read in [STOCKS.md](STOCKS.md)).

## S5 · Pyth ❌

`python3 backend/spike/s5_prices.py`.

- Hermes `hermes.pyth.network`, `hermes-beta.pyth.network` and the new `pyth.dourolabs.app/hermes`: `/v2/price_feeds` is public; **every price update endpoint returns 401** (`/v2/updates/price/latest`, `/v2/updates/price/<time>`, legacy `/api/latest_price_feeds`, `/api/latest_vaas`). Pyth's docs: an API key is required for everyone since 26 Aug 2026, signup at app.pyth.com with a free trial and paid plans.
- `pyth-oracle.near`, `price-oracle.near`, `pyth-oracle.testnet`: **none of the 8 listed feeds exist**. `pyth-oracle.near` BTC/USD was last published 75 days ago. `price-oracle.testnet` has no Pyth methods.
- Pyth on BSC (`0x4D7E…1594`, v1.4.6): NVDA last updated about 80 days ago, SPCX feed absent. Nobody pushes these feeds any more.

## S6 · NEAR Intents / 1Click

`python3 backend/spike/s6_intents.py`, `python3 backend/spike/s6b_limits.py wrap.near`.

- `GET /v0/tokens`: 216 tokens. USDC on NEAR `nep141:17208628…133a1`. USDT on BSC exists through the HOT bridge: `nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g`.
- **User entry into USDC on NEAR** (dry quotes, no API key): ✅ from $20. SOL about 20 s, USDC on Base about 35 s, BTC about 805 s (13 min). Fee about 0.2% (no JWT).
- **Undocumented:** a recipient NEAR account that does not exist makes every quote fail with a generic `400 Internal server error`.
- **USDC on NEAR → USDT on BSC:** `400 Temporary swap limits: minimum swap amount is $1,000` at $999; works at $1,500 (about 23 s).
- `intents.near` views respond: `mt_balance_of`, `public_keys_of`, `fee` (= 1), `current_salt`, `is_nonce_used`.

## S8 · MPC verifies BSC transactions ✅

`verify_foreign_transaction` on `v1.signer-prod.testnet` with `{"request": {"Bnb": {"tx_id", "extractors": ["BlockHash", {"Log": {"log_index": 2}}], "finality": "Finalized"}}, "domain_id": 3, "payload_version": 1}` for the BSC testnet approve above:

- **Answer in 10 s**, with `payload_hash` and an ECDSA signature ([NEAR tx](https://testnet.nearblocks.io/txns/21gsvjBnhG3624AS6NDSNG6nXnugPS62MwsFTyAsZSQc)).
- **Payload hash reproduced from our own BSC RPC data**: `sha256(borsh(V1 { request, values }))`, log `data` as a `0x`-prefixed string (`python3 backend/spike/s8_foreign_tx_hash.py …` → MATCH).
- **Signer:** the domain 3 root key (`python3 backend/spike/s8_recover.py …`), not a per-caller derived key.
- **A forged claim is refused:** with `expected_payload_hash` off by one bit, no signature; the request timed out after 127 s ([NEAR tx](https://testnet.nearblocks.io/txns/Hz5XWgRMDXnnNb8gouJVjNBWjdEAD7Ch65crg4qr1Ljf)).
- `get_available_foreign_chains`: Solana, Base, **Bnb**, **Arbitrum**, Abstract, Starknet, Polygon, HyperEvm, Aptos, Sui, Avalanche, Fogo on both networks (mainnet also lists Bitcoin in some node configs). The testnet MPC reads testnets: an Arbitrum **mainnet** transaction timed out on the testnet MPC.

## S9 · Chainlink equity feeds

`python3 backend/spike/s9_chainlink.py` plus on-chain `latestRoundData()`.

- **Arbitrum mainnet, live push feeds:** NVDA 187.10, AAPL 342.37, MSFT 530.88, GOOGL 284.92, AMZN 259.44, META 610.20, TSLA 358.44, updated 9–14.5 h before the check (a Sunday). **No SPCX.**
- No on-chain equity feed on Base, Avalanche, BSC testnet, Arbitrum Sepolia, Base Sepolia, or Fuji.
- NVDA aggregator `0xfB7849E5057fdBA039Ed802A1B82AA57CB695a90` emits `AnswerUpdated`; latest update [`0x629a…8711`](https://arbiscan.io/tx/0x629a7e1630af4657463b9c812464cff9cd4c605d6a084cd4afa3da8d521a8711) log 2. ⏳ Verifying it through the **mainnet** MPC needs a mainnet NEAR account.

## S10 · bStock pool price vs oracle (Sunday) ⚠️

| Stock | Chainlink | Pool mid | Pool vs oracle |
| --- | --- | --- | --- |
| NVDA | 187.10 | 178.86 | −4.4% |
| AAPL | 342.37 | 344.06 | +0.5% |
| MSFT | 530.88 | 537.51 | +1.2% |
| GOOGL | 284.92 | 288.40 | +1.2% |
| AMZN | 259.44 | 261.39 | +0.8% |
| META | 610.20 | 617.63 | +1.2% |
| TSLA | 358.44 | 361.13 | +0.8% |

bStocks trade around the clock; the stock market and its oracles do not. With `minOut` = oracle − 1%, a buy reverts whenever the pool sits more than about 0.75% above the oracle (fee 0.25% included): MSFT, GOOGL, and META on this Sunday.

## Open, needs a mainnet NEAR account (about 1 NEAR)

1. Mainnet MPC verifies the Chainlink Arbitrum log above (decides the price source).
2. Mainnet MPC verifies a BSC mainnet ERC-20 `Transfer` log (same code path as testnet; confirms mainnet RPC providers).

# Part 2: which chain should hold the treasury (9 Nov 2026)

Question: on which chain can a NEAR-controlled treasury buy and hold the listed stocks, with NEAR Intents (1Click) moving the cash, a fresh price, and MPC verification? Same rule: live calls only.

## Comparison

| Chain | Stock tokens for the 8 tickers | Any address can hold | Cost to buy $1k / $5k | Fresh oracle, no key | 1Click from USDC on NEAR | MPC can verify txs |
| --- | --- | --- | --- | --- | --- | --- |
| **BSC** | bStocks (no SPCX on Pyth) | ✅ fork test | 0.27–0.43% / 0.28–1.16% | ❌ Pyth stale 80 days | ❌ **minimum $1,000** | ✅ |
| **Base** | **Coinbase tokenized stocks, all 8 incl. SPCXc** | ✅ live `eth_call` to a fresh address | **0.00–0.04% / 0.01–0.05%** | ⚠️ via Chainlink on Arbitrum (7/8, no SPCX) | ✅ from $0.50, ~22 s | ✅ |
| **Solana** | xStocks, all 8 incl. SPCXx | ✅ (Token-2022, no allowlist; issuer has permanent delegate) | 0.00–0.24% at $5k (Jupiter) | ❌ Pyth/Switchboard 600–2,300 h stale, no Chainlink equities | ✅ USDC from $20, ~17 s; stock tokens not routable | ✅ |
| **Arbitrum** | Robinhood (7, no SPCX) and xStocks | not tested | ❌ no stable pool ≥ $5k | ✅ Chainlink 7/8 | ✅ from $20, ~19 s | ✅ |
| **Robinhood Chain** (`hood`, 4663) | **Robinhood Stock Tokens, all 8 incl. SPCX** (see S15) | ✅ live `eth_call` to a fresh address | pools $0.2–1.0M (v3 vs WETH/USDG; AMZN, META, MSFT only via v4 vs SPY) | ✅ **Chainlink on the same chain, 24/7 feeds, minutes old (S16)** | ✅ ETH from $0.50, ~21 s | ❌ not in MPC list |
| **Mantle** | xStocks incl. SPCXx (wrapped pools only) | ✅ fork test | ❌ 2.2% / 9.3% | ❌ Pyth 3 years stale; RedStone, API3 empty | ❌ chain not supported | ❌ |

## S11 · 1Click routes (`backend/spike/s11_oneclick_routes.py`)

- No tokenized stock is routable through 1Click on any chain (a quote to NVDAx returns `tokenOut is not valid`). Intents can deliver stablecoins; the treasury buys the stock locally.
- USDC on NEAR → stablecoin: **BSC is the only chain with a $1,000 minimum.** Solana, Base, Arbitrum, Ethereum, Polygon, Avalanche, Optimism and Robinhood Chain all quote; $20 was only the smallest size first tried. S17 shows $0.50 works to Base and Robinhood Chain.

## S12 · Base, Coinbase tokenized stocks (`backend/spike/s12_base_stocks.py`)

- Tokens (8 decimals): NVDAc `0xb20000000000000000000078ee7ce2fe4908108c`, AAPLc `0xb200000000000000000000c2e324d24d7eecd1fb`, MSFTc `0xb200000000000000000000ab99cfa739e253872b`, GOOGLc `0xb2000000000000000000002d0ba3164cc74f58b7`, AMZNc `0xb200000000000000000000d9192b6b456483c2e8`, METAc `0xb2000000000000000000008bc8786b856e61707c`, TSLAc `0xb2000000000000000000001e800a7f5189430cd0`, SPCXc `0xb2000000000000000000007b9fcbd005511acbd5`. Name, symbol, decimals read on-chain.
- **The code at these addresses is the single byte `0xef`**: they are not ordinary EVM contracts, so an anvil fork cannot simulate them. Holding was tested on the real node instead: `eth_call transfer(fresh, amount)` from a holder and from the Aerodrome pool to a brand-new address returns `true` for NVDAc and SPCXc. In 100 minutes, 29 distinct addresses (EOAs, EIP-7702 EOAs, routers) received NVDAc from the Aerodrome pool.
- Liquidity (DexScreener): Aerodrome pools GOOGLc $1.70M, NVDAc $1.11M, METAc $0.93M, SPCXc $0.93M, MSFTc $0.55M, AAPLc $0.52M (daily volume $5–14M each); AMZNc and TSLAc about $33k on Uniswap v4.
- KyberSwap aggregator quotes: buying $5,000 costs 0.01–0.05% more than buying $100, for all 8.
- Pool vs Chainlink (Arbitrum): NVDA −2.8%, AAPL +0.6%, MSFT +1.1%, GOOGL +1.0%, AMZN +1.6%, META +1.4%, TSLA +0.6%.

## S13 · Solana xStocks

All 8 xStocks mints match the issuer API (`api.backed.fi`), Jupiter, and the on-chain metadata (list in `backend/spike/solana-mints.json`). Token-2022, `defaultAccountState=initialized`, no transfer hook program set, recent holders include System-owned wallets. Jupiter buy $5k: 0.00–0.24% impact. Ondo's Solana tokens are illiquid (24–95% impact at $1k). No fresh equity oracle on Solana without a key. Signing Solana transactions with the MPC EdDSA domain is not tested yet.

## S14 · Mantle

xStocks (incl. SPCXx) exist and a fork transfer to a fresh EOA succeeds, but the only liquid pools are the wrapped versions (~$100k): 2.2% at $1k, 9.3% at $5k. Pyth equity feeds on Mantle are about 3 years stale; RedStone and API3 have no equity feeds. Not a 1Click chain, not MPC-verifiable.

## Still open

1. Mainnet MPC verification of a Chainlink update on Arbitrum (price source).
2. SPCX price: no Chainlink feed anywhere checked.
3. A contract-driven Intents swap (USDC on NEAR → USDC on Base to the treasury) without trusting whoever supplies the 1Click deposit address. Candidate: the meme registers an MPC-derived ed25519 key on `intents.near` and MPC-signs its own NEP-413 intents. Mainnet only.

## Correction (9 Nov 2026)

An earlier version of the comparison said Robinhood Chain had "no stock tokens found yet". That was wrong: the check had not run (the agent stopped on a network error) and the line was written without evidence. S15 and S16 replace it.

## S15 · Robinhood Chain stock tokens (`backend/spike/s15_robinhood_tokens.py`)

Chain id 4663 (via `robinhood.drpc.org`; `rpc.mainnet.chain.robinhood.com`, `docs.robinhood.com` and the Blockscout API are unreachable or 403 from the test network). Addresses come from a third-party directory of 96 stock tokens and are verified on-chain:

| Ticker | Token | On-chain name | Supply |
| --- | --- | --- | --- |
| NVDA | `0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec` | NVIDIA • Robinhood Token | 97,354.61 |
| AAPL | `0xaf3d76f1834a1d425780943c99ea8a608f8a93f9` | Apple • Robinhood Token | 10,845.98 |
| MSFT | `0xe93237c50d904957cf27e7b1133b510c669c2e74` | Microsoft • Robinhood Token | 3,461.87 |
| GOOGL | `0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3` | Alphabet Class A • Robinhood Token | 27,847.91 |
| AMZN | `0x12f190a9f9d7d37a250758b26824b97ce941bf54` | Amazon • Robinhood Token | 9,710.83 |
| META | `0xc0d6457c16cc70d6790dd43521c899c87ce02f35` | Meta Platforms • Robinhood Token | 11,474.36 |
| TSLA | `0x322f0929c4625ed5bad873c95208d54e1c003b2d` | Tesla • Robinhood Token | 13,981.95 |
| SPCX | `0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea` | Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token | 96,588.32 |

All 18 decimals. Same issuer: every token checked is the same 283-byte beacon proxy (code hash `0x6c1fdd40002d…`) pointing at beacon `0xe10b6f6b275de231345c20d14ab812db62151b00`. `eth_call transfer(fresh, 1e18)` from the NVDA, SPCX, and TSLA pools to a brand-new address returns `true`.

Pools (DexScreener, Uniswap): NVDA/WETH v3 $1.04M (24 h volume $7.3M), TSLA/WETH v3 $0.77M, SPCX/WETH v3 $0.70M ($3.0M volume), GOOGL/USDG v3 $0.58M, AAPL/WETH v3 $0.22M; META, AMZN, MSFT trade only against SPY (another stock token) on Uniswap v4 ($0.26–0.57M), which needs a two-hop v4 route.

## S17 · Minimum cost of one full cycle (`backend/spike/s17_costs.py`)

Live gas price and token prices; 1Click dry quotes; NEAR costs measured from our testnet transactions (one MPC signature with `ecrecover` and storage burns 0.0013 NEAR ≈ $0.005; `init_treasury` 0.001 NEAR; a pool trade 0.0007 NEAR). Gas units: approve 46,464 (measured) + swap 210,313 (largest measured buy).

| Chain | Gas price | Approve + swap on chain | 1Click NEAR → chain at $1 / $10 | Chain → NEAR at $1 / $10 |
| --- | --- | --- | --- | --- |
| BSC | 0.05 gwei | $0.009 | ❌ minimum $1,000 | ❌ minimum $1,000 |
| **Base** | 0.006 gwei | **$0.003** | **$0.003 / $0.004** (22 s) | $0.000 / $0.002 (35 s) |
| Arbitrum | 0.02 gwei | $0.011 | $0.005 / $0.006 (19 s) | $0.000 / $0.002 (25 s) |
| Robinhood Chain | 0.02 gwei | $0.011 | $0.023 / $0.028 to ETH (21 s) | $0.005 / $0.037 (25 s) |
| Solana | 5,000 lamports | ~$0.002 (estimate) | $0.010 / $0.011 (17 s) | $0.000 / $0.002 (20 s) |

Plus the DEX fee of the stock swap (S3/S12: ~0.01–0.3%) and ~$0.01 of NEAR gas for the signatures. A full cycle (cash to the treasury chain, buy stock, prove it) costs **about $0.02–0.05 on Base, Arbitrum, Robinhood Chain or Solana**, independent of size above $0.50. BSC cannot run a cycle below $1,000.

## S16 · Chainlink feeds on Robinhood Chain (`backend/spike/s16_hood_chainlink.py 4`)

Found purely on-chain: 52 aggregators emitted `AnswerUpdated` in the last 4 hours (Sunday), read with `description()` and `latestRoundData()`:

| Feed | Aggregator | Answer | Updated | Pool price (S15) | Gap |
| --- | --- | --- | --- | --- | --- |
| Robinhood NVDA (24/7) | `0x1c28973bd1bab2e34efa5bff5e94a95c6cab72cc` | 175.93 | 8 min ago | 175.79 | 0.1% |
| Robinhood TSLA (24/7) | `0x06701b4170749ba17ba20934b2335cf3376e2c01` | 359.52 | 4 min ago | 360.48 | 0.3% |
| Robinhood SPCX / USD | `0x5eaa223c585f40cdca2d119ea91b97c491245631` | 137.22 | 54 min ago | 136.86 | 0.3% |
| Robinhood GOOGL (24/7) | `0x22d3ac0c234d5c00e239671d0bb14a1084b73c32` | 291.85 | 45 min ago | 291.70 | 0.1% |
| Robinhood META / USD | `0xc190b6164b9e320a6400cdab0085a2e0e2b9738e` | 629.25 | 20 min ago | 626.54 | 0.4% |
| Robinhood AMZN / USD | `0x93503dfc97157cdb8aadccaf70452621d598fdeb` | 267.64 | 97 min ago | 266.76 | 0.3% |
| RHMSFT / USD | `0xc3b117f52cf17dd4369eaf5eaf7cf0e2f91b4e30` | 543.52 | 82 min ago | 540.68 | 0.5% |
| RHSPY / USD | `0x78bcb218fa04b9b3a278ebc865ed320bf8defbac` | 742.33 | 170 min ago | — | — |

AAPL did not update in the window. Unlike every other chain checked, these feeds run around the clock like the tokens they price, so the pool-to-oracle gap stays under 0.5% on a weekend (Base vs Arbitrum Chainlink: up to 2.8%). The addresses above are aggregators; the proxies were not resolved because the explorer API is unreachable from the test network.

**Limit:** Robinhood Chain is not in the NEAR MPC's `verify_foreign_transaction` list, so a NEAR contract cannot read these prices or prove a Robinhood Chain swap without trusting a relayer.
