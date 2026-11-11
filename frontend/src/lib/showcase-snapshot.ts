// A frozen read of the live showcase meme (honey.solidon.testnet, 11 Nov 2026), so the landing's
// product visual renders at once and still works when the RPC is unreachable. The page swaps
// in a live read as soon as it arrives. Values are the raw view JSON, unedited.

import type { MemeSnapshot } from "./meme";
import { SHOWCASE_MEME } from "./site";

const RAW = {
  "metadata": {
    "spec": "ft-1.0.0",
    "name": "Honeypot",
    "symbol": "HONEY",
    "icon": "data:image/webp;base64,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",
    "reference": null,
    "reference_hash": null,
    "decimals": 18
  },
  "info": {
    "creator": "solidon-launch2.testnet",
    "usdc": "usdc.solidon.testnet",
    "oracle": "pyth.solidon.testnet",
    "stock": {
      "ticker": "NVDA",
      "price_id": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
      "venues": [
        {
          "chain": "base",
          "token": "0x8f13563130684478E617C1797308A081Cb2c2654",
          "decimals": 8,
          "solana": null
        },
        {
          "chain": "robinhood",
          "token": "0x82289af84B9a0faf598a4D2052E16c8D1619f7f4",
          "decimals": 18,
          "solana": null
        },
        {
          "chain": "solana",
          "token": "88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB",
          "decimals": 8,
          "solana": {
            "pool": "FEstNywAgrVXixWbLkFaqqMjT7jbdjwmkoPdmudtRCqU",
            "usdc_vault": "7QxxoL5DRDo2Q1Z6nvXkFa7Z55cN7r8YRyj4ig8i5sPB",
            "stock_vault": "2x5h8nw3sH9zEo7g8G3e3ub7n9GMXJWLvivrXtJ18BN6",
            "observation": "AggvhJqcKyXuGnW2xx52MeY3veqwsm4JSCVJDg1bfiVF",
            "bitmap_extension": "5nUE56LNNXaxeYwZWSfpWfD2qBLXmzy2F41nSrxBKhPu"
          }
        }
      ]
    }
  },
  "pool": {
    "meme_reserve": "558035714285714285714285716",
    "usdc_reserve": "1792000000",
    "treasury_usdc": "6400000",
    "spot_price": "3211263999999",
    "twap_price": null
  },
  "treasury": {
    "stock_units": "0",
    "treasury_usdc": "6400000",
    "circulating": "441964285714285714285714284",
    "redemption_open": false,
    "last_rebalance": 0,
    "next_rebalance": 3600,
    "last_nav": "0",
    "last_mnav_bps": "0",
    "epoch_cap": "0",
    "epoch_issued": "0"
  },
  "params": {
    "pool_fee_bps": 100,
    "treasury_fee_bps": 80,
    "creator_fee_bps": 20,
    "issuance_mnav_bps": 20000,
    "max_issuance_bps_per_epoch": 100,
    "epoch_secs": 86400,
    "buyback_mnav_bps": 10000,
    "redemption_mnav_bps": 9000,
    "cash_buffer_bps": 2000,
    "cash_refill_bps": 1000,
    "twap_window_secs": 1800,
    "oracle_max_age_secs": 900,
    "rebalance_cooldown_secs": 3600,
    "caller_tip_bps": 5,
    "target_leverage_bps": 10000
  },
  "paramsFromContract": true,
  "chains": {
    "address": null,
    "mpc": "v1.signer-prod.testnet",
    "signing": false,
    "chains": [
      {
        "config": {
          "name": "base",
          "chain_id": 84532,
          "usdc": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          "usdc_decimals": 6,
          "swap_router": "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
          "pool_fee": 3000,
          "max_fee_per_gas": "100000000",
          "max_priority_fee_per_gas": "1000000",
          "max_swap_usdc": "5000000",
          "proof": {
            "Mpc": {
              "foreign_chain": "Base",
              "finality": "Latest"
            }
          }
        },
        "venue": {
          "chain": "base",
          "token": "0x8f13563130684478E617C1797308A081Cb2c2654",
          "decimals": 8,
          "solana": null
        },
        "nonce": 0,
        "approved": false,
        "usdc": "0",
        "stock": "0",
        "in_transit": "0"
      },
      {
        "config": {
          "name": "robinhood",
          "chain_id": 46630,
          "usdc": "0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F",
          "usdc_decimals": 18,
          "swap_router": "0x3ce954107b1a675826b33bf23060dd655e3758fe",
          "pool_fee": 3000,
          "max_fee_per_gas": "100000000",
          "max_priority_fee_per_gas": "10000000",
          "max_swap_usdc": "5000000000000000000",
          "proof": "Relayer"
        },
        "venue": {
          "chain": "robinhood",
          "token": "0x82289af84B9a0faf598a4D2052E16c8D1619f7f4",
          "decimals": 18,
          "solana": null
        },
        "nonce": 0,
        "approved": false,
        "usdc": "0",
        "stock": "0",
        "in_transit": "0"
      }
    ],
    "solana": {
      "config": {
        "name": "solana",
        "usdc_mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        "usdc_token_program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "stock_token_program": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        "clmm_program": "devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH",
        "amm_config": "GVSwm4smQBYcgAJU7qjFHLQBHTc4AdB3F2HbZp6KqKof",
        "max_swap_usdc": "5000000"
      },
      "venue": {
        "chain": "solana",
        "token": "88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB",
        "decimals": 8,
        "solana": {
          "pool": "FEstNywAgrVXixWbLkFaqqMjT7jbdjwmkoPdmudtRCqU",
          "usdc_vault": "7QxxoL5DRDo2Q1Z6nvXkFa7Z55cN7r8YRyj4ig8i5sPB",
          "stock_vault": "2x5h8nw3sH9zEo7g8G3e3ub7n9GMXJWLvivrXtJ18BN6",
          "observation": "AggvhJqcKyXuGnW2xx52MeY3veqwsm4JSCVJDg1bfiVF",
          "bitmap_extension": "5nUE56LNNXaxeYwZWSfpWfD2qBLXmzy2F41nSrxBKhPu"
        }
      },
      "address": null,
      "usdc_account": null,
      "stock_account": null,
      "seq": 0,
      "usdc": "0",
      "stock": "0",
      "in_transit": "0",
      "last_buy": null
    }
  },
  "chainsNote": null,
  "price": {
    "price": "17282606149",
    "conf": "0",
    "expo": -8,
    "publish_time": 1794380274
  },
  "fetchedAt": 1794380747
};

export const SHOWCASE_SNAPSHOT: MemeSnapshot = { account: SHOWCASE_MEME, ...RAW } as unknown as MemeSnapshot; // raw view JSON carries extra fields
