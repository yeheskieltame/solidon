# Deployments

## BSC testnet (chain 97, 9 Nov 2026)

Mock bStocks and PancakeSwap v3 pools for testing the Chain Signatures flow, deployed with [`contracts/evm/deploy-bsc-testnet.sh`](../contracts/evm/deploy-bsc-testnet.sh) (dry-run first on an anvil fork of BSC testnet). Registry: [`contracts/stocks/bsc-testnet.json`](../contracts/stocks/bsc-testnet.json); re-check with `BSC_RPC=https://bsc-testnet-rpc.publicnode.com python3 contracts/stocks/verify.py contracts/stocks/bsc-testnet.json`.

Deployer [`0xcF1E…6D28`](https://testnet.bscscan.com/address/0xcF1ED498f96d272c949CB6b8FcD67c137F766D28) (testnet only; key in the gitignored `contracts/.env`). Mock USDT [`0x8f13…2654`](https://testnet.bscscan.com/address/0x8f13563130684478E617C1797308A081Cb2c2654). Each pool: fee 0.25% (as on mainnet), full-range liquidity of 100,000 mock USDT, created through the official testnet NonfungiblePositionManager `0x427bF5b37357632377eCbEC9de3626C71A5396c1`. Total cost: 0.0049 tBNB.

| Ticker | Mock token | Pool | Initial price |
| --- | --- | --- | --- |
| NVDA | [`NVDAB` 0xDaeD…A142](https://testnet.bscscan.com/address/0xDaeD2B60dFB4131fae08b0093AE583F672FaA142) | [0x7a48…1185](https://testnet.bscscan.com/address/0x7a48FF1Dbd57db070F026bbA61294Fd579791185) | $187.56 |
| AAPL | [`AAPLB` 0x04eC…729f](https://testnet.bscscan.com/address/0x04eC0775F4faF1fC61cbaA9AEfe7D72159fb729f) | [0x757B…6336](https://testnet.bscscan.com/address/0x757BfA777A5824A41028D189a56C4C361Cc76336) | $342.24 |
| MSFT | [`MSFTB` 0xa9e4…C123](https://testnet.bscscan.com/address/0xa9e45392aA5722f82603765C0D1f7ACfA632C123) | [0xf33d…3525](https://testnet.bscscan.com/address/0xf33d886A1180B8E5f63Fd6eCb5671611B6cb3525) | $531.60 |
| GOOGL | [`GOOGLB` 0x690F…4DbA](https://testnet.bscscan.com/address/0x690FAC364cbd86CeeE231432c280E6C77fD74DbA) | [0x8E2c…6c11](https://testnet.bscscan.com/address/0x8E2c819Bb3D5B9B8e5F6915B6d63AeCCca436c11) | $285.44 |
| AMZN | [`AMZNB` 0xed31…fE9D](https://testnet.bscscan.com/address/0xed3158aa4eAd25b94E13f5C7ef91a63B74ECfE9D) | [0xd433…3394](https://testnet.bscscan.com/address/0xd433bA0189F6115C4FE1045fdf0AC98731683394) | $260.30 |
| META | [`METAB` 0x2758…9E5A](https://testnet.bscscan.com/address/0x2758008061E34a026193e8B7C8135b036C7b9E5A) | [0xdE22…F99C](https://testnet.bscscan.com/address/0xdE22310EB0d29d680e13c54df5e2a11A0Ea5F99C) | $612.26 |
| TSLA | [`TSLAB` 0xEf3F…4f69](https://testnet.bscscan.com/address/0xEf3FF65eD4aAe385E302f5a2F16EA5355CfF4f69) | [0xDaE3…Ec4E](https://testnet.bscscan.com/address/0xDaE376875d42B828ED63E64278911CDdE5EbEc4E) | $358.25 |
| SPCX | [`SPCXB` 0x730B…e08b](https://testnet.bscscan.com/address/0x730B750E15F08B9596C8c2bc3240856c4714e08b) | [0xF6AC…8394](https://testnet.bscscan.com/address/0xF6ACaD0919417bfE82B61E4e756A430804078394) | $135.32 |

Mock tokens can only be minted by the deployer. They are **not** bStocks and have no value.

## NEAR testnet

### Current factory (9 Nov 2026, second deploy)

Deployed with [`contracts/deploy-testnet.sh`](../contracts/deploy-testnet.sh). The factory lists the 8 verified stocks from [`contracts/stocks/bsc-mainnet.json`](../contracts/stocks/bsc-mainnet.json). No meme is launched by the script: memes are launched from the launchpad.

| Account | Contract | Code hash |
| --- | --- | --- |
| [`solidon.testnet`](https://testnet.nearblocks.io/address/solidon.testnet) | `factory` | `Cb9EthLrmMG8rNTLDHGh9Ga5de8qLPbFagLijLJK1qBZ` |
| [`usdc.solidon.testnet`](https://testnet.nearblocks.io/address/usdc.solidon.testnet) | `mock-ft`, USDC stand-in, open mint | `HXiW8GGzCv5Nw69DKrjvXFLD8ZBfAjTr8d2br8FJYMjt` |
| [`pyth.solidon.testnet`](https://testnet.nearblocks.io/address/pyth.solidon.testnet) | `mock-pyth`, settable prices | `EikNxZjj9f3UNxpcMGAoFYmGYe6yaVJ2r7usqdxUwXdF` |
| [`creator.solidon.testnet`](https://testnet.nearblocks.io/address/creator.solidon.testnet) | none, demo creator | n/a |

Listed stocks: NVDA, AAPL, MSFT, GOOGL, AMZN, META, TSLA, SPCX. Pyth feed IDs are the real ones; BSC token addresses are **placeholders** `0x…01` to `0x…08` (BSC testnet has no bStocks). Mock prices set from the PancakeSwap USDT pools on 9 Nov 2026: NVDA 187.56, AAPL 342.24, MSFT 531.60, GOOGL 285.44, AMZN 260.30, META 612.26, TSLA 358.25, SPCX 135.32.

| Step | Transaction |
| --- | --- |
| Delete the first factory account (balance to `creator.solidon.testnet`) | [`6bEUbfy…`](https://testnet.nearblocks.io/txns/6bEUbfyfkGRmaU4R2qt18ux8uFWKF2817b2gkcNL2rek) |
| Recreate `solidon.testnet` (faucet) | [`J3Km71N…`](https://testnet.nearblocks.io/txns/J3Km71NbkZN1nC46muZrx4BU49CkScTxkvin8JaavxZz) |
| Deploy + init factory with 8 stocks | [`D2pnY3M…`](https://testnet.nearblocks.io/txns/D2pnY3MYxAzGhJsX8Dna4EXkiH6mgTmYnJJm1AxBfyES) |
| Set 8 mock prices | [`CZsnYqY…`](https://testnet.nearblocks.io/txns/CZsnYqYPZiHBV7ey924W89dNNLcceMi2kE5acRgTQmT4) … [`5bM5XiD…`](https://testnet.nearblocks.io/txns/5bM5XiDeg8Bt7YruDEPiAQunP3fpeJmNWzGP6Dmr8gQR) |

**Why delete and recreate.** The factory's `new` can run only once per account, and it has no admin method, so a new stock list needs an account without state. Deleting the account and creating it again keeps the name. The delete transaction shows one failed receipt: the gas refund to the deleted account, which is normal on NEAR.

### Memes on the current factory

| Meme | Thesis stock | Creator | Seed |
| --- | --- | --- | --- |
| [`elondoge.solidon.testnet`](https://testnet.nearblocks.io/address/elondoge.solidon.testnet) "Elon Doge" (`ELONDOGE`) | SPCX (SpaceX) | `creator.solidon.testnet` | 1,000 USDC |

| Step | Transaction | Result |
| --- | --- | --- |
| `create_meme` with 2.9 NEAR | [`Ak3PY5W…`](https://testnet.nearblocks.io/txns/Ak3PY5WKVHUBX4sm5rvtsfruZWWbX5GiceAV3RjubcZK) | `true`; `ft_mint` 1,000,000,000 ELONDOGE to the pool; `launch` event |
| Register the meme on USDC | [`Hu6nWjS…`](https://testnet.nearblocks.io/txns/Hu6nWjSDpoEvbXvR4a9LkyKCzu4qcJYXna9tEGczxWVR) | storage registered |
| Seed 1,000 USDC | [`8AtGuPh…`](https://testnet.nearblocks.io/txns/8AtGuPhkEb1r5NvBtxRzPPHo8k6qm8Ms7Z2TaXPjnAKu) | `seed` event, all 1,000 USDC used |

All three were checked final through RPC with no failed receipts.

### Chain Signatures end-to-end (9 Nov 2026)

New meme code deployed to a test account [`chainsig-e2e.solidon.testnet`](https://testnet.nearblocks.io/address/chainsig-e2e.solidon.testnet) (not through the factory, so no ticker is consumed), stock SPCX, MPC `v1.signer-prod.testnet`.

| Step | Where | Result |
| --- | --- | --- |
| `init_treasury` | [`DHPHdX5…`](https://testnet.nearblocks.io/txns/DHPHdX5D4eM857VLqQjudipLas2nTvbH9E9HrEoyv4dq) | Treasury [`0xe150…d7e2`](https://testnet.bscscan.com/address/0xe15043b65217a97b43b81307e3fea2d51ec2d7e2), equal to the off-chain derivation from `derived_public_key` |
| Fund treasury gas, 0.005 tBNB | [`0x406f…5c4b`](https://testnet.bscscan.com/tx/0x406f6f39454d114ae91fa1c530047049dbabeef373477124d54da13dd9b05c4b) | from the testnet deployer |
| `approve_router` (MPC signature) | [`5M9Qxkr…`](https://testnet.nearblocks.io/txns/5M9QxkrbZjSDVhWaKuc3AGpjNjEmyGANJLPT3Djdg4H3) | `bsc_tx_signed` nonce 0, signature passed the in-contract `ecrecover` check |
| Relayer broadcast | [`0xf76f…9475`](https://testnet.bscscan.com/tx/0xf76fd30e239dc4c87cb4c1aa929458cd80dd39050b4160c6e692c03101bd9475) | status 1, `from` = treasury, USDT allowance to the router = max |

### Launch a meme

```bash
NET="network-config testnet"
COST=$(near contract call-function as-read-only solidon.testnet launch_cost json-args '{}' $NET now 2>/dev/null | tr -d '"')
near contract call-function as-transaction solidon.testnet create_meme \
  json-args '{"name":"Elon Doge","symbol":"ELONDOGE","thesis_stock":"SPCX","icon":null}' \
  prepaid-gas '300.0 Tgas' attached-deposit '2.9 NEAR' sign-as <you>.testnet $NET sign-with-keychain send
```

Then seed the pool from the creator account with `ft_transfer_call` on `usdc.solidon.testnet`, `msg: {"action":"seed"}` (mint test USDC with `mint` first, and register the meme on USDC with `storage_deposit`).

### First deployment (9 Nov 2026, superseded)

The first factory listed only NVDA and launched `nvda.solidon.testnet`, which still exists (memes have no access key and outlive their factory) but is not listed by the current factory. Its transactions:

| Account | Contract | Code hash |
| --- | --- | --- |
| first factory [`solidon.testnet`](https://testnet.nearblocks.io/address/solidon.testnet) | `factory` | `Cb9EthLrmMG8rNTLDHGh9Ga5de8qLPbFagLijLJK1qBZ` |
| [`nvda.solidon.testnet`](https://testnet.nearblocks.io/address/nvda.solidon.testnet) | `meme` (launched by the factory) | `2mCmeSUASkPgixV7D5e7CUXaTUiqDDcbebhurwu54WYF` |
| [`usdc.solidon.testnet`](https://testnet.nearblocks.io/address/usdc.solidon.testnet) | `mock-ft`, USDC stand-in, open mint | `HXiW8GGzCv5Nw69DKrjvXFLD8ZBfAjTr8d2br8FJYMjt` |
| [`pyth.solidon.testnet`](https://testnet.nearblocks.io/address/pyth.solidon.testnet) | `mock-pyth`, settable prices | `EikNxZjj9f3UNxpcMGAoFYmGYe6yaVJ2r7usqdxUwXdF` |
| [`creator.solidon.testnet`](https://testnet.nearblocks.io/address/creator.solidon.testnet) | none, demo creator | n/a |

Factory config: USDC `usdc.solidon.testnet`, oracle `pyth.solidon.testnet`, one listed stock: NVDA, Pyth feed `b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593`, BSC token `0x0000000000000000000000000000000000000001` (**placeholder**, see below).

### Transactions

| Step | Transaction |
| --- | --- |
| Create `usdc.solidon.testnet` | [`7yVGWFr…`](https://testnet.nearblocks.io/txns/7yVGWFrCnXNbFNVyttrbmiwoBuxBtBMmvk5td4vQQNy6) |
| Create `pyth.solidon.testnet` | [`36Gf3yW…`](https://testnet.nearblocks.io/txns/36Gf3yWfE5Ki4JYAeLeULh7HXFDiF3p76wp6nUkWfdGw) |
| Create `creator.solidon.testnet` | [`7vC9EG6…`](https://testnet.nearblocks.io/txns/7vC9EG6VY6WX1sRVhGZ1oP8gnmoTVTubcisvoCSBj7Sn) |
| Deploy + init mock USDC | [`26MsSg5…`](https://testnet.nearblocks.io/txns/26MsSg5yNfnuRDXMcn79y1XSSL5v31J6xGSJYMBinb9j) |
| Deploy + init mock Pyth | [`Dydj8qL…`](https://testnet.nearblocks.io/txns/Dydj8qLKEqZ8eE5tAhDaXhTjHE4gWHvi7gYrTcdj462N) |
| Deploy + init factory | [`4TQms38…`](https://testnet.nearblocks.io/txns/4TQms38yEtimTGsyLFfc4jiSybrkAHy4UdBnUGKN3Zvn) |
| Set NVDA = $180.00 on mock Pyth | [`Gdii9bw…`](https://testnet.nearblocks.io/txns/Gdii9bweaakvMcNTMrXwLW1jMsaZymFwLZrWcDnzjoKs) |
| `create_meme` → `nvda.solidon.testnet` | [`7ZfTw8i…`](https://testnet.nearblocks.io/txns/7ZfTw8imsmMjvX6KVwWA6uoF3P6F6Px1pSQJnsZozdFA) |
| Mint 10,000 mock USDC to the creator | [`91Y7DjA…`](https://testnet.nearblocks.io/txns/91Y7DjAp3v2HkmXt21Q7tA3A6dtSQ9GvK34e7pu7HHBP) |
| Register the meme on USDC | [`DGSHmep…`](https://testnet.nearblocks.io/txns/DGSHmepTbQ5dGAzcT632Mji9WkQRZH194mQQPBz6R57P) |
| Seed the pool with 1,000 USDC | [`DZtspGE…`](https://testnet.nearblocks.io/txns/DZtspGEkA2WoMdLc7ewFuf2TrMDGtM6aQnhsGE4xDssR) |
| Smoke test: register creator on the meme | [`EXcRixQ…`](https://testnet.nearblocks.io/txns/EXcRixQbhNqeb7aH6TRWA5cLSqLufrqLpKc5nSLnATfj) |
| Smoke test: buy with 50 USDC, received exactly `quote_buy` | [`D7B6dQC…`](https://testnet.nearblocks.io/txns/D7B6dQC8fzzn4XLK7sHL3LC8KJwWbY62xr4831QPbmWL) |

### Known limits of the testnet deployment

- **Mock oracle.** `pyth-oracle.testnet` has no NVDA feed, and Hermes update endpoints (stable and beta) returned 401 without an API key on 9 Nov 2026. Anyone can set the mock price, so testnet mNAV numbers are a demo, not a market signal. Mainnet uses `pyth-oracle.near`.
- **Placeholder BSC tokens.** The stock list is immutable. When the BSC testnet mock tokens exist (Chain Signatures milestone), the factory account is deleted and recreated again with the real addresses.
- **The factory account still has a full-access key** during development, which could redeploy the factory. Launched memes have no access key at all. Before mainnet submission the factory's keys are deleted so the "no admin" claim holds for the factory too.
