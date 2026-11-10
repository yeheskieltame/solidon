// Portfolio aggregation for the Dashboard: the connected account's balance in every meme,
// valued at the pool (what selling would roughly fetch) and at NAV (what the treasury backs).

import { MEME_DECIMALS, USDC, USDC_DECIMALS } from "./config";
import { toBig, toNumber } from "./format";
import type { MarketRow } from "./market";
import { quoteSell } from "./math";
import { tryView } from "./near";

export type Position = {
  row: MarketRow;
  balance: bigint;
  claimable: bigint;
  /** Tokens as a plain number, for display. */
  tokens: number;
  /** Spot price × balance. */
  valueAtPrice: number | null;
  /** USDC a full sell would return now, after the fee and price impact. */
  sellQuoteUsd: number | null;
  /** NAV per token × balance. */
  valueAtNav: number | null;
  /** Share of circulating supply, so of the treasury's NAV. */
  shareOfTreasury: number | null;
  /** True when the redemption window is open and the account holds tokens. */
  redeemable: boolean;
};

export type Portfolio = {
  usdc: bigint;
  positions: Position[];
  totals: { atPrice: number; atNav: number; claimableUsd: number; sellQuoteUsd: number };
};

export function toPosition(row: MarketRow, balance: bigint, claimable: bigint): Position {
  const tokens = toNumber(balance, MEME_DECIMALS);
  const pool = row.snap.pool;
  const sell = pool && row.seeded && balance > 0n ? quoteSell(balance, pool, row.snap.params) : null;
  return {
    row,
    balance,
    claimable,
    tokens,
    valueAtPrice: row.spotUsd !== null ? tokens * row.spotUsd : null,
    sellQuoteUsd: sell !== null ? toNumber(sell, USDC_DECIMALS) : null,
    valueAtNav: row.nav.navUsd !== null ? tokens * row.nav.navUsd : null,
    shareOfTreasury: row.nav.circulating > 0 ? tokens / row.nav.circulating : null,
    redeemable: row.redemptionOpen && balance > 0n,
  };
}

export function aggregate(usdc: bigint, positions: Position[]): Portfolio {
  const totals = positions.reduce(
    (t, p) => ({
      atPrice: t.atPrice + (p.valueAtPrice ?? 0),
      atNav: t.atNav + (p.valueAtNav ?? 0),
      claimableUsd: t.claimableUsd + toNumber(p.claimable, USDC_DECIMALS),
      sellQuoteUsd: t.sellQuoteUsd + (p.sellQuoteUsd ?? 0),
    }),
    { atPrice: 0, atNav: 0, claimableUsd: 0, sellQuoteUsd: 0 },
  );
  const sorted = [...positions].sort((a, b) => (b.valueAtPrice ?? 0) - (a.valueAtPrice ?? 0));
  return { usdc, positions: sorted, totals };
}

/** Reads the account's USDC and, for every meme, its balance and claimable USDC. */
export async function loadPortfolio(accountId: string, rows: MarketRow[]): Promise<Portfolio> {
  const [usdc, perMeme] = await Promise.all([
    tryView<string>(USDC, "ft_balance_of", { account_id: accountId }),
    Promise.all(
      rows.map(async (row) => {
        const [bal, claim] = await Promise.all([
          tryView<string>(row.account, "ft_balance_of", { account_id: accountId }),
          tryView<string>(row.account, "claimable_of", { account_id: accountId }),
        ]);
        return toPosition(row, toBig(bal), toBig(claim));
      }),
    ),
  ]);
  return aggregate(
    toBig(usdc),
    perMeme.filter((p) => p.balance > 0n || p.claimable > 0n),
  );
}
