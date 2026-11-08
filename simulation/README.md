# simulation

60-day simulation of a Solidon meme against its stock, across the five scenarios in [docs/SPEC.md](../docs/SPEC.md#simulation-plan). It mirrors the meme contract: the x*y=k pool with a 1% USDC-side fee, the treasury (USDC cash + stock units), and the mNAV engine with the locked parameters.

**Results: [RESULTS.md](RESULTS.md)** (generated, with charts in `charts/`).

## Run

```bash
python3 simulation/sim.py
```

Python 3.10+, standard library only. Takes about 2 seconds. Writes `RESULTS.md` and `charts/*.svg`, and exits non-zero if any SPEC check fails, so it doubles as a test.

## Model

| Piece | How it is modelled |
| --- | --- |
| Day 0 | End of a 90-day launch: fresh pool seeded with 10,000 USDC and the full supply, hype buying, treasury built only by fees and issuance |
| Traders | Move the meme by 1.5x the stock's move, plus a hype drift per scenario and 5%/day noise |
| Sellers | Redeem at NAV while the redemption window is open and the pool pays less, sell the rest |
| Arbitrageurs | Buy below NAV in the pool and redeem, limited by the cash on hand |
| `rebalance()` | Every hour: TWAP over 30 minutes, then issuance (mNAV > 2.0, capped at 1% of circulating supply per 24 h, accretive only), buyback (mNAV < 1.0, cash above the 20% buffer only), redemption window (mNAV < 0.9) |
| Treasury | Cash above 20% of NAV buys stock; cash below 10% sells stock to refill to 20%. Every stock trade loses 1% to slippage |
| Oracle | Stale after 15 minutes without an update; no mNAV action while stale |

Each scenario runs 12 seeds; tables report the median and the worst seed.
