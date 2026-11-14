# Solidon

![Solidon: memes with a balance sheet](docs/assets/banner.jpg)

**Memes with a balance sheet.** Solidon is a memecoin launchpad on NEAR where every meme is a small treasury company. Trading fees buy a tokenized stock (NVIDIA, Apple, Tesla and five more) on Base, Robinhood Chain and Solana at the same time. The NEAR contract signs every treasury transaction itself through Chain Signatures, and its capital rules (issue above 2× NAV, buy back below 1×, open redemptions below 0.9×) are locked in code with no admin key.

Built for NEAR HACKATHON 2026 · Tracks: `defi`, `memecoins`, `open` · Author: [@yeheskieltame](https://github.com/yeheskieltame)

| Live | Link |
| --- | --- |
| Landing | [solidon.xyz](https://solidon.xyz) |
| App | [app.solidon.xyz](https://app.solidon.xyz) |
| Documentation | [docs.solidon.xyz](https://docs.solidon.xyz) |
| Read API | [api.solidon.xyz/health](https://api.solidon.xyz/health) |
| Demo video (2:16) | [Post on X](https://x.com/solidonxyz/status/2121455441050051059) · [on the docs site](https://docs.solidon.xyz/docs) |
| X account | [@solidonxyz](https://x.com/solidonxyz) |
| Factory on NEAR testnet | [`solidon.testnet` on NearBlocks](https://testnet.nearblocks.io/address/solidon.testnet) |

> Everything runs on testnets. The stock tokens are synthetic, priced from the official Chainlink feeds on Robinhood Chain mainnet, and the test USDC has no value.

## Why

Memecoins have attention but nothing underneath: when the hype fades, holders are left with a token backed by nothing. Treasury companies such as MicroStrategy do the opposite: they hold an asset and grow the amount held per share by issuing shares at a premium. Solidon gives every meme that second engine. Hype becomes stock per token, and a NAV floor that anyone can verify on-chain.

**mNAV** = meme market cap ÷ treasury value. The contract acts on it every hour from a 30-minute TWAP and a fresh oracle price:

| mNAV | Action, enforced by the contract |
| --- | --- |
| above 2.0× | Issue new tokens (at most 1% of supply per day) and buy more stock: accretive for every holder |
| 1.0× – 2.0× | Hold |
| below 1.0× | Buy back with cash above the 20% buffer (never sells stock to do it) |
| below 0.9× | Open redemptions: burn tokens for NAV per token in USDC |

## How it works

```mermaid
flowchart LR
  U[Trader] -- USDC --> M[Meme contract on NEAR<br/>NEP-141 + AMM + mNAV engine]
  M -- fees --> T[(Treasury cash)]
  M -- "fund_chain(chain)" --> B[Bridge<br/>testnet: keeper · mainnet: Intents/1Click]
  B -- USDC --> E1[Base treasury]
  B -- USDC --> E2[Robinhood Chain treasury]
  B -- USDC --> S1[Solana treasury]
  M -- "sign approve / swap<br/>(Chain Signatures MPC)" --> MPC[v1.signer-prod.testnet]
  MPC -- signed tx --> K[Anyone broadcasts]
  K --> E1 & E2 & S1
  E1 -- Uniswap v3 --> NVDA1[NVDA]
  E2 -- Uniswap v3 --> NVDA2[NVDA]
  S1 -- Raydium CLMM --> NVDA3[NVDA]
```

- **One NEAR contract owns three treasuries.** Each meme derives an EVM address (ECDSA, used on Base and Robinhood Chain) and a Solana address (EdDSA) from the NEAR MPC network. The contract builds every transaction itself from locked config: an approval to one router, and a swap into its stock. It checks each signature (`ecrecover`, `ed25519_verify`) before storing it. Anyone can broadcast.
- **Cash moves with proof where proof exists.** Base arrivals are credited only after the MPC verifies the USDC `Transfer` log (foreign-chain verification). Robinhood Chain and Solana arrivals are reported by the relayer. Every credit is capped by the cash in transit and booked once.
- **The ledger books the minimum.** Each swap books the `minAmountOut` it signed for, so a swap that lands leaves the chain a little above the ledger. A swap that reverts on-chain (for example when the pool has drifted more than 1% from the oracle) stays booked while its USDC sits unspent in the treasury. The app flags that chain "Less on-chain", as it does today for HONEY on Base and Robinhood Chain from two swaps that reverted before the automatic re-peg ran ([Base example](https://sepolia.basescan.org/tx/0x9609b7e27e2f741c4286a6c6a1a6dd04867a4d7f6c1b60c092aea942ef7e27fb)).

## For judges: verify the claims in five minutes

Every claim below links to live on-chain state or a transaction, and to the code that does it. All explorers are public; no wallet is needed.

| # | Claim | Verify | Code |
| --- | --- | --- | --- |
| 1 | One NEAR contract owns treasuries on three chains | `honey.solidon.testnet` → `get_treasury_chains`: EVM treasury [`0x51b1…802a` on Base](https://sepolia.basescan.org/address/0x51b1197be727ce2fb229c4919eca30e5568c802a) and [on Robinhood Chain](https://explorer.testnet.chain.robinhood.com/address/0x51b1197be727ce2fb229c4919eca30e5568c802a), Solana treasury [`9gyo…tAsLP`](https://explorer.solana.com/address/9gyosY8RFLdET2AGVj5XU14tpRGLFrun2VrpfZ1tAsLP?cluster=devnet) | `contracts/meme/src/treasury.rs` (`init_treasury`), `contracts/meme/src/solana_treasury.rs` (`init_solana_treasury`) |
| 2 | The contract builds and signs every swap itself through Chain Signatures, and checks the signature before storing it | Solana swap into NVDA signed for HONEY: [`3ZfTyZCA…`](https://explorer.solana.com/tx/3ZfTyZCAHrGcvd4yUupeWrGG2YC4Lm6e3SakxTtsKn4SGis9FX4bbJEk2Ky8wu696mi1AfcXpL6wwq8QGMJ4roGn?cluster=devnet); Base swap signed for the end-to-end meme: [`0x7787…b8ab`](https://sepolia.basescan.org/tx/0x77870bf3db1c60b097e23e259f7d502ccd4fb30ce4ea46775af8085319bab8ab) (NEAR side [`GEQh2tUm…`](https://testnet.nearblocks.io/txns/GEQh2tUmUWxAn1z81j9sm4BXZcAVxEgGk64BvmNqMnX3)) | `buy_stock` in `contracts/meme/src/treasury.rs` (`env::ecrecover` check), `buy_stock_solana` in `contracts/meme/src/solana_treasury.rs` (`env::ed25519_verify` check) |
| 3 | USDC arriving on Base is credited only after the MPC verifies the `Transfer` log (foreign-chain verification) | `credit_cash` [`6KTHwQQa…`](https://testnet.nearblocks.io/txns/6KTHwQQaXs5HDHWpSydzju3fZtkugfVk5QWxzLGetgZq) for Base transfer [`0x462c…ded0`](https://sepolia.basescan.org/tx/0x462c7fad80615b3bafd3036e2f4c58ac5d1480c65a7f72a6c02cea005c61ded0) | `credit_cash` in `contracts/meme/src/cash.rs` |
| 4 | mNAV rules run in the contract | `rebalance` above 2.0× issued 1% of supply and added 7.36 USDC cash: [`7eMpY8QM…`](https://testnet.nearblocks.io/txns/7eMpY8QMwLDkQjWTmCdxNUtJrsPFvRh93Nc21ybYmu7J) | `rebalance`, `redeem` in `contracts/meme/src/mnav.rs`; TWAP in `twap.rs` |
| 5 | Anyone launches a meme in three transactions | $FLOOR: `create_meme` [`FYksRfSV…`](https://testnet.nearblocks.io/txns/FYksRfSVMa3NogLoxszJU3QMNiRgpDe366ZYTZYJ6oN6), seed [`8omCZa5M…`](https://testnet.nearblocks.io/txns/8omCZa5MGSYmBJS77bwhNjmv8CsvCGyUBqeHbtdg7bg1), `init_treasury` [`9PZPgpfY…`](https://testnet.nearblocks.io/txns/9PZPgpfYhfBQ7kS3NSyuDUZbKqjzNWN9YVbtqMKugT9c) | `create_meme` in `contracts/factory/src/lib.rs`; UI `frontend/src/components/launch-flow.tsx` |
| 6 | A buy is one signature: USDC in, meme out, fees to the treasury | 50 USDC buy of HONEY from the demo video: [`Gye2gqxX…`](https://testnet.nearblocks.io/txns/Gye2gqxXE4MS4TcL7MiziK67AN5u47SynyCYnUqrmfCq) | `ft_on_transfer` in `contracts/meme/src/pool.rs`; UI `frontend/src/components/trade-panel.tsx` |
| 7 | Pay from any chain with NEAR Intents 1Click | App → HONEY → **Pay from another chain**: live 1Click dry quote (for example 2 SOL → USDC on NEAR) | `frontend/src/components/pay-from-chain.tsx`, `frontend/src/app/api/oneclick/` |
| 8 | Ledger vs chain is checked in public | App → HONEY → Details → **Treasury per chain** reads every balance live from Base, Robinhood Chain and Solana | `frontend/src/components/treasury-chains.tsx` |
| 9 | Live indexer and read API | [`/health`](https://api.solidon.xyz/health), [`/v1/memes`](https://api.solidon.xyz/v1/memes), [`/v1/memes/honey.solidon.testnet/holders`](https://api.solidon.xyz/v1/memes/honey.solidon.testnet/holders) | `backend/keeper/src/api.js`, `backend/keeper/indexer.js` |

### Verify from a terminal (no browser, no API key)

NearBlocks, Basescan and the Solana Explorer show a bot check to automated clients. The public RPCs do not, so every key fact can be checked with `curl`:

```bash
# 1. HONEY's treasury addresses, read from the meme contract on NEAR testnet
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"honey.solidon.testnet","method_name":"get_treasury_chains","args_base64":"e30="}}' \
  | python3 -c "import json,sys; r=json.loads(bytes(json.load(sys.stdin)['result']['result'])); print(r['address'], r['solana']['address'])"
# -> 0x51b1197be727ce2fb229c4919eca30e5568c802a 9gyosY8RFLdET2AGVj5XU14tpRGLFrun2VrpfZ1tAsLP

# 2. The Solana swap into NVDA: succeeded, and its fee payer and signer is HONEY's treasury (an MPC key of the NEAR contract)
curl -s https://api.devnet.solana.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":["3ZfTyZCAHrGcvd4yUupeWrGG2YC4Lm6e3SakxTtsKn4SGis9FX4bbJEk2Ky8wu696mi1AfcXpL6wwq8QGMJ4roGn",{"encoding":"json","maxSupportedTransactionVersion":0}]}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print('err:', r['meta']['err'], 'signer:', r['transaction']['message']['accountKeys'][0])"
# -> err: None signer: 9gyosY8RFLdET2AGVj5XU14tpRGLFrun2VrpfZ1tAsLP

# 3. The Base Sepolia swap signed for the end-to-end meme: status 1, sent from its MPC-derived treasury
curl -s https://sepolia.base.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x77870bf3db1c60b097e23e259f7d502ccd4fb30ce4ea46775af8085319bab8ab"]}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r['status'], r['from'])"
# -> 0x1 0x582be22a62a466284817298848be90bf8a6f37e4

# 4. The Robinhood Chain testnet swap from the same treasury
curl -s https://rpc.testnet.chain.robinhood.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0x954e48bc42473ab47af750d15066ee57baff9e8d23de1fefff0d37deba1fe8c4"]}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r['status'], r['from'])"
# -> 0x1 0x582be22a62a466284817298848be90bf8a6f37e4

# 5. The $FLOOR launch on NEAR: create_meme succeeded
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tx","params":{"tx_hash":"FYksRfSVMa3NogLoxszJU3QMNiRgpDe366ZYTZYJ6oN6","sender_account_id":"19d6c2e1a2be41e817c82fb2726b6453e1505f4d422dffbff85990c2f38e3a27","wait_until":"FINAL"}}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(list(r['status']), r['transaction']['actions'][0]['FunctionCall']['method_name'])"
# -> ['SuccessValue'] create_meme

# 6. The live read API
curl -s https://api.solidon.xyz/health
```

Any NEAR transaction hash in this README also opens without a bot check on NEAR Rocks: `https://testnet.near.rocks/tx/<hash>`.

## Try it (do X, see Y)

### 1. Read the live state, no setup

| Do | See |
| --- | --- |
| Open [`solidon.testnet` on NearBlocks](https://testnet.nearblocks.io/address/solidon.testnet) | The factory: 8 stocks, 3 chains, the memes it launched |
| Run `near contract call-function as-read-only honey.solidon.testnet get_treasury_chains json-args '{}' network-config testnet now` | HONEY's treasury per chain: address, nonce, USDC, NVDA booked, cash in transit |
| Open HONEY's [Solana treasury](https://explorer.solana.com/address/9gyosY8RFLdET2AGVj5XU14tpRGLFrun2VrpfZ1tAsLP?cluster=devnet) and [EVM treasury on Robinhood Chain testnet](https://explorer.testnet.chain.robinhood.com/address/0x51b1197be727ce2fb229c4919eca30e5568c802a) | NVDA bought by swaps the NEAR contract signed (example Solana buy: [`3ZfTyZ…`](https://explorer.solana.com/tx/3ZfTyZCAHrGcvd4yUupeWrGG2YC4Lm6e3SakxTtsKn4SGis9FX4bbJEk2Ky8wu696mi1AfcXpL6wwq8QGMJ4roGn?cluster=devnet)) |
| Read [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md), "End to end" | One meme holding NVDA on all three chains: every MPC signature, bridge transfer, cash proof and swap, with links |

### 2. Use the app (hosted at [app.solidon.xyz](https://app.solidon.xyz), or run it locally)

```bash
cd frontend && npm install && npm run build && npm run start   # landing http://localhost:3000 · app http://app.localhost:3000
cd backend/keeper && npm install && node indexer.js              # optional locally: charts, activity, holders (no key, never signs)
```

| Do | See |
| --- | --- |
| Open the app → **Try a demo wallet** | A new NEAR testnet account in your browser with NEAR for gas and 1,000 test USDC: no extension, no popups |
| Or connect your own wallet → **Get test funds** | Test NEAR and 1,000 USDC arrive without you paying gas (server-side faucet) |
| Open **HONEY** → Buy 10 USDC | Your tokens, the fee split, and the treasury value rising |
| Details → **Holders** | Every holder read from `ft_balance_of`, your wallet tagged "You" |
| Details → **Treasury per chain** | Ledger vs on-chain balance on Base, Robinhood Chain and Solana |
| Buy → **Pay from another chain** | Live NEAR Intents 1Click quotes from SOL, ETH on Base, BTC or USDC on Arbitrum |
| **Launch** | Create your own meme: pick a stock, seed the pool, open the treasury |

### 3. Run the tests

| Do | See |
| --- | --- |
| `cd contracts && cargo test` | Unit tests plus NEAR sandbox integration tests (factory → meme → pool → mNAV → signing) |
| `cd backend/keeper && npm test` | 68 keeper tests (treasury steps, bridge, Solana re-sign, holders), no network |
| `python3 simulation/sim.py` | The 60-day simulation below, regenerated from scratch |

## Deployed accounts and addresses

All on testnets. Full venue tables (24 stock tokens and pools) are in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) and [docs.solidon.xyz/docs/reference/deployments](https://docs.solidon.xyz/docs/reference/deployments).

### NEAR testnet

| Account | Role |
| --- | --- |
| [`solidon.testnet`](https://testnet.nearblocks.io/address/solidon.testnet) | Factory: launches memes; 3 treasury chains, 8 stocks; `launch_cost` 4.46 NEAR |
| [`usdc.solidon.testnet`](https://testnet.nearblocks.io/address/usdc.solidon.testnet) | Test USDC (NEP-141, 6 decimals, open mint) |
| [`pyth.solidon.testnet`](https://testnet.nearblocks.io/address/pyth.solidon.testnet) | Price oracle with the Pyth read interface; the keeper pushes Chainlink prices |
| [`keeper.solidon.testnet`](https://testnet.nearblocks.io/address/keeper.solidon.testnet) | Testnet bridge and relayer (see Trust assumptions) |
| [`v1.signer-prod.testnet`](https://testnet.nearblocks.io/address/v1.signer-prod.testnet) | NEAR MPC signer for Chain Signatures |
| [`solidon-faucet.testnet`](https://testnet.nearblocks.io/address/solidon-faucet.testnet) | Funds demo wallets: 0.5 NEAR and 1,000 test USDC |

### Memes and their treasuries

| Meme | Thesis | EVM treasury (Base Sepolia, Robinhood Chain testnet) | Solana devnet treasury | Launch |
| --- | --- | --- | --- | --- |
| [$HONEY](https://testnet.nearblocks.io/address/honey.solidon.testnet) Honeypot (featured) | NVDA | `0x51b1197be727ce2fb229c4919eca30e5568c802a` [Base](https://sepolia.basescan.org/address/0x51b1197be727ce2fb229c4919eca30e5568c802a) · [Robinhood](https://explorer.testnet.chain.robinhood.com/address/0x51b1197be727ce2fb229c4919eca30e5568c802a) | [`9gyosY8R…tAsLP`](https://explorer.solana.com/address/9gyosY8RFLdET2AGVj5XU14tpRGLFrun2VrpfZ1tAsLP?cluster=devnet) | [`39tFsQdK…`](https://testnet.nearblocks.io/txns/39tFsQdK9mAyDfHoDGhPLiJfyjStZkmyc5STN4Yk2v63) |
| [$SPYDIA](https://testnet.nearblocks.io/address/spydia.solidon.testnet) Spydia | NVDA | `0xc8c8407717e388ed21e5b2fd5a047c6743318c50` [Base](https://sepolia.basescan.org/address/0xc8c8407717e388ed21e5b2fd5a047c6743318c50) · [Robinhood](https://explorer.testnet.chain.robinhood.com/address/0xc8c8407717e388ed21e5b2fd5a047c6743318c50) | [`5DdM4FKE…d51Xmr`](https://explorer.solana.com/address/5DdM4FKEsvLwjr2t2GZGxpwg8D3RN9HQoCo4Lpd51Xmr?cluster=devnet) | [`HBUBuW54…`](https://testnet.nearblocks.io/txns/HBUBuW54haTS8VxAnWxLxrgDMfdS6N9haSF2ndbQURXu) |
| [$FLOOR](https://testnet.nearblocks.io/address/floor.solidon.testnet) The Floor Is Lava | TSLA | `0x68c1e3adc85bf1fcb60697dbef01db4521dbbb72` [Base](https://sepolia.basescan.org/address/0x68c1e3adc85bf1fcb60697dbef01db4521dbbb72) | not opened (the keeper skips FLOOR on purpose: its cash stays on NEAR to demonstrate buybacks and redemptions) | [`FYksRfSV…`](https://testnet.nearblocks.io/txns/FYksRfSVMa3NogLoxszJU3QMNiRgpDe366ZYTZYJ6oN6) |
| [`e2etest`](https://testnet.nearblocks.io/address/e2etest.solidon.testnet) Solidon E2E Test (hidden in the app) | NVDA | `0x582be22a62a466284817298848be90bf8a6f37e4` [Base](https://sepolia.basescan.org/address/0x582be22a62a466284817298848be90bf8a6f37e4) · [Robinhood](https://explorer.testnet.chain.robinhood.com/address/0x582be22a62a466284817298848be90bf8a6f37e4) | [`BnhYneFs…KERNV`](https://explorer.solana.com/address/BnhYneFsvh45UDJy7B7CVwvdAev1p1gNzGjWdf9KERNV?cluster=devnet) | [`3xMXCNqH…`](https://testnet.nearblocks.io/txns/3xMXCNqHddRwByJHD9wtsEBZm6URKZfz6dABriZ3b2gm) |

Venues: Uniswap v3 SwapRouter02 on Base Sepolia [`0x94cC…2bc4`](https://sepolia.basescan.org/address/0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4) and on Robinhood Chain testnet [`0x3ce9…58fe`](https://explorer.testnet.chain.robinhood.com/address/0x3ce954107b1a675826b33bf23060dd655e3758fe); Raydium CLMM on Solana devnet. NVDA tokens: Base [`0x8f13…2654`](https://sepolia.basescan.org/address/0x8f13563130684478E617C1797308A081Cb2c2654), Robinhood [`0x8228…f7f4`](https://explorer.testnet.chain.robinhood.com/address/0x82289af84B9a0faf598a4D2052E16c8D1619f7f4), Solana [`88Bs…SqbB`](https://explorer.solana.com/address/88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB?cluster=devnet).

## On-chain evidence

### End to end: one meme holds NVDA on all three chains

`e2etest.solidon.testnet` (thesis NVDA) ran the full loop on 10 Nov 2026. Every treasury step was signed by the NEAR MPC at the meme contract's request; the keeper only broadcast and bridged.

| Step | NEAR | Chain |
| --- | --- | --- |
| Open EVM and Solana treasuries | [`ACKb8X38…`](https://testnet.nearblocks.io/txns/ACKb8X38J1r2occJX6YCEtEN7B4q5i2mzxr5rFGJhyUj), [`8WkCbKH7…`](https://testnet.nearblocks.io/txns/8WkCbKH7skVrWu4NqUZB5kuDA9MghPLArZeq9V9dZqAv) | |
| Approve the router (MPC-signed) | [`GJwBEA4t…`](https://testnet.nearblocks.io/txns/GJwBEA4tHxXfWiDsyYkexHgDjRo3i8SmbXeQKh9kgtiL), [`3xxp3oeN…`](https://testnet.nearblocks.io/txns/3xxp3oeNTVwncAzNvfXsRq37zm8MvddWr3YDJRhSdvxF) | Base [`0x9767…5422`](https://sepolia.basescan.org/tx/0x9767640d0e827681166a18336bc7848b5ea8f4a4fbb3aa77f21ce61bae2f5422), Robinhood [`0xe896…0d0e`](https://explorer.testnet.chain.robinhood.com/tx/0xe896f9b33aa2d06b51c65cbaefc2a7ca012781ad54aabb62f36b9e96acf30d0e) |
| Set Solana token accounts (relayer bumps) | [`4GHb8Atk…`](https://testnet.nearblocks.io/txns/4GHb8AtkhenLGFCEUxWoC3U6pyVnrpo3zAT5zLW7Lict) | |
| **Base:** `fund_chain` 3.20 USDC → delivered → `credit_cash` **proven by MPC** | [`3uZr2wpV…`](https://testnet.nearblocks.io/txns/3uZr2wpVcW74KP8kqiE8VPpcoi3TtrA2c29KDXVCLvAH) → [`6KTHwQQa…`](https://testnet.nearblocks.io/txns/6KTHwQQaXs5HDHWpSydzju3fZtkugfVk5QWxzLGetgZq) | [`0x462c…ded0`](https://sepolia.basescan.org/tx/0x462c7fad80615b3bafd3036e2f4c58ac5d1480c65a7f72a6c02cea005c61ded0) |
| **Base:** `buy_stock` (MPC-signed swap) | [`GEQh2tUm…`](https://testnet.nearblocks.io/txns/GEQh2tUmUWxAn1z81j9sm4BXZcAVxEgGk64BvmNqMnX3) | [`0x7787…b8ab`](https://sepolia.basescan.org/tx/0x77870bf3db1c60b097e23e259f7d502ccd4fb30ce4ea46775af8085319bab8ab) |
| `rebalance`: mNAV far above 2.0× → issued 1% of circulating, +7.36 USDC cash | [`7eMpY8QM…`](https://testnet.nearblocks.io/txns/7eMpY8QMwLDkQjWTmCdxNUtJrsPFvRh93Nc21ybYmu7J) | |
| **Solana:** `fund_chain` 5 USDC → delivered → `report_cash` (relayer) | [`89Lvxf1P…`](https://testnet.nearblocks.io/txns/89Lvxf1PxzskydNssC5vxgaNn7u8YJaa87dTfLGMehDd) → [`GU1qQvri…`](https://testnet.nearblocks.io/txns/GU1qQvriGcc5DBUmYrxz32uAWzkZgNDe1d2R3jvsAXMn) | [`V4oUeGyE…`](https://explorer.solana.com/tx/V4oUeGyEdXpzoVToc1tMo8pzd8jeZo9BU4xD8RVrEX6Ji912MUePEuSy8i3VrA6xjhRqtgJXsp5cyGwGdsY8UBs?cluster=devnet) |
| **Solana:** `buy_stock_solana` (contract-built Raydium swap, MPC EdDSA); its blockhash expired unsent, so `resign_solana` signed the same buy again (ledger booked once) and it landed | [`GHKi22pg…`](https://testnet.nearblocks.io/txns/GHKi22pgb1Lcz4qxjwwLRDGdn6Doy96s6L3FoqVjKbDn), [`2VSpq8vD…`](https://testnet.nearblocks.io/txns/2VSpq8vDKy9c7KMwF1ALQGZuA7ujyKhNYpsk94tbc1xS) | [`65dxp65E…`](https://explorer.solana.com/tx/65dxp65EdGL1SoEqES9FXrvNwDWU6XacFAxgVEEXGnWp8oG15fPikkJwTbnxpcRNZtSA7CrYkGH2zvC8zDo5wukH?cluster=devnet) |
| **Base** again: 2.18 USDC funded, proven, bought | [`HHTUkfpS…`](https://testnet.nearblocks.io/txns/HHTUkfpSkbfvgASbkxeTrbTc2MAr2oGHL3xPmWdDQqKd), [`7MQW8aAg…`](https://testnet.nearblocks.io/txns/7MQW8aAgaeYjb3WcYyJENHR9FuBUymZub7rSEsAiJoZj), [`EBq9Qwn4…`](https://testnet.nearblocks.io/txns/EBq9Qwn4DG7V2MLTorbSECQJ6bd19YdNJ4x8U6RrQhDV) | [`0x76cc…e4e6`](https://sepolia.basescan.org/tx/0x76cc94e2177d2777b28ac738294e74eb13b31bff621431e5ff4fb6288575e4e6), [`0x777d…c073`](https://sepolia.basescan.org/tx/0x777d24ddbb9320c1fa5bb43edea5225bfd7ce3e0165cc2c6510e4f59745dc073) |
| **Robinhood:** `fund_chain` 1.92 USDC → delivered → `report_cash` (relayer) → `buy_stock` | [`5bGzpEJs…`](https://testnet.nearblocks.io/txns/5bGzpEJsBsY6Cf1eGccNkEeYu1aUSPEQCaSnSEwkYMeT), [`2QW3Egvw…`](https://testnet.nearblocks.io/txns/2QW3EgvwMm5n8jcdarvxBk7mV7vfvGXz6sruqbozVqMm), [`D3BE3LYc…`](https://testnet.nearblocks.io/txns/D3BE3LYcb9RkuruxJqJUfFMiY1m8a9q3hZfesVa7oXsy) | [`0xb46e…eb8f`](https://explorer.testnet.chain.robinhood.com/tx/0xb46ed8019665d8f5130b4fcbc821bd8f45a3e2ddfe60560aa1938b171e62eb8f), [`0x954e…e8c4`](https://explorer.testnet.chain.robinhood.com/tx/0x954e48bc42473ab47af750d15066ee57baff9e8d23de1fefff0d37deba1fe8c4) |

Holdings after the run (ledger = `minAmountOut` booked at signing; on-chain = the token balance read from each chain):

| Chain | Ledger NVDA | On-chain NVDA |
| --- | --- | --- |
| Base Sepolia | 0.02965417 | 0.03032966 |
| Robinhood testnet | 0.01060760 | 0.01082210 |
| Solana devnet | 0.02770371 | 0.02831835 |

### The transactions in the demo video

| Moment | Transaction |
| --- | --- |
| Demo wallet funded by the faucet: 0.5 NEAR here, then 1,000 test USDC in the next faucet transaction ([wallet history](https://testnet.nearblocks.io/address/19d6c2e1a2be41e817c82fb2726b6453e1505f4d422dffbff85990c2f38e3a27)) | [`4Ja6WA2f…`](https://testnet.nearblocks.io/txns/4Ja6WA2fbTSo4JH8ibVyva6Xojv6VD6BgkytshATLQks) |
| Buy 50 USDC of HONEY (one signature) | [`Gye2gqxX…`](https://testnet.nearblocks.io/txns/Gye2gqxXE4MS4TcL7MiziK67AN5u47SynyCYnUqrmfCq) |
| HONEY's Solana treasury buys NVDA, signed by the NEAR contract | [`3ZfTyZCAHrGcvd4yUupeWrGG2YC4Lm6e3SakxTtsKn4SGis9FX4bbJEk2Ky8wu696mi1AfcXpL6wwq8QGMJ4roGn`](https://explorer.solana.com/tx/3ZfTyZCAHrGcvd4yUupeWrGG2YC4Lm6e3SakxTtsKn4SGis9FX4bbJEk2Ky8wu696mi1AfcXpL6wwq8QGMJ4roGn?cluster=devnet) |
| Launch $FLOOR: `create_meme` (name, symbol, TSLA, icon) | [`FYksRfSVMa3NogLoxszJU3QMNiRgpDe366ZYTZYJ6oN6`](https://testnet.nearblocks.io/txns/FYksRfSVMa3NogLoxszJU3QMNiRgpDe366ZYTZYJ6oN6) |
| Seed the FLOOR pool with 100 USDC | [`8omCZa5MGSYmBJS77bwhNjmv8CsvCGyUBqeHbtdg7bg1`](https://testnet.nearblocks.io/txns/8omCZa5MGSYmBJS77bwhNjmv8CsvCGyUBqeHbtdg7bg1) |
| Open the FLOOR treasury (`init_treasury`) | [`9PZPgpfYhfBQ7kS3NSyuDUZbKqjzNWN9YVbtqMKugT9c`](https://testnet.nearblocks.io/txns/9PZPgpfYhfBQ7kS3NSyuDUZbKqjzNWN9YVbtqMKugT9c) |

### Launches

| Meme | `create_meme` | Seed | Buys |
| --- | --- | --- | --- |
| $HONEY | [`39tFsQdK…`](https://testnet.nearblocks.io/txns/39tFsQdK9mAyDfHoDGhPLiJfyjStZkmyc5STN4Yk2v63) | 1,000 USDC [`ESpLZ6i4…`](https://testnet.nearblocks.io/txns/ESpLZ6i4hzUQqJctzNhpqwn4cC2NiCbtSXbhmehw1gCR) | 400 / 150 / 250 USDC [`BifYJTF1…`](https://testnet.nearblocks.io/txns/BifYJTF14ueCuNx9dtYdYP1PJwXL1tsvyXK8xoaSPKcW) [`H3XmCrxb…`](https://testnet.nearblocks.io/txns/H3XmCrxbfxmXLLeohrUKKFTMKJx2dWwcSwqL8Ds7GFeE) [`EE4QubFp…`](https://testnet.nearblocks.io/txns/EE4QubFpfHo1pRqCB3114jfWhRWjESCfxKz5xNehbd8G) |
| $SPYDIA | [`HBUBuW54…`](https://testnet.nearblocks.io/txns/HBUBuW54haTS8VxAnWxLxrgDMfdS6N9haSF2ndbQURXu) | 1,000 USDC [`HCBnzsTt…`](https://testnet.nearblocks.io/txns/HCBnzsTtGsu9hnCnpBctpZA52R2rwFU3CMTpcRsnBoi8) | 400 / 150 / 250 USDC [`4RNCs63G…`](https://testnet.nearblocks.io/txns/4RNCs63GFb5Q33nmwM9FA2y9a78zdc577KRDZYs6Bdb3) [`H67hFStp…`](https://testnet.nearblocks.io/txns/H67hFStpeQhYeyMMAY2J2Qrazf6WUGWPLyYs4zSnNgPd) [`9qGqv8SZ…`](https://testnet.nearblocks.io/txns/9qGqv8SZmVHADnR9Rryjh83gZiGtborChBMA872o3uHr) |
| $FLOOR | [`FYksRfSV…`](https://testnet.nearblocks.io/txns/FYksRfSVMa3NogLoxszJU3QMNiRgpDe366ZYTZYJ6oN6) | 100 USDC [`8omCZa5M…`](https://testnet.nearblocks.io/txns/8omCZa5MGSYmBJS77bwhNjmv8CsvCGyUBqeHbtdg7bg1) | n/a |

### Deployment and first signatures

| Step | Transaction |
| --- | --- |
| Factory deployed with `contracts/deploy-testnet.sh` (3 chains, 8 stocks, MPC signer) | [`CYi1g5sa…`](https://testnet.nearblocks.io/txns/CYi1g5sauKmN9SGxX6hLrjtxqsTNU2iwvaZqsYpvzvZ5) |
| Keeper account created | [`6MjksnEj…`](https://testnet.nearblocks.io/txns/6MjksnEjnTxs8FVXKh6qNGUaYqiiBGFy9QAF7qzmKPEu) |
| First MPC-signed (EdDSA) Raydium swap on Solana devnet, integration spike | [`EwX4QEFx…`](https://explorer.solana.com/tx/EwX4QEFxQ1g3UiUQn5vbH5WnVWecK4xFMzJ3UTP5A4xK4k9tDVtvLyCEuKvVfF5hRBmoKVNoosXSJ9wr3JdU4a9?cluster=devnet) |

More, including every spike: [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) and [docs/SPIKE.md](docs/SPIKE.md).

## Where each feature lives

| Feature | Code |
| --- | --- |
| Factory: launch, locked config, stock list | `contracts/factory/src/lib.rs` |
| Meme token (NEP-141), AMM pool, buy via `ft_transfer_call`, `sell` | `contracts/meme/src/lib.rs`, `contracts/meme/src/pool.rs` |
| mNAV engine: TWAP, `rebalance`, issuance, buyback, `redeem` | `contracts/meme/src/mnav.rs`, `contracts/meme/src/twap.rs` |
| Cash ledger: `fund_chain`, `credit_cash` (MPC-proven), `report_cash` | `contracts/meme/src/cash.rs` |
| EVM treasury: derived address, approve and swap built and signed by the contract, `ecrecover` check | `contracts/meme/src/treasury.rs` |
| Solana treasury: EdDSA address, Raydium swap built by the contract, `ed25519_verify` check, `resign_solana` | `contracts/meme/src/solana_treasury.rs`, `contracts/meme/src/solana.rs` |
| Keeper: oracle push, broadcaster, testnet bridge, Solana, pool re-peg | `backend/keeper/src/` (`oracle.js`, `broadcaster.js`, `bridge.js`, `solana.js`, `repeg.js`) |
| Indexer and read API | `backend/keeper/indexer.js`, `backend/keeper/src/api.js` |
| App: trade, pay from another chain (1Click), treasury per chain, launch, dashboard | `frontend/src/components/` (`trade-panel.tsx`, `pay-from-chain.tsx`, `treasury-chains.tsx`, `launch-flow.tsx`) and `frontend/src/app/` |
| Simulation | `simulation/sim.py`, results in `simulation/RESULTS.md` |
| Documentation site | `docs/site` (Fumadocs, served at docs.solidon.xyz) |

## 60-day simulation

Five scenarios, 12 seeds each, 5-minute steps, the contract's exact rules ([simulation/RESULTS.md](simulation/RESULTS.md)):

| Scenario | Meme | Stock | NAV/token | Stock units/token | Worst min mNAV |
| --- | --- | --- | --- | --- | --- |
| Steady bull | +31.1% | +28.7% | +47.9% | +13.1% | 1.07 |
| Bull then hype fades | -24.7% | +28.7% | +56.6% | +29.1% | 0.87 |
| Stock crash | -46.9% | -31.6% | +3.9% | +68.8% | 0.87 |
| Sideways chop | -19.6% | -4.7% | +22.1% | +34.7% | 0.88 |
| Weekend gap | -19.0% | +0.0% | +18.5% | +22.9% | 0.88 |

Every issuance was accretive in every seed. mNAV recovered above 0.9 within 2 hours whenever it dipped, and no rule fired on a stale oracle. The simulation also changed the spec: a buyback that sells stock to refill cash destroys NAV. The adopted rule spends only cash above the 20% buffer.

## Trust assumptions and threat model

Stated openly. The full table is in [docs/SPEC.md](docs/SPEC.md#trust-assumptions--threat-model).

- **No admin key.** No method lets anyone move treasury funds. The treasury addresses belong to the meme contract via MPC, and the contract signs only an approve to a locked router and a swap into its locked stock.
- **Holdings are booked, not read.** The ledger records each swap's `minAmountOut` when it is signed, and the app shows the real explorer balance next to it. On EVM chains, a signed swap that reverts is not unbooked yet: the value stays in the treasury as USDC, but the stock figure overstates until holdings are proven (next step: book Base swaps on an MPC-verified log, as cash already is).
- **Cash on Robinhood Chain and Solana is relayer-reported.** Only Base arrivals are MPC-proven. A relayer report is capped by cash in transit, once per transaction, so it cannot create value.
- **The testnet bridge is a trusted keeper account.** On mainnet that leg is NEAR Intents / 1Click.
- **Manipulation brakes.** 30-minute TWAP, 1-hour cooldown, 1%/day issuance cap, 15-minute oracle staleness stop, 1% max slippage per swap, per-chain swap cap.
- **The floor is a NAV floor, not a price guarantee.** If the stock falls, NAV falls with it.

## Documentation

Full documentation at **[docs.solidon.xyz](https://docs.solidon.xyz)** (also machine-readable: [llms.txt](https://docs.solidon.xyz/llms.txt), [llms-full.txt](https://docs.solidon.xyz/llms-full.txt), and every page as Markdown by appending `.md`).

| Section | Pages |
| --- | --- |
| Start | [Introduction](https://docs.solidon.xyz/docs) · [Quickstart](https://docs.solidon.xyz/docs/quickstart) · [FAQ](https://docs.solidon.xyz/docs/faq) |
| Concepts | [How it works](https://docs.solidon.xyz/docs/concepts/how-it-works) · [mNAV](https://docs.solidon.xyz/docs/concepts/mnav) · [Treasuries](https://docs.solidon.xyz/docs/concepts/treasuries) · [NEAR Intents](https://docs.solidon.xyz/docs/concepts/intents) · [The meme token](https://docs.solidon.xyz/docs/concepts/token) |
| Guides | [Trade](https://docs.solidon.xyz/docs/guides/trade) · [Launch](https://docs.solidon.xyz/docs/guides/launch) · [Redeem and buybacks](https://docs.solidon.xyz/docs/guides/redeem) · [Rebalance](https://docs.solidon.xyz/docs/guides/rebalance) |
| Reference | [Contracts](https://docs.solidon.xyz/docs/reference/contracts) · [Deployments](https://docs.solidon.xyz/docs/reference/deployments) · [Read API](https://docs.solidon.xyz/docs/reference/api) · [Keeper](https://docs.solidon.xyz/docs/reference/keeper) · [Stocks](https://docs.solidon.xyz/docs/reference/stocks) · [Run locally](https://docs.solidon.xyz/docs/reference/run-locally) |
| Trust | [Security and trust](https://docs.solidon.xyz/docs/security) · [Simulation](https://docs.solidon.xyz/docs/simulation) · [Hackathon](https://docs.solidon.xyz/docs/hackathon) |

In the repository: [Spec](docs/SPEC.md) · [Deployments](docs/DEPLOYMENTS.md) · [Integration spikes](docs/SPIKE.md) · [References](docs/REFERENCES.md) · [Hackathon rules summary](docs/HACKATHON_RULES.md)

## Repository

| Path | Contents |
| --- | --- |
| [`contracts/`](contracts) | Rust (near-sdk): `meme` (NEP-141, AMM, mNAV engine, EVM and Solana treasuries), `factory`, `mock-ft`; stock venue registries |
| [`backend/`](backend) | Node.js keeper (oracle push, housekeeping, broadcaster, testnet bridge, indexer + read API) and spike scripts |
| [`frontend/`](frontend) | Next.js landing + app (Markets, Launch, Dashboard, meme pages) |
| [`simulation/`](simulation) | 60-day mNAV simulation |
| [`docs/`](docs) | Documentation site source ([`docs/site`](docs/site), Fumadocs, served at [docs.solidon.xyz](https://docs.solidon.xyz)), [Spec](docs/SPEC.md), [deployments](docs/DEPLOYMENTS.md), [integration spikes](docs/SPIKE.md), [references](docs/REFERENCES.md), [hackathon rules](docs/HACKATHON_RULES.md) |

## Hackathon disclosures

- **No baseline code.** This repository was created on 8 Nov 2026, inside the hackathon window, and every commit is new work. The submitted commit carries the tag `hackathon-submission`.
- **Other project by the same author:** NYXERON, an independent project, submitted separately.
- **Tools & disclosure**
  - **AI:** Claude Code was used throughout for code, tests and docs, under the author's direction and review. GPT Image (ChatGPT) generated the mascot and meme art.
  - **Libraries:**
    - Contracts: near-sdk, cargo-near.
    - Backend: near-api-js, viem, @solana/web3.js, Raydium SDK v2 (devnet pool setup only).
    - Frontend: Next.js, Tailwind CSS, shadcn/ui, Motion, @hot-labs/near-connect.
    - Simulation: Python standard library.
  - **Services:**
    - Signing: NEAR Chain Signatures (`v1.signer-prod.testnet`).
    - Prices: Chainlink price feeds (Robinhood Chain mainnet).
    - Cross-chain entry: NEAR Intents 1Click (quotes).
    - Chain access: FastNear and dRPC (NEAR), Alchemy (EVM, Solana).
  - **Assets:** the hero background is a licensed MotionSites gradient. Stock, chain and platform logos are trademarks of their owners; sources are in [`frontend/public/logos/SOURCES.md`](frontend/public/logos/SOURCES.md).
- **Not for US persons.** Tokenized stocks are regulated securities in many places. This is a testnet prototype with synthetic tokens.

## License

[MIT](LICENSE)
