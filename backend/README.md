# backend

Node.js services that support the contracts. Neither holds a key that controls funds: the meme contract signs through Chain Signatures, and anyone can run these services.

| Service | Purpose |
| --- | --- |
| `relayer` | Broadcasts transactions signed by `v1.signer` to BNB Smart Chain |
| `spike` | Integration spike scripts behind [docs/SPIKE.md](../docs/SPIKE.md) |
| `keeper` | Calls `rebalance()` on every meme when its cooldown ends |

## relayer

```bash
node backend/relayer/relay.mjs <meme-account> [--network testnet|mainnet]
```

Node 18+, no dependencies. Reads the meme's treasury address and signed nonce, then sends every signed transaction the BSC chain has not mined yet (`get_signed_tx(nonce)` → `eth_sendRawTransaction`). Safe to run repeatedly or by several people at once. `NEAR_RPC` / `BSC_RPC` override the RPC URLs.

Keeper: not started. See the build plan in [docs/SPEC.md](../docs/SPEC.md#daily-build-plan).
