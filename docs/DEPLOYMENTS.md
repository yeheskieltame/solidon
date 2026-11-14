# Deployments

## Base Sepolia (chain 84532, 10 Nov 2026)

Stock venues from `contracts/evm/deploy-testnet-stocks.py`, recorded in [`contracts/stocks/base-sepolia.json`](../contracts/stocks/base-sepolia.json). USDC [`0x036C…CF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) (6 decimals); Uniswap v3 SwapRouter02 [`0x94cC…2bc4`](https://sepolia.basescan.org/address/0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4). Synthetic tokens are Solidon `MockERC20`s (owner-only mint) with one-sided liquidity worth $50,000 starting at the reference price (Chainlink, Robinhood Chain mainnet).

| Ticker | Token | Kind | Pool (fee 0.3%) | Price |
| --- | --- | --- | --- | --- |
| NVDA | [`NVDAc` 0x8f13…2654](https://sepolia.basescan.org/address/0x8f13563130684478E617C1797308A081Cb2c2654) | synthetic | [0x93A7…3129](https://sepolia.basescan.org/address/0x93A765030deB0352d22EbBe8335A2B79aF153129) | $177.56 |
| AAPL | [`AAPLc` 0xEbF0…B9bD](https://sepolia.basescan.org/address/0xEbF01E9d3d578AD3af778C281E56aDA483ebB9bD) | synthetic | [0x0Fa2…ca4e](https://sepolia.basescan.org/address/0x0Fa222947220935106bA9C8Fed888B8Bfd74ca4e) | $350.44 |
| MSFT | [`MSFTc` 0x4fE9…2265](https://sepolia.basescan.org/address/0x4fE929688f9A5598bE4559daC9B92a9A05cD2265) | synthetic | [0x1791…6e16](https://sepolia.basescan.org/address/0x1791E60Fd6CDB6294366b8C92e34946a5a2B6e16) | $544.15 |
| GOOGL | [`GOOGLc` 0x12e7…7eeF](https://sepolia.basescan.org/address/0x12e763e9C1ceeb82f9AaCdf8a87b152bE05A7eeF) | synthetic | [0x0791…5A03](https://sepolia.basescan.org/address/0x07914c5774361f222bdCd991f0b872b7CF955A03) | $290.38 |
| AMZN | [`AMZNc` 0x9b93…32a3](https://sepolia.basescan.org/address/0x9b931cb9EE0A70b88d89b3c21687d4a6ccee32a3) | synthetic | [0x3F35…Fc58](https://sepolia.basescan.org/address/0x3F35161b0E85E3FFdA761c49Ad469b607B67Fc58) | $268.14 |
| META | [`METAc` 0x845A…477d](https://sepolia.basescan.org/address/0x845A964b112a33B6A0881b36e121fdDFFDe2477d) | synthetic | [0x6861…dDD5](https://sepolia.basescan.org/address/0x6861ADbEE1c0BBb1aaC9f7166fBe9828E26BdDD5) | $642.58 |
| TSLA | [`TSLAc` 0x4311…5Bc5](https://sepolia.basescan.org/address/0x431190511D177106Fa49588f7e1Dc3B845c95Bc5) | synthetic | [0xfF7b…59a4](https://sepolia.basescan.org/address/0xfF7b55617F5D24686139526588977A02eE5A59a4) | $376.77 |
| SPCX | [`SPCXc` 0x486F…5035](https://sepolia.basescan.org/address/0x486FECA986219f7d4eC52Cbf56d9ca14D4955035) | synthetic | [0xda6B…7f9f](https://sepolia.basescan.org/address/0xda6BFf78b5513b6818EDE36C1769363d99F07f9f) | $141.18 |

## Robinhood Chain testnet (chain 46630, 10 Nov 2026)

Stock venues from `contracts/evm/deploy-testnet-stocks.py`, recorded in [`contracts/stocks/hood-testnet.json`](../contracts/stocks/hood-testnet.json). USDC [`0xbf44…275F`](https://explorer.testnet.chain.robinhood.com/address/0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F) (18 decimals); Uniswap v3 SwapRouter02 [`0x3ce9…58fe`](https://explorer.testnet.chain.robinhood.com/address/0x3ce954107b1a675826b33bf23060dd655e3758fe). Synthetic tokens are Solidon `MockERC20`s (owner-only mint) with one-sided liquidity worth $50,000 starting at the reference price (Chainlink, Robinhood Chain mainnet). The faucet's official TSLA/AMZN trade at arbitrary testnet prices (~$0.07), so the maintainer chose synthetic tokens for all 8 here (10 Nov 2026); each pool also holds 0.01 USDC float for the fork's up-front protocol fee.

| Ticker | Token | Kind | Pool (fee 0.3%) | Price |
| --- | --- | --- | --- | --- |
| NVDA | [`NVDA` 0x8228…f7f4](https://explorer.testnet.chain.robinhood.com/address/0x82289af84B9a0faf598a4D2052E16c8D1619f7f4) | synthetic | [0x7AD2…6E07](https://explorer.testnet.chain.robinhood.com/address/0x7AD201DB77530864213f30Bd87Ddc2c520D86E07) | $177.56 |
| AAPL | [`AAPL` 0x3ab3…4057](https://explorer.testnet.chain.robinhood.com/address/0x3ab373732E7bE9fD387e767F0e36040677a14057) | synthetic | [0x9f34…8eD0](https://explorer.testnet.chain.robinhood.com/address/0x9f34D4E076DD19a36C36ff28DeA2F8C671D28eD0) | $350.44 |
| MSFT | [`MSFT` 0x8d26…7cdD](https://explorer.testnet.chain.robinhood.com/address/0x8d26425Ea6B44032938b290Bab5C032CaA747cdD) | synthetic | [0x2016…5fed](https://explorer.testnet.chain.robinhood.com/address/0x2016FfecC830012aaDB3B378b4D3b59829045fed) | $544.15 |
| GOOGL | [`GOOGL` 0xaf95…B98C](https://explorer.testnet.chain.robinhood.com/address/0xaf95AE21417c4a1489C7C49990a9C03DD3C6B98C) | synthetic | [0x116B…bddd](https://explorer.testnet.chain.robinhood.com/address/0x116B775D35C0A53708b515156eF962171411bddd) | $290.38 |
| AMZN | [`AMZN` 0x9f55…6A37](https://explorer.testnet.chain.robinhood.com/address/0x9f555Fa3247304bEd0033EC31c8d6A88c36c6A37) | synthetic | [0x7CEE…3cbF](https://explorer.testnet.chain.robinhood.com/address/0x7CEE8466204C628edBE122597DdB993753893cbF) | $268.14 |
| META | [`META` 0x4d65…7D53](https://explorer.testnet.chain.robinhood.com/address/0x4d65dBeD417B42Ecef039aF0931948bC07507D53) | synthetic | [0x4CFb…7fAE](https://explorer.testnet.chain.robinhood.com/address/0x4CFbc8761a81367C2BEAf301dc2DaAB142bD7fAE) | $642.58 |
| TSLA | [`TSLA` 0x3D3E…b47B](https://explorer.testnet.chain.robinhood.com/address/0x3D3E8Cf6F9F92b9a1574cdB4C5686261cF52b47B) | synthetic | [0x1691…8F9D](https://explorer.testnet.chain.robinhood.com/address/0x16916cACEb6be1107eF7AEDa3d8c5cE34C098F9D) | $376.77 |
| SPCX | [`SPCX` 0xf0c2…08E0](https://explorer.testnet.chain.robinhood.com/address/0xf0c264689aC444FFe95b9F03e8eFF2bA36E508E0) | synthetic | [0x1d28…fB81](https://explorer.testnet.chain.robinhood.com/address/0x1d285a27509Fa8eeC6ab8eac73635F4b270afB81) | $141.18 |

MPC treasury `0x680bcF5a2E3C07118991Adb3976d3dF077ed96EE` (`evm-treasury` of `creator.solidon.testnet`) on Robinhood testnet, all signed by `v1.signer-prod.testnet`:

| Step | Transaction | Result |
| --- | --- | --- |
| Swap 0.002 ETH → USDC (official WETH/USDC pool) | [`0x8398…ae8f`](https://explorer.testnet.chain.robinhood.com/tx/0x83988e34f6226a19100223871de76f81d8e65cd8d01da5df6e4f754b63c4ae8f) | 0.148 USDC |
| Buy synthetic NVDA with 0.1 USDC | [`0x06ea…1b76`](https://explorer.testnet.chain.robinhood.com/tx/0x06ea795dd8ec1881de369c3a8a1324603478c68f1d7581dc87ff9a75847b1b76) | 0.000562 NVDA, effective $177.82 (ref $177.56) |
| Buy synthetic TSLA with 0.02 USDC | [`0x7135…b86a`](https://explorer.testnet.chain.robinhood.com/tx/0x71359f6ae5fa4329637e7cc3fe5a516f06266b2232b0d42583d79afd188cb86a) | 0.00005313 TSLA, effective $376.42 (ref $376.77) |

Same treasury on Base Sepolia, with 20 Circle USDC from the faucet:

| Step | Transaction | Result |
| --- | --- | --- |
| Approve SwapRouter02 for 2 USDC | [`0xa594…5f93`](https://sepolia.basescan.org/tx/0xa594c733e4a575436017feea32171f8a587bcb87cf539f47fc0b1b0f57815f93) | status 1 |
| Buy synthetic NVDAc with 1 USDC | [`0xfd4b…1a18`](https://sepolia.basescan.org/tx/0xfd4b8d4ff855dad4d6c64d27190327eb29eebf1a0a9931ca4c2827d4c3d21a18) | 0.00563841 NVDAc, effective $177.35 (ref $177.56) |

## BSC testnet (chain 97, 9 Nov 2026) · historical

BSC was eliminated on 10 Nov 2026; the deploy script, registry and verifier below were removed from the tree and remain in git history. Mock bStocks and PancakeSwap v3 pools for testing the Chain Signatures flow, deployed with `contracts/evm/deploy-bsc-testnet.sh` (dry-run first on an anvil fork of BSC testnet). Registry: `contracts/stocks/bsc-testnet.json`; it was re-checked with `contracts/stocks/verify.py`.

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

## Solana devnet (10 Nov 2026)

Stock venues from `backend/solana-spike/1_setup.js`, recorded in [`contracts/stocks/solana-devnet.json`](../contracts/stocks/solana-devnet.json). Circle devnet USDC [`4zMM…ncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet); Raydium CLMM devnet program `devi51…EAtH`, AMM config `GVSw…qKof` (0.05%). Synthetic Token-2022 mints (8 decimals, on-chain metadata) with one-sided liquidity worth $50,000 from the reference price (Chainlink, Robinhood Chain mainnet) to about 2×.

| Ticker | Mint | Pool | Reference |
| --- | --- | --- | --- |
| NVDA | [`NVDAx` 88Bs…SqbB](https://explorer.solana.com/address/88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB?cluster=devnet) | [FEst…RCqU](https://explorer.solana.com/address/FEstNywAgrVXixWbLkFaqqMjT7jbdjwmkoPdmudtRCqU?cluster=devnet) | $176.59 |
| AAPL | [`AAPLx` FtYH…GkW5](https://explorer.solana.com/address/FtYHpjhYBFVrUE1inx7w48Wp1s7AzxnsFptvpgZcGkW5?cluster=devnet) | [8Htc…ypsV](https://explorer.solana.com/address/8HtcC4dszMQcnrPvow8iYF6aNDTigtFsZ8PP4BiRypsV?cluster=devnet) | $350.44 |
| MSFT | [`MSFTx` Bah7…G4SP](https://explorer.solana.com/address/Bah7NyVk64eL7ADuHuJYwqKeG6vQTD5YRPQKLMtzG4SP?cluster=devnet) | [EhyA…Xsdv](https://explorer.solana.com/address/EhyAxindqL3HiK6VPXjpJtrxKHgh2kJkePML3r5cXsdv?cluster=devnet) | $544.15 |
| GOOGL | [`GOOGLx` XLYZ…8AnH](https://explorer.solana.com/address/XLYZw9YeVrUNsp4dAVVYayMdT5jWrmk6wFjUNWu8AnH?cluster=devnet) | [5dRj…ftu9](https://explorer.solana.com/address/5dRjF2Zpc7crjrqp8NzrpntYnhGTVcLFN5QumB2iftu9?cluster=devnet) | $290.38 |
| AMZN | [`AMZNx` D4GV…ERZk](https://explorer.solana.com/address/D4GVCzUpbJRkqQ4ymbpXxKTC5jCxWK1gRvDXwRAHERZk?cluster=devnet) | [6pRZ…mVhK](https://explorer.solana.com/address/6pRZ79bnqssPy3HhyN3TijrCjXoqzZ4auD77kcM5mVhK?cluster=devnet) | $268.14 |
| META | [`METAx` 66aQ…rKj8](https://explorer.solana.com/address/66aQ8CyXmgYkvreikf76EzETQC4oVgv9bbdxbPgFrKj8?cluster=devnet) | [EgV8…6JLA](https://explorer.solana.com/address/EgV8KMGkUbzpLZUru3ivLi9Cx7YgxxhtopxcDFQC6JLA?cluster=devnet) | $642.58 |
| TSLA | [`TSLAx` 229y…kmSq](https://explorer.solana.com/address/229y3sTgdfFBEWGxmuvQ4yvpj8puVrpmeSFNp7ZRkmSq?cluster=devnet) | [8cZf…qm2o](https://explorer.solana.com/address/8cZfaL77SdxBZPc3SVPe7mrmNpqPJa61ixqqjsBqqm2o?cluster=devnet) | $376.77 |
| SPCX | [`SPCXx` 8mdb…QDKp](https://explorer.solana.com/address/8mdbWErQneCkM6jpE5epezYrk8W6uhjjG9nnPwxLQDKp?cluster=devnet) | [3uwo…CF5K](https://explorer.solana.com/address/3uwogu11qDBBw7mSVFHdTFq1YXnMrgaah1bYjuAJCF5K?cluster=devnet) | $141.18 |

MPC treasury `GXhnfvC6yYEXgYEtSwEZNfKF2tcCd7vFn5onqEyK2UH5` (`solana-treasury` of `creator.solidon.testnet`, EdDSA), funded with 20 Circle USDC from the faucet:

| Step | Transaction | Result |
| --- | --- | --- |
| Buy synthetic NVDAx with 1 USDC (hand-built Raydium `swap_v2`, 715-byte message, MPC-signed in 9 s) | [`EwX4QEFx…`](https://explorer.solana.com/tx/EwX4QEFxQ1g3UiUQn5vbH5WnVWecK4xFMzJ3UTP5A4xK4k9tDVtvLyCEuKvVfF5hRBmoKVNoosXSJ9wr3JdU4a9?cluster=devnet) | 0.00566387 NVDAx, effective $176.56 (ref $176.59) |

## NEAR testnet: multichain factory (10 Nov 2026)

`solidon.testnet` was deleted ([`HAfX5mqe…`](https://testnet.nearblocks.io/txns/HAfX5mqeQvYd6uGgZRnshKpqM8tmCGmXFFxYs7KD4WEL), balance to `creator.solidon.testnet`), recreated from the faucet ([`3DnM6oEM…`](https://testnet.nearblocks.io/txns/3DnM6oEMkNZPnUHQ7J7z3ej6DyqkCnWhitmZWDsL2K1F)) and redeployed with `contracts/deploy-testnet.sh` ([`CYi1g5sa…`](https://testnet.nearblocks.io/txns/CYi1g5sauKmN9SGxX6hLrjtxqsTNU2iwvaZqsYpvzvZ5)): 3 treasury chains (Base Sepolia, Robinhood testnet, Solana devnet), 8 stocks with one venue per chain, MPC `v1.signer-prod.testnet`, bridge and relayer `keeper.solidon.testnet` (created [`6MjksnEj…`](https://testnet.nearblocks.io/txns/6MjksnEjnTxs8FVXKh6qNGUaYqiiBGFy9QAF7qzmKPEu)). The mock oracle is fed live Chainlink prices by the keeper (`backend/keeper`). `launch_cost` = 4.46 NEAR.

### End to end: one meme holds NVDA on all three chains

Test meme [`e2etest.solidon.testnet`](https://testnet.nearblocks.io/address/e2etest.solidon.testnet) ("Solidon E2E Test", thesis NVDA), launched by `creator.solidon.testnet` ([`3xMXCNqH…`](https://testnet.nearblocks.io/txns/3xMXCNqHddRwByJHD9wtsEBZm6URKZfz6dABriZ3b2gm)), seeded with 1,000 mock USDC and bought with 500 + 200 + 300 USDC. Every treasury step below was signed by the NEAR MPC at the meme contract's request; the keeper only broadcast and bridged. EVM treasury `0x582be22a62a466284817298848be90bf8a6f37e4` (Base and Robinhood), Solana treasury `BnhYneFsvh45UDJy7B7CVwvdAev1p1gNzGjWdf9KERNV`.

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

Holdings after the run (ledger = minOut booked at signing; on-chain = the token's `balanceOf` / token account):

| Chain | Ledger NVDA | On-chain NVDA |
| --- | --- | --- |
| Base Sepolia | 0.02965417 | 0.03032966 |
| Robinhood testnet | 0.01060760 | 0.01082210 |
| Solana devnet | 0.02770371 | 0.02831835 |

The ledger is below the on-chain balance on every chain, as designed for swaps that land. (A swap that reverts stays booked: see the threat model in docs/SPEC.md.)

### Featured meme: Honeypot ($HONEY)

[`honey.solidon.testnet`](https://testnet.nearblocks.io/address/honey.solidon.testnet), thesis NVDA, is the meme now shown on the landing. Its art is a GPU chip in a leather jacket and a sly fox agent, in `frontend/public/memes/honeypot.webp`; the full image, shrunk to 64 px, is the on-chain icon. It was launched on 11 Nov 2026 by `solidon-launch2.testnet` (funded by the NEAR faucet).

| Step | Transaction |
| --- | --- |
| `create_meme` (4.46 NEAR) | [`39tFsQd…`](https://testnet.nearblocks.io/txns/39tFsQdK9mAyDfHoDGhPLiJfyjStZkmyc5STN4Yk2v63) |
| Seed 1,000 USDC | [`ESpLZ6i…`](https://testnet.nearblocks.io/txns/ESpLZ6i4hzUQqJctzNhpqwn4cC2NiCbtSXbhmehw1gCR) |
| Buys of 400, 150 and 250 USDC | [`BifYJTF…`](https://testnet.nearblocks.io/txns/BifYJTF14ueCuNx9dtYdYP1PJwXL1tsvyXK8xoaSPKcW), [`H3XmCrx…`](https://testnet.nearblocks.io/txns/H3XmCrxbfxmXLLeohrUKKFTMKJx2dWwcSwqL8Ds7GFeE), [`EE4QubF…`](https://testnet.nearblocks.io/txns/EE4QubFpfHo1pRqCB3114jfWhRWjESCfxKz5xNehbd8G) |

`honeypot.solidon.testnet` is an abandoned first try: it was launched with a cropped icon, and meme icons are immutable, so it was replaced by `$HONEY`. It holds only its 1,000 USDC seed. Spydia (below) stays live, but it is no longer featured.

### Spydia ($SPYDIA)

[`spydia.solidon.testnet`](https://testnet.nearblocks.io/address/spydia.solidon.testnet), thesis NVDA, is the meme shown on the landing. It was launched on 11 Nov 2026 by `solidon-launch.testnet`, a testnet account funded by the NEAR faucet. Its 64 px icon is stored on-chain, and the full art is in `frontend/public/memes/spydia.webp`. The keeper picked it up without any change: `init_treasury`, `init_solana_treasury`, then `approve_router`.

| Step | Transaction |
| --- | --- |
| `create_meme` (4.46 NEAR) | [`HBUBuW5…`](https://testnet.nearblocks.io/txns/HBUBuW54haTS8VxAnWxLxrgDMfdS6N9haSF2ndbQURXu) |
| Seed 1,000 USDC | [`HCBnzsT…`](https://testnet.nearblocks.io/txns/HCBnzsTtGsu9hnCnpBctpZA52R2rwFU3CMTpcRsnBoi8) |
| Buys of 400, 150 and 250 USDC | [`4RNCs63…`](https://testnet.nearblocks.io/txns/4RNCs63GFb5Q33nmwM9FA2y9a78zdc577KRDZYs6Bdb3), [`H67hFSt…`](https://testnet.nearblocks.io/txns/H67hFStpeQhYeyMMAY2J2Qrazf6WUGWPLyYs4zSnNgPd), [`9qGqv8S…`](https://testnet.nearblocks.io/txns/9qGqv8SZmVHADnR9Rryjh83gZiGtborChBMA872o3uHr) |

### The Floor Is Lava ($FLOOR)

[`floor.solidon.testnet`](https://testnet.nearblocks.io/address/floor.solidon.testnet), thesis TSLA, was launched on 13 Nov 2026 from the app's Launch page with a demo wallet (`19d6c2e1…3a27`), as recorded in the demo video. Its EVM treasury is [`0x68c1e3ad…bb72`](https://sepolia.basescan.org/address/0x68c1e3adc85bf1fcb60697dbef01db4521dbbb72). The production keeper skips it on purpose (`KEEPER_SKIP_MEMES`), so its cash stays on NEAR and it can demonstrate the buyback and redemption rules without stock moving.

| Step | Transaction |
| --- | --- |
| `create_meme` (4.46 NEAR, name, symbol, TSLA, icon) | [`FYksRfS…`](https://testnet.nearblocks.io/txns/FYksRfSVMa3NogLoxszJU3QMNiRgpDe366ZYTZYJ6oN6) |
| Seed 100 USDC | [`8omCZa5…`](https://testnet.nearblocks.io/txns/8omCZa5MGSYmBJS77bwhNjmv8CsvCGyUBqeHbtdg7bg1) |
| `init_treasury` | [`9PZPgpf…`](https://testnet.nearblocks.io/txns/9PZPgpfYhfBQ7kS3NSyuDUZbKqjzNWN9YVbtqMKugT9c) |

## NEAR testnet (history)

### Current factory (9 Nov 2026, second deploy)

Deployed with the BSC version of [`contracts/deploy-testnet.sh`](../contracts/deploy-testnet.sh). The factory lists the 8 verified stocks from `contracts/stocks/bsc-mainnet.json` (now removed). No meme is launched by the script: memes are launched from the launchpad. The multichain contracts (Base + Robinhood Chain) take different init args (`chains` instead of `bsc`), so they need a fresh factory account; `DRY_RUN=1 contracts/deploy-testnet.sh` prints those args.

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
