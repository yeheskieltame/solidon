"use client";

import { ArrowDown, Plus, RefreshCw, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn } from "cn";
import { ChainStack, StockLogo } from "@/components/brand-logo";
import { CountUp } from "@/components/count-up";
import { MemeIcon } from "@/components/meme-icon";
import { MnavGauge, ZoneBadge } from "@/components/mnav-gauge";
import { Notice } from "@/components/notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/lib/app-link";
import { STOCK_LOGOS } from "@/lib/brands";
import { FACTORY } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
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

/** The Markets tab: every meme on the factory as a sortable, searchable table. */
export function Markets() {
  const [fresh, setFresh] = useState(0);
  const market = useAsync(() => loadMarket(fresh > 0), [fresh]);
  const [query, setQuery] = useState("");
  const [stock, setStock] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("treasury");
  const searchId = useId();
  const sortId = useId();

  const rows = useMemo(() => market.data?.rows ?? [], [market.data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!stock || r.ticker === stock) &&
        (!q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.account.includes(q) || (r.ticker ?? "").toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort);
      const y = sortValue(b, sort);
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
      return (y as number) - (x as number);
    });
  }, [rows, query, stock, sort]);

  const tickers = useMemo(() => {
    const present = new Set(rows.map((r) => r.ticker).filter(Boolean) as string[]);
    return Object.keys(TESTNET_VENUES).map((t) => ({ t, count: rows.filter((r) => r.ticker === t).length, present: present.has(t) }));
  }, [rows]);

  const total = rows.reduce((s, r) => s + r.nav.assetsUsd, 0);
  const holding = rows.filter((r) => r.chainsHeld.length > 0).length;

  return (
    <div className="wrap pt-8 pb-16 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Markets</h1>
          <p className="mt-1.5 text-soft" aria-live="polite">
            {market.data
              ? `${rows.length} ${rows.length === 1 ? "meme" : "memes"} on ${FACTORY}, read live from NEAR.`
              : "Reading the factory on NEAR…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFresh((f) => f + 1)} disabled={market.loading}>
            <RefreshCw className={cn(market.loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
          <AppLink href="/launch" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden />
            Launch a meme
          </AppLink>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-[var(--shadow-xs)]">
        {[
          { k: "Memes", v: market.data ? rows.length : null, f: (n: number) => String(Math.round(n)) },
          { k: "Treasury value", v: market.data ? total : null, f: fmtUsd },
          { k: "Holding stock", v: market.data ? holding : null, f: (n: number) => String(Math.round(n)) },
        ].map((s) => (
          <div key={s.k} className="bg-card px-4 py-3.5 sm:px-5">
            <dt className="text-xs text-soft">{s.k}</dt>
            <dd className="type-num mt-1 text-xl sm:text-2xl">
              <CountUp value={s.v} format={s.f} />
            </dd>
          </div>
        ))}
      </dl>

      {/* Toolbar */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <label htmlFor={searchId} className="sr-only">
            Search memes
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            id={searchId}
            type="search"
            className="field !min-h-10 !rounded-full pl-10"
            placeholder="Search by ticker, name or stock"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0" role="group" aria-label="Filter by thesis stock">
            <button type="button" className="chip" aria-pressed={stock === null} onClick={() => setStock(null)}>
              All stocks
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
                {count > 0 && <span className="tabular-nums opacity-60">{count}</span>}
              </button>
            ))}
          </div>
          <label htmlFor={sortId} className="sr-only">
            Sort by
          </label>
          <div className="relative">
            <select
              id={sortId}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="field !min-h-[2.125rem] cursor-pointer appearance-none !rounded-full !py-1 pr-8 !text-[0.8125rem]"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
            <ArrowDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-soft" aria-hidden />
          </div>
        </div>
      </div>

      <div className="mt-4">
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
            <MarketTable rows={shown} />
            <MarketCards rows={shown} />
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

      <AppLink
        href="/launch"
        className="card-lift mt-4 flex items-center justify-between gap-4 rounded-2xl border border-dashed border-line-strong bg-card/60 p-4 sm:p-5"
      >
        <span className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-ink text-white" aria-hidden>
            <Plus className="size-5" />
          </span>
          <span>
            <span className="block font-medium">Launch your own</span>
            <span className="block text-sm text-soft">Three transactions, one small treasury company.</span>
          </span>
        </span>
        <span className="text-sm font-medium text-blue-ink max-sm:hidden">Start</span>
      </AppLink>
    </div>
  );
}

function MarketTable({ rows }: { rows: MarketRow[] }) {
  return (
    <div className="card overflow-hidden max-md:hidden">
      <table className="table">
        <caption className="sr-only">Memes and their treasuries</caption>
        <thead>
          <tr>
            <th scope="col">Meme</th>
            <th scope="col">Thesis</th>
            <th scope="col" className="num">
              Price
            </th>
            <th scope="col" className="num">
              NAV / token
            </th>
            <th scope="col">mNAV</th>
            <th scope="col" className="num">
              Treasury
            </th>
            <th scope="col">Chains held</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
              <tr key={r.account} className="row-in relative" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                <td>
                  <div className="flex items-center gap-3">
                    <MemeIcon icon={r.icon} symbol={r.symbol} size={36} />
                    <div className="min-w-0">
                      <AppLink href={`/meme/${r.account}`} className="font-medium after:absolute after:inset-0 hover:underline">
                        {r.symbol}
                      </AppLink>
                      <p className="max-w-[14rem] truncate text-xs text-soft">{r.name}</p>
                    </div>
                  </div>
                </td>
                <td>
                  {r.ticker ? (
                    <span className="flex items-center gap-2">
                      <StockLogo ticker={r.ticker} size={24} decorative />
                      <span className="leading-tight">
                        <span className="block text-sm font-medium">{r.ticker}</span>
                        <span className="block text-xs text-soft">{STOCK_LOGOS[r.ticker]?.name ?? "Listed stock"}</span>
                      </span>
                    </span>
                  ) : (
                    <span className="text-soft">Unknown</span>
                  )}
                </td>
                <td className="num font-medium" title={r.spotUsd !== null ? fmtPriceLong(r.spotUsd) : undefined}>
                  {r.spotUsd !== null ? fmtPrice(r.spotUsd) : <span className="text-soft">Not seeded</span>}
                </td>
                <td className="num" title={r.nav.navUsd !== null ? fmtPriceLong(r.nav.navUsd) : undefined}>
                  {fmtPrice(r.nav.navUsd)}
                </td>
                <td>
                  <div className="flex w-36 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium tabular-nums">{fmtTimes(r.mnav)}</span>
                      <ZoneBadge zone={r.zone} fallback={r.seeded ? "New" : "Not seeded"} />
                    </span>
                    <MnavGauge value={r.mnav} thresholds={r.thresholds} size="sm" label={`${r.symbol} mNAV`} />
                  </div>
                </td>
                <td className="num font-medium">{fmtUsd(r.nav.assetsUsd)}</td>
                <td>
                  <ChainStack chains={CHAINS} active={r.chainsHeld} />
                  <span className="sr-only">
                    {r.chainsHeld.length ? `Holds stock on ${r.chainsHeld.join(", ")}` : "No stock bought yet"}
                  </span>
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketCards({ rows }: { rows: MarketRow[] }) {
  return (
    <ul className="grid gap-3 md:hidden">
      {rows.map((r) => (
        <li key={r.account}>
          <AppLink href={`/meme/${r.account}`} className="card card-lift block p-4">
            <div className="flex items-center gap-3">
              <MemeIcon icon={r.icon} symbol={r.symbol} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.symbol}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-soft">
                  <StockLogo ticker={r.ticker} size={14} decorative />
                  Holds {r.ticker ?? "?"}
                </p>
              </div>
              <ZoneBadge zone={r.zone} fallback={r.seeded ? "New" : "Not seeded"} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-soft">Price</dt>
                <dd className="font-medium tabular-nums">{fmtPrice(r.spotUsd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">mNAV</dt>
                <dd className="font-medium tabular-nums">{fmtTimes(r.mnav)}</dd>
              </div>
              <div>
                <dt className="text-xs text-soft">Treasury</dt>
                <dd className="font-medium tabular-nums">{fmtUsd(r.nav.assetsUsd)}</dd>
              </div>
            </dl>
            <MnavGauge value={r.mnav} thresholds={r.thresholds} size="sm" label={`${r.symbol} mNAV`} className="mt-3" />
            <div className="mt-3 flex items-center justify-between text-xs text-soft">
              <span>Chains held</span>
              <ChainStack chains={CHAINS} active={r.chainsHeld} size={20} />
            </div>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

function TableSkeleton() {
  return (
    <div className="card grid gap-0 overflow-hidden" aria-busy aria-label="Loading memes">
      <Skeleton className="h-10 rounded-none" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 border-t border-line p-4">
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-24 max-sm:hidden" />
        </div>
      ))}
    </div>
  );
}
