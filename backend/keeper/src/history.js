// Pure price-history math: one snapshot per meme from its views, computed exactly as the meme
// contract does (`Meme::assets`, `Meme::nav` in contracts/meme/src/mnav.rs; the same formulas as
// frontend/src/lib/math.ts `estimateNav`), and the downsampling of a history. No I/O.
import { ledgerChains, priceToNumber, stockValue, USDC_DECIMALS } from "./logic.js";

/** Pool prices are USDC raw per meme raw scaled by 1e30 (`twap::PRICE_SCALE`). */
export const PRICE_SCALE = 10n ** 30n;
export const MEME_DECIMALS = 18;

/** A 1e30-scaled price as USD per whole meme token (shift 30 - 18 + 6 = 18). */
export const scaledToUsd = (scaled) => Number(BigInt(scaled)) / 10 ** (30 - MEME_DECIMALS + USDC_DECIMALS);

/**
 * Treasury value in 6-decimal USDC at price `p` (bigint), as `Meme::assets`: NEAR cash, plus USDC
 * on or in transit to every chain, plus stock on every chain at one price. `null` without a usable
 * price. A pre-multichain meme (no `get_treasury_chains`) holds `stock_units` at 18 decimals.
 */
export function treasuryAssets(treasury, tc, p) {
  if (!p) return null;
  let total = BigInt(treasury.treasury_usdc);
  if (tc === undefined || tc === null) {
    const v = stockValue(treasury.stock_units, p, 18);
    return v === null ? null : total + v;
  }
  for (const c of ledgerChains(tc)) {
    total += BigInt(c.usdc) / 10n ** BigInt(c.config.usdc_decimals - USDC_DECIMALS) + BigInt(c.in_transit);
    if (c.venue) {
      const v = stockValue(c.stock, p, c.venue.decimals);
      if (v === null) return null;
      total += v;
    }
  }
  return total;
}

/**
 * One history point from a meme's views (`get_pool`, `get_treasury`, `get_treasury_chains`) and
 * the oracle price. `price` is the pool spot, `twap` the 30-minute TWAP (null while the pool is
 * young), `mnav` = (TWAP, else spot) / NAV as the contract's rebalance uses it. `oracle_stale`
 * is true when `p` came from `get_price_unsafe` because the fresh read returned nothing.
 */
export function snapshotOf({ t, pool, treasury, tc, price, oracleStale = false }) {
  const spot = BigInt(pool.spot_price);
  const twap = pool.twap_price === null || pool.twap_price === undefined ? null : BigInt(pool.twap_price);
  const assets = treasuryAssets(treasury, tc, price);
  const circ = BigInt(treasury.circulating);
  const navScaled = assets !== null && assets > 0n && circ > 0n ? (assets * PRICE_SCALE) / circ : null;
  const ref = twap ?? spot;
  const chains = {};
  if (tc) for (const c of ledgerChains(tc)) chains[c.config.name] = String(c.stock);
  else chains.all = String(treasury.stock_units);
  return {
    t,
    price: scaledToUsd(spot),
    twap: twap === null ? null : scaledToUsd(twap),
    nav: navScaled === null ? null : scaledToUsd(navScaled),
    mnav: navScaled === null || ref === 0n ? null : Number((ref * 1_000_000n) / navScaled) / 1e6,
    stock_price: price ? priceToNumber(price) : null,
    oracle_stale: oracleStale,
    treasury_value: assets === null ? null : Number(assets) / 10 ** USDC_DECIMALS,
    circulating: Number(circ) / 10 ** MEME_DECIMALS,
    chains,
  };
}

/**
 * Keeps every point younger than `keepSecs` (24 h) and, before that, the first point of each
 * `bucketSecs` (15 min) bucket. Input and output are ascending by `t`.
 */
export function downsample(points, now, { keepSecs = 86_400, bucketSecs = 900 } = {}) {
  const out = [];
  let lastBucket = null;
  for (const p of points) {
    if (p.t >= now - keepSecs) {
      out.push(p);
      continue;
    }
    const b = Math.floor(p.t / bucketSecs);
    if (b !== lastBucket) {
      out.push(p);
      lastBucket = b;
    }
  }
  return out;
}
