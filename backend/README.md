# backend

Node.js services that support the contracts. Neither holds a key that controls funds: the meme contract signs through Chain Signatures, and anyone can run these services.

| Service | Purpose |
| --- | --- |
| `relayer` | Broadcasts transactions signed by `v1.signer` to BNB Smart Chain |
| `keeper` | Calls `rebalance()` on every meme when its cooldown ends |

Status: not started. See the build plan in [docs/SPEC.md](../docs/SPEC.md#daily-build-plan).
