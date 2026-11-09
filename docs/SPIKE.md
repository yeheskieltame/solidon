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
