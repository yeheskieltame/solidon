// A frozen read of the live showcase meme (spydia.solidon.testnet, 11 Nov 2026), so the landing's
// product visual renders at once and still works when the RPC is unreachable. The page swaps
// in a live read as soon as it arrives. Values are the raw view JSON, unedited.

import type { MemeSnapshot } from "./meme";
import { SHOWCASE_MEME } from "./site";

const RAW = {
  "metadata": {
    "spec": "ft-1.0.0",
    "name": "Spydia",
    "symbol": "SPYDIA",
    "icon": "data:image/webp;base64,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",
    "reference": null,
    "reference_hash": null,
    "decimals": 18
  },
  "info": {
    "creator": "solidon-launch.testnet",
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
    "address": "0xc8c8407717e388ed21e5b2fd5a047c6743318c50",
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
        "nonce": 1,
        "approved": true,
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
      "address": "5DdM4FKEsvLwjr2t2GZGxpwg8D3RN9HQoCo4Lpd51Xmr",
      "usdc_account": "57TkKEcfxg5wLYnK4oEsxkmbq4FHhXGMpEtrLuBq8BU5",
      "stock_account": "BwLBidsksUtbmdunobCBbqLxcrAYYfNZodRWddAAHDuh",
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
    "publish_time": 1794379543
  },
  "fetchedAt": 1794379555
};

export const SHOWCASE_SNAPSHOT: MemeSnapshot = { account: SHOWCASE_MEME, ...RAW } as unknown as MemeSnapshot; // raw view JSON carries extra fields
