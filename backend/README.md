# backend

Node.js services and spike scripts that support the contracts. None of them holds a key that controls a treasury: the meme contract signs through Chain Signatures, and anyone can broadcast what it signed.

| Path | Purpose |
| --- | --- |
| `keeper/` | Testnet keeper: mock oracle prices, treasury housekeeping, broadcaster for MPC-signed transactions, testnet bridge for `fund_chain` |
| `spike/` | Integration spike scripts behind [docs/SPIKE.md](../docs/SPIKE.md) |
| `solana-spike/` | Raydium CLMM venues and the MPC-signed swap on Solana devnet (S25) |

API keys for the backend and spikes go in `backend/.env` (gitignored); see `backend/.env.example`.

## keeper

```bash
cd backend/keeper
npm install
npm test                              # pure logic + flow tests, no network
node keeper.js --once --dry-run       # real reads, no transaction; no key needed
node keeper.js                        # loop every LOOP_SECS (60 s)
```

Node 20+. Flags: `--once` (one cycle), `--dry-run` (every write is logged as `DRY ... would ...` instead of sent), `--meme=a.testnet,b.testnet`, `--only=oracle,broadcast,bridge,treasury,solana`. Logs are one line per event with explorer links; RPC URLs and keys are redacted.

One cycle:

| Step | What it does | Trust |
| --- | --- | --- |
| Oracle (testnet only), every `ORACLE_INTERVAL_SECS` | Reads `latestRoundData()` of the 8 official Chainlink proxies on Robinhood Chain mainnet (Alchemy, docs/SPIKE.md S19) and sets them on the mock oracle (`pyth.<factory>`, `set_price`), 8 actions in one NEAR transaction. A feed older than `ORACLE_MAX_FEED_AGE_SECS` (25 h: weekend or broken) is not pushed, so the contracts' 15-minute staleness brake applies. Refuses to write to a real Pyth receiver | The mock is trusted on testnet (anyone can set it) |
| Broadcast | Per meme and chain: sends `get_signed_tx(chain, nonce)` for every nonce between the treasury's on-chain nonce and the meme's next nonce, waits for the receipt, logs the explorer link. A reverted swap is logged as an error (the ledger booked `minAmountOut`). Tops up the treasury's gas from the keeper wallet when it is below `TREASURY_GAS_MIN_ETH` | None: the transactions are signed by the MPC and checked by the contract; anyone can run this |
| Bridge (testnet stand-in for Intents/1Click) | Lists USDC transfers to the keeper account on NearBlocks v3, reads each one back from NEAR RPC (`EXPERIMENTAL_receipt`: sender is a factory meme, `ft_transfer`, memo `solidon fund <chain> <treasury>`), then sends the same amount (6 → 6 decimals on Base Sepolia, 6 → 18 on Robinhood testnet) from the keeper wallet to the treasury, capped by the meme's `in_transit` minus what is already delivered. Then proves it: `credit_cash(chain, tx_hash, log_index, log)` on Base (MPC-verified log, 300 TGas), `report_cash(chain, tx_hash, amount)` on Robinhood. `state.json` keys every transfer by NEAR receipt id; the signed EVM transaction is saved before broadcast, so a restart resumes it instead of paying twice | Testnet bridge is trusted to deliver (docs/SPEC.md threat model); Robinhood arrivals are relayer-reported |
| Treasury | Per meme: `init_treasury` if no address; `approve_router(chain)` when not approved; `buy_stock(chain)` when the chain holds USDC and the price is fresh; `fund_chain(chain)` when nothing is in transit, the chain's USDC is spent and the estimated cash above the 20% buffer is at least `FUND_MIN_USDC`; `rebalance()` when the cooldown is over and the price is fresh. Signing steps wait while a signature is in flight | None: open methods, the contract decides |
| Solana | Not implemented: waits for the Solana treasury methods (PR B2). `src/solana.js` documents the expected flow; the tick-array search is already ported (`tickArrayStarts`) | |

Memes on pre-multichain code (no `get_treasury_chains`, like the current `elondoge.solidon.testnet`) only get `rebalance()`; a factory without `get_chains` is reported and the chain list is taken from `contracts/stocks/`.

### Keeper setup (maintainer)

1. **NEAR account `keeper.<factory>`** (`keeper.solidon.testnet`). `contracts/deploy-testnet.sh` names it as every meme's `bridge` and `relayer`, so it must exist before memes are funded. Create it with a key the keeper can read, e.g. near-cli-rs's legacy keychain:
   ```bash
   near account create-account fund-myself keeper.solidon.testnet '5 NEAR' autogenerate-new-keypair \
     save-to-legacy-keychain sign-as solidon.testnet network-config testnet sign-with-keychain send
   ```
   This writes `~/.near-credentials/testnet/keeper.solidon.testnet.json`, which the keeper reads; or set `KEEPER_NEAR_PRIVATE_KEY=ed25519:...`. Gas: the oracle push burns roughly 0.003 NEAR every 5 minutes (about 1 NEAR a day); signing calls are paid by the meme. On its first run the keeper registers itself on the USDC contract (`storage_deposit`, 0.00125 NEAR), without which every `fund_chain` transfer bounces back.
2. **Keeper EVM wallet**: the testnet deployer `EVM_DEPLOYER_ADDRESS` / `EVM_DEPLOYER_PRIVATE_KEY` from `contracts/.env` (or `KEEPER_EVM_PRIVATE_KEY`). Each `fund_chain` moves at most 5 USDC (`max_swap_usdc`), so 20 USDC per chain covers four lots:
   - **Base Sepolia**: Circle USDC from [faucet.circle.com](https://faucet.circle.com) (Base Sepolia). ETH for gas and treasury top-ups.
   - **Robinhood testnet**: ETH from the faucet, then USDC (18 decimals) from the testnet Uniswap fork's WETH/USDC 0.3% pool (about 74 USDC per ETH on 10 Nov 2026, an arbitrary testnet price, so 20 USDC costs about 0.27 ETH). `amountOutMinimum` 0 is acceptable only because these are testnet tokens:
     ```bash
     cast send 0x3ce954107b1a675826b33bf23060dd655e3758fe \
       "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
       "(0x33e4191705c386532ba27cbf171db86919200b94,0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F,3000,$EVM_DEPLOYER_ADDRESS,270000000000000000,0,0)" \
       --value 0.27ether --rpc-url "https://robinhood-testnet.g.alchemy.com/v2/$ALCHEMY_API_KEY" --private-key "$EVM_DEPLOYER_PRIVATE_KEY"
     ```
   The keeper logs its balances on every start (`[wallet:base]`, `[wallet:robinhood]`) and warns when a delivery cannot be paid.
3. **Factory**: the multichain factory (`contracts/deploy-testnet.sh`) must be deployed for anything but the oracle and `rebalance()` to run; the live `solidon.testnet` still runs the BSC-era code.

### Known gaps

- **Solana**: stub only, until the contract's Solana methods land (PR B2).
- **MPC log index**: `credit_cash` uses one `log_index` both to select the log and as the log's `logIndex` in the payload hash. The keeper sends the receipt's `logIndex` (as backend/spike/s8 did). Both live checks (S18, S26) had `logIndex` equal to the log's position in the receipt, so whether the MPC selects by position or by block-wide `logIndex` is unconfirmed; when they differ, the keeper warns, and a failed credit is retried `CREDIT_MAX_ATTEMPTS` times, then left as `credit-failed` in `state.json`.
- **Indexer**: incoming transfers are listed through NearBlocks v3 (v1 was retired on 5 Nov 2026; v3 has no memo, hence the receipt read-back). If NearBlocks is down the bridge waits; nothing is lost.
- **Restarts**: a transfer seen but not yet delivered when `state.json` is lost is still capped by `in_transit`, so it cannot be delivered twice.
