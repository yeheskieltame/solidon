# spike

Scripts behind [docs/SPIKE.md](../../docs/SPIKE.md): each one calls the real service or chain and prints what actually happens. Python 3.10+, standard library only, read-only unless noted.

| Script | Checks |
| --- | --- |
| `s3_quotes.py` | Cost of buying each bStock on BSC mainnet (PancakeSwap QuoterV2) |
| `s5_prices.py` | Hermes endpoints and Pyth-compatible oracles on NEAR |
| `s6_intents.py` | 1Click token list, treasury-leg quote, `intents.near` views |
| `s6b_limits.py [recipient]` | 1Click entry quotes by route and size |
| `s8_foreign_tx_hash.py` | Reproduces an MPC foreign-tx payload hash from BSC RPC data |
| `s8_recover.py` | Recovers which MPC key signed a foreign-tx response |
| `s9_chainlink.py` | Chainlink equity feeds per chain and their freshness |
