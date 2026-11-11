"use client";

import { ArrowDown, ArrowUp, Plus, RefreshCw, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn } from "cn";
import { ChainStack, StockLogo } from "@/components/brand-logo";
import { Sparkline } from "@/components/history-charts";
import { MemeIcon } from "@/components/meme-icon";
import { MnavGauge, ZoneBadge } from "@/components/mnav-gauge";
import { Notice } from "@/components/notice";
import { Stat, StatRow } from "@/components/stat";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/lib/app-link";
import { STOCK_LOGOS } from "@/lib/brands";
import { FACTORY } from "@/lib/config";
import { fmtUsdCompact } from "@/lib/figure";
import { fmtUsd } from "@/lib/format";
import { fetchHistory, indexerHealth, type HistoryPoint } from "@/lib/indexer";
import { loadMarket, type MarketRow } from "@/lib/market";
import { fmtTimes } from "@/lib/mnav";
import { fmtPrice, fmtPriceLong } from "@/lib/price";
import { useAsync } from "@/lib/use-async";
import { TESTNET_VENUES } from "@/lib/venues";

const CHAINS = ["base", "robinhood", "solana"];

type SortKey = "treasury" | "mnav" | "price" | "nav" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "treasury", label: "Treasury value" },
  { key: "mnav", label: "mNAV" },
  { key: "price", label: "Price" },
  { key: "nav", label: "NAV per token" },
  { key: "name", label: "Name" },
];

function sortValue(r: MarketRow, k: SortKey): number | string {
  switch (k) {
    case "treasury":
      return r.nav.assetsUsd;
    case "mnav":
      return r.mnav ?? -1;
    case "price":
      return r.spotUsd ?? -1;
    case "nav":
      return r.nav.navUsd ?? -1;
    case "name":
      return r.symbol.toLowerCase();
  }
}

const int = (n: number) => String(Math.round(n));

/** The Markets tab: every meme on the factory as a sortable, searchable table. */
export function Markets() {
  const [fresh, setFresh] = useState(0);
  const market = useAsync(() => loadMarket(fresh > 0), [fresh]);
  const [query, setQuery] = useState("");
  const [stock, setStock] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("treasury");
  const [asc, setAsc] = useState(false);
  const searchId = useId();
  const sortId = useId();

  const rows = useMemo(() => market.data?.rows ?? [], [market.data]);
  // Seven days of price per meme from the keeper's indexer; nothing when it is down.
  const sparks = useAsync(async (): Promise<Record<string, HistoryPoint[] | null>> => {
    if (rows.length === 0 || !(await indexerHealth())) return {};
    const since = Date.now() / 1000 - 7 * 86_400;
    const entries = await Promise.all(rows.map(async (r) => [r.account, await fetchHistory(r.account, { since, limit: 500 })] as const));
    return Object.fromEntries(entries);
  }, [rows.map((r) => r.account).join(","), fresh]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!stock || r.ticker === stock) &&
        (!q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.account.includes(q) || (r.ticker ?? "").toLowerCase().includes(q)),
    );
    const sorted = [...list].sort((a, b) => {
      const x = sortValue(a, sort);
      const y = sortValue(b, sort);
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
      return (y as number) - (x as number);
    });
    return asc ? sorted.reverse() : sorted;
  }, [rows, query, stock, sort, asc]);

  const tickers = useMemo(() => {
    return Object.keys(TESTNET_VENUES).map((t) => ({ t, count: rows.filter((r) => r.ticker === t).length }));
  }, [rows]);

  const total = rows.reduce((s, r) => s + r.nav.assetsUsd, 0);
  const holding = rows.filter((r) => r.chainsHeld.length > 0).length;
  const stockTotal = rows.reduce((s, r) => s + r.nav.stockUsd, 0);

  const sortBy = (k: SortKey) => {
    if (k === sort) setAsc((a) => !a);
    else {
      setSort(k);
      setAsc(k === "name");
    }
  };

  return (
    <div className="wrap pt-10 pb-20 sm:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Markets</h1>
          <p className="mt-2 text-soft" aria-live="polite">
            {market.data ? `Every meme on ${FACTORY}, read live from NEAR.` : "Reading the factory on NEAR…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setFresh((f) => f + 1)} disabled={market.loading}>
            <RefreshCw className={cn(market.loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
          <AppLink href="/launch" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden />
            Launch a meme
          </AppLink>
        </div>
      </div>

      <StatRow className="mt-12">
        <Stat
          label="Treasury value"
          hint="Everything every meme's treasury holds: USDC on NEAR plus USDC and stock on each chain, from the ledgers, with stock at the oracle price."
          value={market.data ? total : null}
          format={fmtUsdCompact}
          sub={market.data ? `${fmtUsd(stockTotal)} of it in stock` : undefined}
        />
        <Stat label="Memes" hint="Memes deployed by the factory." value={market.data ? rows.length : null} format={int} sub={`on ${FACTORY}`} />
        <Stat
          label="Holding stock"
          hint="Memes whose ledger holds stock on at least one treasury chain."
          value={market.data ? holding : null}
          format={int}
          sub={market.data && rows.length ? `${Math.round((holding / rows.length) * 100)}% of memes` : undefined}
        />
        <Stat label="Stocks listed" hint="Stocks a new meme can pick as its thesis." value={Object.keys(TESTNET_VENUES).length} format={int} sub="Tradable on three chains" />
      </StatRow>

      {/* Toolbar */}
      <div className="mt-14 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <label htmlFor={searchId} className="sr-only">
            Search memes
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            id={searchId}
            type="search"
            className="field !min-h-10 pl-10"
            placeholder="Search memes or stocks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="group" aria-label="Filter by thesis stock">
          <button type="button" className="chip" aria-pressed={stock === null} onClick={() => setStock(null)}>
            All
          </button>
          {tickers.map(({ t, count }) => (
            <button
              key={t}
              type="button"
              className="chip !pl-1.5"
              aria-pressed={stock === t}
              onClick={() => setStock(stock === t ? null : t)}
              title={`${STOCK_LOGOS[t]?.name ?? t}: ${count} ${count === 1 ? "meme" : "memes"}`}
            >
              <StockLogo ticker={t} size={20} decorative />
              {t}
              {count > 0 && <span className="tabular-nums text-faint">{count}</span>}
            </button>
          ))}
        </div>
        <label htmlFor={sortId} className="sr-only">
          Sort by
        </label>
        <div className="relative shrink-0 md:hidden">
          <select id={sortId} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="field !min-h-10 cursor-pointer appearance-none !py-1 pr-8 !text-[0.8125rem]">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <ArrowDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-soft" aria-hidden />
        </div>
      </div>

      <div className="mt-5">
        {market.loading && !market.data ? (
          <TableSkeleton />
        ) : market.error ? (
          <Notice
            tone="error"
            title="The factory did not answer"
            action={
              <Button variant="outline" onClick={() => setFresh((f) => f + 1)}>
                Try again
              </Button>
            }
          >
            {market.error}. Check your connection, or NEXT_PUBLIC_FACTORY ({FACTORY}).
          </Notice>
        ) : rows.length === 0 ? (
          <Notice
            title="No memes yet. Yours could be first."
            action={
              <AppLink href="/launch" className={buttonVariants()}>
                Launch the first meme
              </AppLink>
            }
          >
            It takes a name, a ticker and a stock to believe in.
          </Notice>
        ) : (
          <>
            <MarketTable rows={shown} sort={sort} asc={asc} onSort={sortBy} sparks={sparks.data} />
            <MarketCards rows={shown} sparks={sparks.data} />
            {shown.length === 0 && (
              <Notice className="mt-3" title="No meme matches">
                Clear the search or pick another stock.
              </Notice>
            )}
          </>
        )}
        {market.data && market.data.failed.length > 0 && (
          <Notice className="mt-4" title={`${market.data.failed.length} meme could not be read`}>
            {market.data.failed.map((f) => `${f.account}: ${f.error}`).join("; ")}
          </Notice>
        )}
      </div>

      <p className="mt-6 text-sm text-soft">
        Missing yours?{" "}
        <AppLink href="/launch" className="link">
          Launch a meme
        </AppLink>{" "}
        in three transactions.
      </p>
    </div>
  );
}

function SortHead({ k, label, sort, asc, onSort, num }: { k: SortKey; label: string; sort: SortKey; asc: boolean; onSort: (k: SortKey) => void; num?: boolean }) {
  const on = sort === k;
  const Icon = asc ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={num ? "num" : undefined} aria-sort={on ? (asc ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort-btn" aria-pressed={on} onClick={() => onSort(k)}>
        {label}
        <Icon className={cn("size-3.5", !on && "opacity-0")} aria-hidden />
      </button>
    </th>
  );
}

type Sparks = Record<string, HistoryPoint[] | null> | undefined;

function MarketTable({ rows, sort, asc, onSort, sparks }: { rows: MarketRow[]; sort: SortKey; asc: boolean; onSort: (k: SortKey) => void; sparks: Sparks }) {
  const head = { sort, asc, onSort };
  return (
    <div className="panel overflow-hidden max-md:hidden">
      <table className="table">
        <caption className="sr-only">Memes and their treasuries</caption>
        <thead>
          <tr>
            <SortHead k="name" label="Meme" {...head} />
            <th scope="col">Thesis</th>
            <SortHead k="price" label="Price" num {...head} />
            <SortHead k="nav" label="NAV / token" num {...head} />
            <SortHead k="mnav" label="mNAV" {...head} />
            <SortHead k="treasury" label="Treasury" num {...head} />
            <th scope="col">Chains held</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.account} data-hover="true" className="row-in relative" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
              <td>
                <div className="flex items-center gap-3">
                  <MemeIcon icon={r.icon} symbol={r.symbol} size={34} />
                  <div className="min-w-0">
                    <AppLink href={`/meme/${r.account}`} className="after:absolute after:inset-0">
                      {r.symbol}
                    </AppLink>
                    <p className="max-w-[14rem] truncate text-xs text-soft">{r.name}</p>
                  </div>
                </div>
              </td>
              <td>
                {r.ticker ? (
                  <span className="flex items-center gap-2">
                    <StockLogo ticker={r.ticker} size={22} decorative />
                    <span className="leading-tight">
                      <span className="block text-sm">{r.ticker}</span>
                      <span className="block text-xs text-soft">{STOCK_LOGOS[r.ticker]?.name ?? "Listed stock"}</span>
                    </span>
                  </span>
                ) : (
                  <span className="text-soft">Unknown</span>
                )}
              </td>
              <td className="num" title={r.spotUsd !== null ? fmtPriceLong(r.spotUsd) : undefined}>
                <span className="inline-flex items-center justify-end gap-3">
                  <Sparkline points={sparks?.[r.account]} className="shrink-0 max-lg:hidden" />
                  {r.spotUsd !== null ? fmtPrice(r.spotUsd) : <span className="text-soft">Not seeded</span>}
                </span>
              </td>
              <td className="num" title={r.nav.navUsd !== null ? fmtPriceLong(r.nav.navUsd) : undefined}>
                {fmtPrice(r.nav.navUsd)}
              </td>
              <td>
                <div className="flex w-36 flex-col gap-1.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="tabular-nums">{fmtTimes(r.mnav)}</span>
                    <ZoneBadge zone={r.zone} fallback={r.seeded ? "New" : "Not seeded"} />
                  </span>
                  <MnavGauge value={r.mnav} thresholds={r.thresholds} size="sm" label={`${r.symbol} mNAV`} />
                </div>
              </td>
              <td className="num">{fmtUsd(r.nav.assetsUsd)}</td>
              <td>
                <ChainStack chains={CHAINS} active={r.chainsHeld} />
                <span className="sr-only">{r.chainsHeld.length ? `Holds stock on ${r.chainsHeld.join(", ")}` : "No stock bought yet"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketCards({ rows, sparks }: { rows: MarketRow[]; sparks: Sparks }) {
  return (
    <ul className="grid md:hidden">
      {rows.map((r) => (
        <li key={r.account} className="border-b border-line last:border-b-0">
          <AppLink href={`/meme/${r.account}`} className="block py-4">
            <div className="flex items-center gap-3">
              <MemeIcon icon={r.icon} symbol={r.symbol} size={38} />
              <div className="min-w-0 flex-1">
                <p>{r.symbol}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-soft">
                  <StockLogo ticker={r.ticker} size={14} decorative />
                  Holds {r.ticker ?? "?"}
                </p>
              </div>
              <Sparkline points={sparks?.[r.account]} className="shrink-0" />
              <ZoneBadge zone={r.zone} fallback={r.seeded ? "New" : "Not seeded"} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-soft">Price</dt>
                <dd className="tabular-nums">{fmtPrice(r.spotUsd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">mNAV</dt>
                <dd className="tabular-nums">{fmtTimes(r.mnav)}</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Treasury</dt>
                <dd className="tabular-nums">{fmtUsd(r.nav.assetsUsd)}</dd>
              </div>
            </dl>
            <MnavGauge value={r.mnav} thresholds={r.thresholds} size="sm" label={`${r.symbol} mNAV`} className="mt-3" />
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

function TableSkeleton() {
  return (
    <div className="panel grid gap-0 overflow-hidden" aria-busy aria-label="Loading memes">
      <Skeleton className="h-12 rounded-none" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 border-t border-line p-5">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-24 max-sm:hidden" />
        </div>
      ))}
    </div>
  );
}
