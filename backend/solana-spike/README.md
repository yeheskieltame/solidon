# Spike S24 · Raydium CLMM `swap_v2` from a hand-built Solana message (devnet) ✅

Goal: prove the bytes a NEAR contract must produce (no Solana SDK, no network) to buy a stock token on Raydium CLMM from a treasury address. The Raydium SDK is used only to create the pool and the position; the swap message is compiled by hand and signed with a raw ed25519 key over the message bytes, exactly what the MPC EdDSA domain signs (S21).

```bash
cd backend/solana-spike && npm install --legacy-peer-deps
SOLIDON_ENV=/path/to/backend/.env node 1_setup.js   # 8 stock mints + pools (resumable, state.json) -> contracts/stocks/solana-devnet.json
SOLIDON_ENV=/path/to/backend/.env MPC_SIGNER=creator.solidon.testnet TICKER=NVDA AMOUNT_USDC=1 node 2_swap.js
#   hand-built buy, Circle USDC -> stock, signed by the NEAR MPC (DRY_RUN=1: simulate only, no MPC call)
```

Throwaway devnet keys (payer, mint keypairs) live in `.secrets/` (git-ignored). `ALCHEMY_API_KEY` is read from `backend/.env` and never printed.

## Stock venues (Circle devnet USDC, current)

Mirror of `contracts/evm/deploy-testnet-stocks.py`. Quote token: **Circle devnet USDC** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (SPL Token, 6 dp). Each stock is a synthetic Token-2022 mint (8 dp, `MetadataPointer` + `TokenMetadata` only, name "<Company> (Solidon synthetic, devnet)", symbol `<TICKER>x`, payer is mint authority). Reference price: Chainlink proxy on Robinhood Chain mainnet, fixed in `state.json` at creation. Pools: same CLMM program and AMM config as below (0.05%, tick spacing 10). Liquidity is **one-sided**: $50,000 of stock, range from the reference to ~2× (6,940 ticks), pool initialised half a spacing outside it, so a USDC buy moves into the range and the payer needs no USDC. The range edge is at most one spacing (0.1%) below the reference. Venue file: [`contracts/stocks/solana-devnet.json`](../../contracts/stocks/solana-devnet.json).

| Ticker | Mint (`<T>x`) | Pool | Stock is | Ref | Range ticks | Edge | Stock in pool |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NVDA | `88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB` | `FEstNywAgrVXixWbLkFaqqMjT7jbdjwmkoPdmudtRCqU` | mint1 | $176.59 | -12620 .. -5680 | $176.47 | 283.1437 |
| AAPL | `FtYHpjhYBFVrUE1inx7w48Wp1s7AzxnsFptvpgZcGkW5` | `8HtcC4dszMQcnrPvow8iYF6aNDTigtFsZ8PP4BiRypsV` | mint1 | $350.44 | -19480 .. -12540 | $350.41 | 142.6781 |
| MSFT | `Bah7NyVk64eL7ADuHuJYwqKeG6vQTD5YRPQKLMtzG4SP` | `EhyAxindqL3HiK6VPXjpJtrxKHgh2kJkePML3r5cXsdv` | mint1 | $544.15 | -23880 .. -16940 | $544.07 | 91.8864 |
| GOOGL | `XLYZw9YeVrUNsp4dAVVYayMdT5jWrmk6wFjUNWu8AnH` | `5dRjF2Zpc7crjrqp8NzrpntYnhGTVcLFN5QumB2iftu9` | mint0 | $290.38 | 10660 .. 17600 | $290.36 | 172.1866 |
| AMZN | `D4GVCzUpbJRkqQ4ymbpXxKTC5jCxWK1gRvDXwRAHERZk` | `6pRZ79bnqssPy3HhyN3TijrCjXoqzZ4auD77kcM5mVhK` | mint1 | $268.14 | -16800 .. -9860 | $268.04 | 186.4696 |
| META | `66aQ8CyXmgYkvreikf76EzETQC4oVgv9bbdxbPgFrKj8` | `EgV8KMGkUbzpLZUru3ivLi9Cx7YgxxhtopxcDFQC6JLA` | mint1 | $642.58 | -25540 .. -18600 | $642.31 | 77.8109 |
| TSLA | `229y3sTgdfFBEWGxmuvQ4yvpj8puVrpmeSFNp7ZRkmSq` | `8cZfaL77SdxBZPc3SVPe7mrmNpqPJa61ixqqjsBqqm2o` | mint0 | $376.77 | 13260 .. 20200 | $376.57 | 132.7055 |
| SPCX | `8mdbWErQneCkM6jpE5epezYrk8W6uhjjG9nnPwxLQDKp` | `3uwogu11qDBBw7mSVFHdTFq1YXnMrgaah1bYjuAJCF5K` | mint1 | $141.18 | -10380 .. -3440 | $141.06 | 354.1578 |

Ticks are Raydium ticks of the mint1-per-mint0 raw price. When the stock is mint0 the range sits above the current tick and a buy pushes the price up; when it is mint1 the range sits below and a buy is `zeroForOne`. All transactions per stock (mint, `createPool`, `openPositionV2`) are in `state.json` under `stocks`; NVDA: [mint `36oNGeUh…`](https://explorer.solana.com/tx/36oNGeUhCGnrgofJV5wGLKas1NsAY1MLLoUSHJBKiaCJ4hicjD6GbkT5YjYFKHTg5eNkMY9S9TUhna9gvn3paepU?cluster=devnet), [pool `5cnxP5Hk…`](https://explorer.solana.com/tx/5cnxP5HkPSqn5YvfVngrdaHaf3sEqo2KS6Ursn4ohnjTB5ycADpCWhZJysLPBM1rGbGzJfks7ab8LQx2D46wUGLe?cluster=devnet), [position `2DJpxC8W…`](https://explorer.solana.com/tx/2DJpxC8WtYVGvVgWaF6dPrXZgDtEGCVThYY8B6HaHiFVjkCtu9mwahwevfcha69VQJ8fy643vp2umCb1tpxanbVq?cluster=devnet). Cost: about 0.18 SOL of rent per stock (pool, observation, bitmap extension, two tick arrays, position).

**MPC buy, 1 Circle USDC → NVDAx** (treasury `GXhnfvC6yYEXgYEtSwEZNfKF2tcCd7vFn5onqEyK2UH5`, `v1.signer-prod.testnet` EdDSA, 9 s): [`EwX4QEFx…`](https://explorer.solana.com/tx/EwX4QEFxQ1g3UiUQn5vbH5WnVWecK4xFMzJ3UTP5A4xK4k9tDVtvLyCEuKvVfF5hRBmoKVNoosXSJ9wr3JdU4a9?cluster=devnet), finalized, err null. 0.00566387 NVDAx for 1 USDC = **$176.56 vs ref $176.59 (−0.02%)**; min out (ref − fee − 1%) 0.00560337. Message 715 bytes, 19 keys, signed tx 780 bytes, 99,672 CU.

**One-sided pools need two tick arrays.** The price starts outside the range, so the first initialized array holds only the near range edge. After crossing it the program loads the *next initialized* array (the far edge, ~7,000 ticks away) before it takes the step, even for a tiny amount; with one array the swap fails with `NotEnoughTickArrayAccount` (6027, simulated). `2_swap.js` passes up to 3 initialized arrays in the swap direction (2 exist per pool, +33 bytes over the single-array message).

## Mock-USDC spike (superseded, pool left in place)

The first run used a mock USDC mint; its pool still exists but is no longer used. Its state is under `mock_usdc_nvdax` in `state.json`.

| Item | Value |
| --- | --- |
| CLMM program | `devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH` (mainnet: `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK`) |
| AMM config | `GVSwm4smQBYcgAJU7qjFHLQBHTc4AdB3F2HbZp6KqKof` (index 2, fee 0.05%, tickSpacing 10) |
| Mock USDC (SPL Token, 6 dp) | `4MUpSzmNTEqR9YwvGotwEMSFHCTWSiP9epnse7E7bzpd` |
| Synthetic NVDAx (Token-2022, 8 dp, no extensions) | `GB6qjXZX5evbBEk6DCZTVCPySUfitcJSkpsHAodDbesU` |
| Pool NVDAx/USDC (mint0 = USDC, mint1 = NVDAx) | `HCY7R4SEa4XAhRBpbvMPc4PrsmrHzWpBpqcMjsqeuXtK` |
| Position | ticks −12810..1050 (90..360 USDC/NVDAx), 100 NVDAx + 17,992 USDC, NFT `HLhgN89fg5nGYLs8pLACnkq1qFJaaPfjw19Nvigt8QPi` |
| Payer / treasury | `BhhpPESimqAvAzYsbuUHMmhRMNXPv25nGJ298biZGDGt` / `DtPStxpjk3PCyGSK7hGeiUArwQ89ECHsScC2cDQnT1Cr` |

| Step | Transaction |
| --- | --- |
| createPool at 180 USDC/NVDAx (SDK) | [`58zA3zY4…`](https://explorer.solana.com/tx/58zA3zY49CFwMsyv82HrcvhyHM1jg5sTLuAvvUY4tYP94Wn36zbb6pyR1Q7tSNLw3jRYVna2ZzUArrPugyLPrq4j?cluster=devnet) |
| openPositionV2 (SDK, one key patched) | [`64tb4Jjo…`](https://explorer.solana.com/tx/64tb4JjoomFHsf1XJoTKChs5t6mKuiwkV31dsYficMXYMjHLbhRZB6U7n1TxJjujP1FwbqHgtPBkK9skBipJmMCh?cluster=devnet) |
| **Hand-built swap 100 USDC → NVDAx** | [`U2ZaaZpZ…`](https://explorer.solana.com/tx/U2ZaaZpZwi7xLg85eJbuiNwYP1gx6BKSh5JSnFuG4B6cVZsNoTvcih7DYyJT9AP6GzbYZAw171ox59yzmnmPPvV?cluster=devnet): **finalized, err null**, 88,552 CU. Treasury USDC 1000 → 900, NVDAx 0 → 0.55437615 (180.38 USDC/NVDAx after the 0.05% fee; min out was 0.54972221) |

## What the contract must build

Legacy message, one signer (treasury = fee payer = token owner), two instructions, no address lookup table, no compute-budget instruction:

1. Associated Token Account `CreateIdempotent` for the Token-2022 output account (no-op if it exists).
2. Raydium CLMM `swap_v2`.

**Size:** message **682 bytes** (18 keys), signed tx **747 bytes** (limit 1232). Formula: `3 + 1 + 32·keys + 32 + 1 + ATA ix (10) + swap ix (1 + 1 + n_accounts + 1 + 41)`. Each extra tick array adds 33 bytes, so room remains for about 14 more accounts. The one-sided stock pools need 2 tick arrays: message 715 bytes, 19 keys, signed tx 780 bytes.

**Header** `[1, 0, 9]`. Key order: treasury | writable: output ATA, pool, input ATA, input vault, output vault, observation, bitmap extension, tick array | read-only: NVDAx mint, System, Token-2022, ATA program, AMM config, Token, Memo, USDC mint, CLMM program.

### `CreateIdempotent` (program `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`)

Data `[0x01]`. Accounts: treasury (w, s), output ATA (w), owner = treasury, output mint, System program, **Token-2022** program.

### `swap_v2` instruction data (41 bytes, little-endian)

| Offset | Size | Field | Value used |
| --- | --- | --- | --- |
| 0 | 8 | discriminator `sha256("global:swap_v2")[..8]` | `2b04ed0b1ac91e62` |
| 8 | 8 | `amount` u64 | 100,000,000 (100 USDC) |
| 16 | 8 | `other_amount_threshold` u64 (min out when base input) | 54,972,221 |
| 24 | 16 | `sqrt_price_limit_x64` u128 | 0 = no limit (program uses MIN+1 / MAX−1) |
| 40 | 1 | `is_base_input` bool | 1 |

Sent bytes: `2b04ed0b1ac91e62 00e1f50500000000 3dcf460300000000 00000000000000000000000000000000 01`

### `swap_v2` accounts, in order

| # | Account | Flags | Source |
| --- | --- | --- | --- |
| 0 | payer / owner of input account | signer (writable as fee payer) | treasury |
| 1 | `amm_config` | r | static per pool; PDA `["amm_config", index u16 BE]` |
| 2 | `pool_state` | w | PDA `["pool", amm_config, mint0, mint1]`, mint0 < mint1 bytewise |
| 3 | input token account | w | ATA PDA `[owner, input token program, input mint]` under the ATA program |
| 4 | output token account | w | ATA PDA `[owner, Token-2022, NVDAx mint]` |
| 5 | input vault | w | PDA `["pool_vault", pool, input mint]` |
| 6 | output vault | w | PDA `["pool_vault", pool, output mint]` |
| 7 | observation | w | PDA `["observation", pool]` |
| 8 | Token program `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | r | constant |
| 9 | Token-2022 program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | r | constant |
| 10 | Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | r | constant |
| 11 | input mint | r | config |
| 12 | output mint | r | config |
| 13 | tick array bitmap extension (remaining) | w | PDA `["pool_tick_array_bitmap_extension", pool]` (the SDK always passes it) |
| 14+ | tick array(s) (remaining) | w | PDA `["tick_array", pool, start_index i32 BE]`, **start index needs live state** |

All PDAs above are derived under the CLMM program. The script checks that pool, both vaults and observation derive from `(amm_config, mint0, mint1)` and match the pool account.

**What needs live pool state.** Only the tick arrays (and `other_amount_threshold`, which the contract should derive from its own oracle price). The first tick array must be the first *initialized* one in the swap direction: start from `floor(tick_current / (60·tickSpacing)) · 60·tickSpacing` and walk down (zero_for_one) or up until the bit is set in `pool.tick_array_bitmap` (bit `i` ↔ start `(i − 512)·60·tickSpacing`). Here the current array −6000 was empty and the swap needed −13200. Uninitialized (non-existent) tick arrays cannot be passed. Large swaps that cross into further arrays need the next initialized arrays appended (+33 bytes each); one-sided pools always need the second one (see above). Arrays beyond ±512 slots (|tick| > 307,200 at tickSpacing 10) live in the bitmap extension account's data.

PoolState offsets read (devnet-verified): `amm_config` 9, `mint0` 73, `mint1` 105, `vault0` 137, `vault1` 169, `observation` 201, `tick_spacing` u16 235, `sqrt_price_x64` u128 253, `tick_current` i32 269, `tick_array_bitmap` [u64; 16] 904.

**Safety.** The program validates every PDA and that tick arrays belong to the pool. If the contract derives the pool, vaults and its own ATAs itself and enforces `other_amount_threshold`, then wrong relayer-supplied live inputs (tick array, blockhash) can only make the swap fail; they cannot redirect funds.

## Gotchas found

- **Mainnet xStocks (NVDAx `Xsc9qv…`) Token-2022 extensions:** metadataPointer, permanentDelegate, defaultAccountState=initialized, scaledUiAmount (multiplier 1.00092, raw ≠ UI amount), pausable, confidentialTransferMint, transferHook with **no program**, tokenMetadata. There is **no transfer fee**, so the swap account list is the same as on devnet. Accounting must apply the scaledUiAmount multiplier. The issuer can pause transfers or move tokens (permanent delegate). The devnet NVDAx has none of these extensions.
- **Two devnet CLMM programs.** SDK 0.2.84-alpha's `DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID` is `DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH`. `devi51m…` was used here by passing `programId` explicitly.
- **SDK bugs against `devi51m…`:** `getPoolInfoFromRpc` throws on a pool with no tick arrays. `openPositionFromBase` derives `protocol_position` with little-endian ticks and marks it read-only. The program expects `["position", pool, tickLower i32 BE, tickUpper i32 BE]`, writable (otherwise ConstraintSeeds 2006, then a privilege escalation error). `1_setup.js` patches that key.
- **RPC.** The public devnet faucet is closed (HTTP 410); Alchemy's `requestAirdrop` works (1 SOL). Alchemy's free tier refuses `getProgramAccounts` (configs were listed through `api.devnet.solana.com`) and has no `signatureSubscribe` (`rpc.js` uses the public devnet websocket for confirmations).
- **npm.** Peer-dependency resolution loops forever without `--legacy-peer-deps`.
- **Compute.** 88,552 CU for ATA creation and the swap, within the default 200k per instruction. Mainnet should add `SetComputeUnitLimit` and a priority fee (+1 key and 2 instructions, about 30 bytes).
- **Blockhash.** The message embeds a recent blockhash (valid about 60–90 s), which the caller must supply before the MPC sign. A durable nonce is the alternative (+1 `AdvanceNonceAccount` instruction, +2 keys).
- **Not yet tested:** the same message on mainnet against a real xStocks pool. (MPC EdDSA signing of 682- and 715-byte messages works, ~9 s.)
