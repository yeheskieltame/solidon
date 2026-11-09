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
| `s11_oneclick_routes.py` | Tokenized stocks in 1Click; minimum size of USDC on NEAR → stablecoin per chain |
| `s12_base_stocks.py` | Coinbase tokenized stocks on Base: cost by size, gap to Chainlink |
| `solana-mints.json` | Verified Solana mints (xStocks, Backpack, Ondo) |
| `s15_robinhood_tokens.py` | Robinhood Chain stock tokens: on-chain metadata |
| `s16_hood_chainlink.py [hours]` | Chainlink feeds on Robinhood Chain, found from on-chain events |
| `s17_costs.py` | Minimum cost of one full cycle per chain |
| `s19_hood_feeds.py` | Official Chainlink proxies on Robinhood Chain, checked on-chain |
| `s20_pyth_key.py` | Hermes with an API key: equity entitlement |
| `s21_solana_mpc.py [signer]` | NEAR MPC EdDSA signs a Solana devnet transfer (**sends testnet transactions**) |
| `s22_multichain.py` | Base swap from the MPC treasury (state override), SPCX pool vs Chainlink, Pyth push accounts and xStock pools on Solana |
| `s23_evm_mpc.py base-sepolia\|hood-testnet` | NEAR MPC signs and broadcasts an EVM tx from the treasury (**sends testnet transactions**) |
| `rpc.py` | Alchemy JSON-RPC helper; reads `ALCHEMY_API_KEY`, never prints it |
