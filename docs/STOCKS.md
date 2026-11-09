# Supported stocks

> **Historical (BSC eliminated, 10 Nov 2026).** The treasury now lives on Base, Robinhood Chain and Solana; the factory lists stocks from `contracts/stocks/feeds.json` plus one venue registry per chain. This page records the bStocks verification of 9 Nov 2026. `bsc-mainnet.json` and `verify.py` were removed; they are in git history before the multichain migration.

The factory's stock list was immutable, so every entry was verified before it was deployed. Source of truth was `contracts/stocks/bsc-mainnet.json`; re-check from a commit that still has it:

```bash
python3 contracts/stocks/verify.py   # exits non-zero on any mismatch
```

Verified on 9 Nov 2026.

## Listed (8)

| Ticker | Company | bStock on BSC | Pyth feed | PancakeSwap v3 pool (USDT, 0.25%) | Pool balances | DexScreener liquidity |
| --- | --- | --- | --- | --- | --- | --- |
| NVDA | NVIDIA | [`NVDAB` 0x02Fc…7436](https://bscscan.com/token/0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436) | `b1073854…` | [0x8FB4…690C](https://bscscan.com/address/0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C) | 197,895 USDT + 22,083.7 NVDAB | $4.34M |
| AAPL | Apple | [`AAPLB` 0x431a…9b7A](https://bscscan.com/token/0x431a3BEE82E2ca41e49895CbECE5bB0F76A89b7A) | `49f6b65c…` | [0xe9b9…7365](https://bscscan.com/address/0xe9b9998B2EC5430D2246c7f1F8D9f298c97D7365) | 234,732 USDT + 399.6 AAPLB | $0.37M |
| MSFT | Microsoft | [`MSFTB` 0x8010…B9b0](https://bscscan.com/token/0x80106cb3EAD06659A5ad19DF39D9b4733863B9b0) | `d0ca23c1…` | [0x5018…e7Ea](https://bscscan.com/address/0x5018b018cEB7645c927c5Cf246786F89ebCbe7Ea) | 78,069 USDT + 82.2 MSFTB | $0.12M |
| GOOGL | Alphabet | [`GOOGLB` 0x3F53…3238](https://bscscan.com/token/0x3F53De71c126BdaBAe20f9cD64848d317f6C3238) | `5a48c03e…` | [0x8900…8144](https://bscscan.com/address/0x89001D846f7CA36EE089F73eEFC25657E1798144) | 400,253 USDT + 3,835.8 GOOGLB | $1.50M |
| AMZN | Amazon | [`AMZNB` 0x1a4b…eb00](https://bscscan.com/token/0x1a4b499833A79A09ad7Cf1D42D7DacF71e92eb00) | `b5d0e0fa…` | [0x7530…b6B1](https://bscscan.com/address/0x7530beb7Bde5843f668cf31b996fa1F748C9b6B1) | 105,433 USDT + 288.4 AMZNB | $0.18M |
| META | Meta Platforms | [`METAB` 0x7425…f4c0](https://bscscan.com/token/0x7425889FE94F9d693E8daefE88BCCed6AcFEf4c0) | `78a3e3b8…` | [0xC215…D80B](https://bscscan.com/address/0xC2151a561E928D16576d75Ea88544543ac63D80B) | 17,926 USDT + 151.0 METAB | $0.11M |
| TSLA | Tesla | [`TSLAB` 0x5b19…292f](https://bscscan.com/token/0x5b1910eAaD6450E50f816082Aa078C41F10C292f) | `16dad506…` | [0xB0f5…9c41](https://bscscan.com/address/0xB0f5E5400E8F0F7C242F2b7740C004f020579c41) | 783,747 USDT + 2,331.6 TSLAB | $1.62M |
| SPCX | SpaceX | [`SPCXB` 0xbe9D…03E1](https://bscscan.com/token/0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1) | `8a593d6e…` | [0x977D…5b4d](https://bscscan.com/address/0x977DaFFC095b33872E2741c19568925015C35b4d) | 262,313 USDT + 4,460.8 SPCXB | $0.87M |

Full addresses and feed IDs are in the JSON file. All tokens use 18 decimals.

## How each entry was verified

1. **Official source first.** Trust Wallet's bStocks announcement lists the launch tokens with truncated addresses (`TSLAB 0x5b19…292f`, `NVDAB 0x02fc…7436`, `CRCLB 0x80f3…ffc0`, `MUB 0xcdf2…2699`, `SNDKB 0x3ee4…50fb`), and the BNB Chain blog gives `SPCXB` in full (`0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1`). The full addresses found on DexScreener match these prefixes and suffixes exactly.
2. **Same issuer for the later listings.** AAPLB, MSFTB, GOOGLB, AMZNB, and METAB have no official full address published. Etherscan's contract-creation data shows that all eleven bStocks, including the six confirmed above, were created by the same deployer `0x64fdaf82d69d5a8ab409331e3042042e8a178d53` through the same factory `0xc90aeffa622de6f9b11d01184224d107934c9152`. Same-symbol fakes have different creators: `0x0236…fffF` "NVDAB" (meme launcher, creator `0x561e…e20c`) and `0x038a…6F59` "AAPLB" (creator `0x203c…96b5`).
3. **On-chain checks** (`verify.py`): `symbol()` and `decimals()`; the pool's `factory()` is the official PancakeSwap v3 factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` ([PancakeSwap developer docs](https://developer.pancakeswap.finance/contracts/v3/addresses)); the pool's `token0`/`token1` are exactly the bStock and USDT `0x55d398326f99059fF775485246999027B3197955`; `fee()` = 2500. The same-symbol fake NVDAB passes the symbol and decimals checks and fails only on the pool binding, which is why the pool check exists.
4. **Pyth feed** is the Hermes `/v2/price_feeds` entry whose symbol is exactly `Equity.US.<TICKER>/USD`.

## Not listed

| Ticker | Reason |
| --- | --- |
| CRCLB (Circle) | Verified, but not a large cap; can be added in a later factory |
| MUB (Micron) | Verified, but the USDT pool holds only ~3,400 USDT: a treasury swap would move the price |
| SNDKB (SanDisk) | Verified, but the USDT pool holds only ~8,900 USDT |

## Issuer powers (trust assumption)

The bStocks implementation (`SecuritiesToken`, behind an OpenZeppelin `BeaconProxy`) was read on 9 Nov 2026:

- **No allowlist.** Any address can hold and transfer, so a treasury address derived through Chain Signatures can hold bStocks. A live example: an ordinary address received NVDAB through an aggregator swap and later sent it on with a plain `transfer`.
- **Blocklist and sanctions list.** On every transfer, the compliance contract checks the sender, the receiver, and `msg.sender` (e.g. the PancakeSwap router). The issuer can block the treasury or the router.
- **Pause.** A pause manager can stop all transfers of one token or of every bStock.
- **Upgradeable.** The beacon owner can change the implementation, and the token admin can swap the compliance module (for example to an allowlist).
- **UI multiplier.** `uiMultiplier` (about 1.000778 for NVDAB) scales displayed balances for corporate actions. The treasury ledger values raw balances, so NAV is understated by that amount, which is the conservative direction.

Solidon cannot remove these powers. If a treasury is blocked or a token is paused, stock sales on BSC stop, the stock is still valued at the Pyth price, and redemptions draw only on the USDC cash buffer on NEAR. This is stated in the README threat model.
