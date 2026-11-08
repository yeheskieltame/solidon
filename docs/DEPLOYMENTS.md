# Deployments

## NEAR testnet (9 Nov 2026)

Deployed with [`contracts/deploy-testnet.sh`](../contracts/deploy-testnet.sh) from commit `c6b550f` plus the script itself.

| Account | Contract | Code hash |
| --- | --- | --- |
| [`solidon.testnet`](https://testnet.nearblocks.io/address/solidon.testnet) | `factory` | `Cb9EthLrmMG8rNTLDHGh9Ga5de8qLPbFagLijLJK1qBZ` |
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

### Try it

```bash
NET="network-config testnet"
near contract call-function as-read-only solidon.testnet get_memes json-args '{}' $NET now
near contract call-function as-read-only nvda.solidon.testnet get_pool json-args '{}' $NET now
near contract call-function as-read-only nvda.solidon.testnet get_treasury json-args '{}' $NET now
# Free test USDC for any account:
near contract call-function as-transaction usdc.solidon.testnet mint json-args '{"account_id":"<you>.testnet","amount":"1000000000"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as <you>.testnet $NET sign-with-keychain send
```

### Known limits of the testnet deployment

- **Mock oracle.** `pyth-oracle.testnet` has no NVDA feed, and Hermes update endpoints (stable and beta) returned 401 without an API key on 9 Nov 2026. Anyone can set the mock price, so testnet mNAV numbers are a demo, not a market signal. Mainnet uses `pyth-oracle.near`.
- **Placeholder BSC token.** The stock list is immutable. When the BSC testnet mock token exists (Chain Signatures milestone), a new factory is deployed with the real address.
- **The factory account still has a full-access key** during development, which could redeploy the factory. Launched memes have no access key at all. Before mainnet submission the factory's keys are deleted so the "no admin" claim holds for the factory too.
