// The meme contract's arithmetic, mirrored in bigint so quotes match exactly
// (contracts/meme/src/pool.rs and mnav.rs).

import { MEME_DECIMALS, USDC_DECIMALS } from "./config";
import { toBig } from "./format";
import type { Params, PoolView, PythPrice, TreasuryView } from "./near";

const BPS = 10_000n;
/** Prices are USDC raw per meme raw, scaled by 1e30 (`twap::PRICE_SCALE`). */
export const PRICE_SCALE = 10n ** 30n;

export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn + amountIn === 0n) return 0n;
  return (amountIn * reserveOut) / (reserveIn + amountIn);
}

/** Total fee (treasury + creator) on a USDC amount, rounded down like `split_fee`. */
function fee(usdc: bigint, p: Params): bigint {
  return (usdc * BigInt(p.pool_fee_bps)) / BPS;
}

/** Meme out for `usdcIn`, after the 1% fee. Same as the `quote_buy` view. */
export function quoteBuy(usdcIn: bigint, pool: PoolView, p: Params): bigint {
  const net = usdcIn - fee(usdcIn, p);
  return amountOut(net, toBig(pool.usdc_reserve), toBig(pool.meme_reserve));
}

/** USDC out for `memeIn`, after the 1% fee. Same as the `quote_sell` view. */
export function quoteSell(memeIn: bigint, pool: PoolView, p: Params): bigint {
  const gross = amountOut(memeIn, toBig(pool.meme_reserve), toBig(pool.usdc_reserve));
  return gross - fee(gross, p);
}

export function withSlippage(out: bigint, slippageBps: number): bigint {
  return (out * (BPS - BigInt(slippageBps))) / BPS;
}

/** A 1e30-scaled price (USDC raw per meme raw) as USD per whole token. */
export function scaledToUsd(scaled: bigint): number {
  // USD per token = scaled / 1e30 * 10^MEME / 10^USDC
  const shift = 30 - MEME_DECIMALS + USDC_DECIMALS; // 18
  return Number(scaled) / 10 ** shift;
}

/** Price impact of a buy, from spot before and the average execution price. */
export function priceImpact(spotUsd: number, paidUsd: number, receivedTokens: number): number {
  if (!spotUsd || !receivedTokens) return 0;
  const avg = paidUsd / receivedTokens;
  return avg / spotUsd - 1;
}

/** Value of `units` of a stock with `decimals` in USD, at an oracle price. */
export function stockUsd(units: bigint, decimals: number, p: PythPrice | null): number | null {
  if (!p) return null;
  const price = Number(p.price) * 10 ** p.expo;
  if (!(price > 0)) return null;
  return (Number(units) / 10 ** decimals) * price;
}

export function oracleUsd(p: PythPrice | null): number | null {
  if (!p) return null;
  const v = Number(p.price) * 10 ** p.expo;
  return v > 0 ? v : null;
}

export type ChainHolding = {
  usdcRaw: bigint;
  usdcDecimals: number;
  stockRaw: bigint;
  stockDecimals: number;
};

export type NavEstimate = {
  /** Treasury value in USD: NEAR cash + per-chain USDC + stock at the oracle price. */
  assetsUsd: number;
  cashUsd: number;
  chainUsdcUsd: number;
  stockUsd: number;
  circulating: number;
  /** USD per token, null when nothing circulates. */
  navUsd: number | null;
  /** Pool price / NAV, from the TWAP when available, else spot. */
  mnav: number | null;
  priceUsd: number;
  usesTwap: boolean;
  /** Share of assets held as USDC cash on NEAR. */
  cashShare: number | null;
};

/**
 * Live NAV, computed in the browser the way `Meme::assets` and `Meme::nav` do.
 * Returns null fields where an input is missing; never throws.
 */
export function estimateNav(
  pool: PoolView | null,
  treasury: TreasuryView | null,
  holdings: ChainHolding[],
  price: PythPrice | null,
): NavEstimate {
  const cashUsd = treasury
    ? Number(toBig(treasury.treasury_usdc)) / 10 ** USDC_DECIMALS
    : pool
      ? Number(toBig(pool.treasury_usdc)) / 10 ** USDC_DECIMALS
      : 0;
  let chainUsdcUsd = 0;
  let stockTotal = 0;
  for (const h of holdings) {
    chainUsdcUsd += Number(h.usdcRaw) / 10 ** h.usdcDecimals;
    stockTotal += stockUsd(h.stockRaw, h.stockDecimals, price) ?? 0;
  }
  const assetsUsd = cashUsd + chainUsdcUsd + stockTotal;
  const circulating = treasury ? Number(toBig(treasury.circulating)) / 10 ** MEME_DECIMALS : 0;
  const navUsd = circulating > 0 && assetsUsd > 0 ? assetsUsd / circulating : null;
  const twap = pool?.twap_price ? toBig(pool.twap_price) : null;
  const spot = pool ? toBig(pool.spot_price) : 0n;
  const priceUsd = scaledToUsd(twap ?? spot);
  return {
    assetsUsd,
    cashUsd,
    chainUsdcUsd,
    stockUsd: stockTotal,
    circulating,
    navUsd,
    mnav: navUsd ? priceUsd / navUsd : null,
    priceUsd,
    usesTwap: twap !== null,
    cashShare: assetsUsd > 0 ? cashUsd / assetsUsd : null,
  };
}

/** The contract's last mNAV, or null before the first rebalance. */
export function lastMnav(t: TreasuryView | null): number | null {
  if (!t) return null;
  const bps = toBig(t.last_mnav_bps);
  return bps > 0n ? Number(bps) / 10_000 : null;
}
