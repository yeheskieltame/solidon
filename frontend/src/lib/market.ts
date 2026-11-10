// One row per meme for the Markets table, the landing stats and the portfolio: everything
// derived from a MemeSnapshot with the same math the meme page uses. Pure, plus a small
// in-memory cache so Markets, Dashboard and the landing share one read per meme.

import { ledgerHoldings, normaliseTreasury, type TreasuryChain } from "./chains";
import { toBig } from "./format";
import { estimateNav, lastMnav, scaledToUsd, type NavEstimate } from "./math";
import { loadMeme, type MemeSnapshot } from "./meme";
import { zoneOf, type Thresholds, type Zone } from "./mnav";
import { factory } from "./near";

export type MarketRow = {
  account: string;
  symbol: string;
  name: string;
  icon: string | null;
  ticker: string | null;
  seeded: boolean;
  /** Spot pool price in USD per token, null before the seed. */
  spotUsd: number | null;
  nav: NavEstimate;
  /** Live mNAV, else the contract's last one. */
  mnav: number | null;
  zone: Zone | null;
  thresholds: Thresholds;
  chains: TreasuryChain[];
  /** Chain keys whose ledger holds some stock. */
  chainsHeld: string[];
  redemptionOpen: boolean;
  snap: MemeSnapshot;
};

export function thresholdsOf(snap: MemeSnapshot): Thresholds {
  return {
    redemption: snap.params.redemption_mnav_bps / 10_000,
    buyback: snap.params.buyback_mnav_bps / 10_000,
    issuance: snap.params.issuance_mnav_bps / 10_000,
  };
}

export function summarize(snap: MemeSnapshot): MarketRow {
  const { metadata, info, pool, treasury } = snap;
  const chains = normaliseTreasury(snap.chains, info?.stock ?? null);
  const nav = estimateNav(pool, treasury, ledgerHoldings(chains, treasury?.stock_units), snap.price);
  const seeded = pool ? toBig(pool.usdc_reserve) > 0n : false;
  const mnav = nav.mnav ?? lastMnav(treasury);
  const thresholds = thresholdsOf(snap);
  return {
    account: snap.account,
    symbol: metadata.symbol,
    name: metadata.name,
    icon: metadata.icon,
    ticker: info?.stock.ticker ?? null,
    seeded,
    spotUsd: seeded && pool ? scaledToUsd(toBig(pool.spot_price)) : null,
    nav,
    mnav,
    zone: zoneOf(mnav, thresholds),
    thresholds,
    chains,
    chainsHeld: chains.filter((c) => (c.ledgerStock ?? 0n) > 0n).map((c) => c.key),
    redemptionOpen: !!treasury?.redemption_open,
    snap,
  };
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; p: Promise<MemeSnapshot> }>();

/** `loadMeme` with a 30-second cache; `fresh` forces a new read. */
export function loadMemeCached(account: string, fresh = false): Promise<MemeSnapshot> {
  const hit = cache.get(account);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = loadMeme(account);
  cache.set(account, { at: Date.now(), p });
  p.catch(() => cache.delete(account));
  return p;
}

export type MarketLoad = { rows: MarketRow[]; failed: { account: string; error: string }[] };

/** Every meme on the factory, summarised. A meme that fails to load is reported, not thrown. */
export async function loadMarket(fresh = false): Promise<MarketLoad> {
  const accounts = await factory.memes();
  const settled = await Promise.allSettled(accounts.map((a) => loadMemeCached(a, fresh)));
  const rows: MarketRow[] = [];
  const failed: MarketLoad["failed"] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") rows.push(summarize(s.value));
    else failed.push({ account: accounts[i], error: s.reason instanceof Error ? s.reason.message : String(s.reason) });
  });
  return { rows, failed };
}
