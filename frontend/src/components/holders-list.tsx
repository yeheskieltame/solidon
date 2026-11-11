"use client";

import { MEME_DECIMALS, NEARBLOCKS } from "@/lib/config";
import { fmtCompact } from "@/lib/figure";
import { fmtRaw, shortAccount, toBig, toNumber } from "@/lib/format";
import type { MemeHolders } from "@/lib/indexer";
import { cn } from "cn";

const pct = (share: number | null) => (share === null ? "–" : share > 0 && share < 0.0001 ? "<0.01%" : `${(share * 100).toFixed(2)}%`);

function shareOf(raw: string | null, supply: string | null): number | null {
  const s = toBig(supply);
  return raw && s > 0n ? Number((toBig(raw) * 1_000_000n) / s) / 1_000_000 : null;
}

/** One line of the holders table: rank, account, amount, share of supply. */
function Row({ rank, label, title, href, you, raw, share, symbol, muted }: {
  rank: string;
  label: string;
  title?: string;
  href?: string;
  you?: boolean;
  raw: string;
  share: number | null;
  symbol: string;
  muted?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <span className="w-5 shrink-0 text-right text-[0.8125rem] text-faint tabular-nums">{rank}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" title={title} className={cn("truncate text-[0.9375rem] hover:text-blue-ink", muted && "text-soft")}>
            {label}
          </a>
        ) : (
          <span title={title} className={cn("truncate text-[0.9375rem]", muted && "text-soft")}>
            {label}
          </span>
        )}
        {you && <span className="pill pill-blue">You</span>}
      </span>
      <span className="shrink-0 text-right text-[0.8125rem] text-soft tabular-nums max-sm:hidden" title={`${fmtRaw(toBig(raw), MEME_DECIMALS, 6)} ${symbol}`}>
        {fmtCompact(toNumber(toBig(raw), MEME_DECIMALS))}
      </span>
      <span className="w-16 shrink-0 text-right text-[0.9375rem] tabular-nums">{pct(share)}</span>
    </li>
  );
}

/** Top holders from the indexer, with the pool's own reserve set apart at the end. */
export function HoldersList({ data, symbol, you }: { data: MemeHolders; symbol: string; you: string | null }) {
  return (
    <div className="max-w-[44rem]">
      {data.holders.length ? (
        <ul>
          {data.holders.map((h, i) => (
            <Row
              key={h.account}
              rank={String(i + 1)}
              label={shortAccount(h.account)}
              title={h.account}
              href={`${NEARBLOCKS}/address/${h.account}`}
              you={h.account === you}
              raw={h.balance}
              share={h.share}
              symbol={symbol}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[0.9375rem] text-soft">No one holds {symbol} outside the pool yet.</p>
      )}
      {data.pool_reserve && (
        <ul className="mt-4 border-t border-line">
          <Row rank="" label="Pool reserve" title="Tokens held by the contract's own AMM pool" raw={data.pool_reserve} share={shareOf(data.pool_reserve, data.total_supply)} symbol={symbol} muted />
        </ul>
      )}
      <p className="mt-4 text-[0.8125rem] text-faint">Share of total supply. Balances read on-chain for every account in the {symbol} event log, refreshed each minute.</p>
    </div>
  );
}

/** One-line summary for the Details row. */
export function holdersSummary(data: MemeHolders, symbol: string): string {
  const n = data.holders.length;
  if (!n) return `No ${symbol} holders outside the pool yet`;
  const top = data.holders[0].share;
  return `${n}${n >= 20 ? "+" : ""} holder${n === 1 ? "" : "s"}${top !== null ? `, the largest owns ${pct(top)} of supply` : ""}`;
}
