// A frozen read of the live test meme (e2etest.solidon.testnet, 10 Nov 2026), so the landing's
// product visual renders at once and still works when the RPC is unreachable. The page swaps
// in a live read as soon as it arrives. Values are the raw view JSON, unedited.

import { DEFAULT_PARAMS } from "./near";
import type { MemeSnapshot } from "./meme";
import { SHOWCASE_MEME } from "./site";

const NVDA = {
  ticker: "NVDA",
  price_id: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  venues: [
    { chain: "base", token: "0x8f13563130684478E617C1797308A081Cb2c2654", decimals: 8 },
    { chain: "robinhood", token: "0x82289af84B9a0faf598a4D2052E16c8D1619f7f4", decimals: 18 },
    { chain: "solana", token: "88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB", decimals: 8 },
  ],
};

export const SHOWCASE_SNAPSHOT: MemeSnapshot = {
  account: SHOWCASE_MEME,
  metadata: { name: "Solidon E2E Test", symbol: "E2ETEST", icon: null, decimals: 18 },
  info: { creator: "creator.solidon.testnet", usdc: "usdc.solidon.testnet", oracle: "pyth.solidon.testnet", stock: NVDA },
  pool: {
    meme_reserve: "504378967571570805688442154",
    usdc_reserve: "1982636201",
    treasury_usdc: "3056445",
    spot_price: "3930846305003",
    twap_price: "3924857843458",
  },
  treasury: {
    stock_units: "67965479388825590",
    treasury_usdc: "3056445",
    circulating: "498932069217726853174434100",
    redemption_open: false,
    last_rebalance: 1794272721,
    next_rebalance: 1794276321,
    last_nav: "30726952516",
    last_mnav_bps: "1266663",
    epoch_cap: "3311036789297658862876254",
    epoch_issued: "3311036789297658862876254",
  },
  params: DEFAULT_PARAMS,
  paramsFromContract: true,
  chains: {
    address: "0x582be22a62a466284817298848be90bf8a6f37e4",
    mpc: "v1.signer-prod.testnet",
    signing: false,
    chains: [
      {
        config: { name: "base", chain_id: 84532, usdc_decimals: 6, proof: { Mpc: { foreign_chain: "Base" } } },
        venue: NVDA.venues[0],
        nonce: 3,
        approved: true,
        usdc: "0",
        stock: "2965417",
        in_transit: "0",
      },
      {
        config: { name: "robinhood", chain_id: 46630, usdc_decimals: 18, proof: "Relayer" },
        venue: NVDA.venues[1],
        nonce: 2,
        approved: true,
        usdc: "0",
        stock: "10607599388825590",
        in_transit: "0",
      },
    ],
    solana: {
      config: { name: "solana" },
      address: "BnhYneFsvh45UDJy7B7CVwvdAev1p1gNzGjWdf9KERNV",
      venue: NVDA.venues[2],
      usdc: "0",
      stock: "2770371",
      in_transit: "0",
    },
    solana_address: "BnhYneFsvh45UDJy7B7CVwvdAev1p1gNzGjWdf9KERNV",
  },
  chainsNote: null,
  price: { price: "18059488133", conf: "0", expo: -8, publish_time: 1794274580 },
  fetchedAt: 1794301000,
};
