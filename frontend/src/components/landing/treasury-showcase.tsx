"use client";

import { BadgeCheck, Radio } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { ChainLogo, LogoTile, StockLogo } from "@/components/brand-logo";
import { CountUp } from "@/components/count-up";
import { MemeIcon } from "@/components/meme-icon";
import { MnavGauge, ZoneBadge } from "@/components/mnav-gauge";
import { PLATFORM_LOGOS, STOCK_LOGOS } from "@/lib/brands";
import { fmtRaw, fmtUsd } from "@/lib/format";
import { summarize, loadMemeCached } from "@/lib/market";
import { stockUsd } from "@/lib/math";
import { mnavSentence } from "@/lib/mnav";
import { fmtPrice } from "@/lib/price";
import { chainProof } from "@/lib/proof";
import { SHOWCASE_SNAPSHOT } from "@/lib/showcase-snapshot";
import { SHOWCASE_MEME, appUrl } from "@/lib/site";
import { useAsync } from "@/lib/use-async";

const CHAIN_TINT: Record<string, string> = {
  base: "#0000ff",
  robinhood: "#b8e600",
  solana: "#9945ff",
};

/**
 * The hero's product visual: the live balance sheet of the test meme that holds NVDA on
 * three chains. Renders a frozen snapshot first, then swaps in the live read.
 */
export function TreasuryShowcase() {
  const live = useAsync(() => loadMemeCached(SHOWCASE_MEME), []);
  const isLive = !!live.data;
  const row = summarize(live.data ?? SHOWCASE_SNAPSHOT);
  const { nav, snap } = row;
  const ticker = row.ticker ?? "NVDA";
  const held = row.chains.map((c) => {
    const usd = c.ledgerStock !== null ? (stockUsd(c.ledgerStock, c.stockDecimals, snap.price) ?? 0) : 0;
    return { c, usd, proof: chainProof(snap.chains, c.key) };
  });
  const stockTotal = held.reduce((s, h) => s + h.usd, 0);
  const allocation = [
    ...held.map((h) => ({ key: h.c.key, label: h.c.meta.label, usd: h.usd, color: CHAIN_TINT[h.c.key] ?? "#888" })),
    { key: "cash", label: "USDC on NEAR", usd: nav.cashUsd, color: "#2775ca" },
  ];

  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-card text-left">
      {/* Identity */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MemeIcon icon={row.icon} symbol={row.symbol} size={40} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold tracking-tight">
              {row.symbol}
              <ZoneBadge zone={row.zone} />
            </p>
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-soft">
              Holds
              <StockLogo ticker={ticker} size={16} decorative />
              <span className="font-medium text-ink">{ticker}</span>
              {STOCK_LOGOS[ticker] && <span className="max-sm:hidden">({STOCK_LOGOS[ticker].name})</span>}
            </p>
          </div>
        </div>
        <span className="pill" aria-live="polite">
          <span className={cn("live-dot", !isLive && "!bg-faint after:hidden")} aria-hidden />
          {isLive ? "Live on NEAR testnet" : "Snapshot from NEAR testnet"}
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Balance sheet headline */}
        <div className="border-line p-4 sm:p-6 lg:border-r">
          <p className="kicker">Treasury value</p>
          <p className="type-num mt-1 text-[2.5rem] sm:text-5xl">
            <CountUp value={nav.assetsUsd} format={fmtUsd} />
          </p>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-line py-4">
            {[
              ["Price", fmtPrice(nav.priceUsd)],
              ["NAV / token", fmtPrice(nav.navUsd)],
              ["mNAV", row.mnav !== null ? `${row.mnav >= 100 ? Math.round(row.mnav) : row.mnav.toFixed(2)}×` : "–"],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-soft">{k}</dt>
                <dd className="mt-0.5 truncate text-[0.9375rem] font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <MnavGauge value={row.mnav} thresholds={row.thresholds} className="mt-3" />
          <p className="mt-1 text-[0.8125rem] leading-snug text-soft">{mnavSentence(row.mnav, row.thresholds, ticker)}</p>
        </div>

        {/* Holdings by chain */}
        <div className="p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="kicker">Holdings by chain</p>
            <p className="text-xs text-soft">{fmtUsd(stockTotal)} of {ticker}</p>
          </div>
          <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {allocation.map((a) => (
              <span
                key={a.key}
                className="bar-fill h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(a.usd / Math.max(nav.assetsUsd, 1e-9)) * 100}%`, background: a.color }}
              />
            ))}
          </div>
          <ul className="mt-3 divide-y divide-line">
            {held.map(({ c, usd, proof }) => (
              <li key={c.key} className="flex items-center gap-3 py-2.5">
                <ChainLogo chain={c.key} size={30} decorative />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.meta.label}</p>
                  <p className="truncate text-xs text-soft tabular-nums">
                    {c.ledgerStock !== null ? fmtRaw(c.ledgerStock, c.stockDecimals, 6) : "–"} {c.stockSymbol ?? ticker}
                  </p>
                </div>
                <span className={cn("pill max-[420px]:hidden", proof.kind === "mpc" ? "pill-green" : "pill-orange")}>
                  {proof.kind === "mpc" ? <BadgeCheck aria-hidden /> : <Radio aria-hidden />}
                  {proof.kind === "mpc" ? "MPC-proven" : "Relayer"}
                </span>
                <span className="w-16 text-right text-sm font-semibold tabular-nums">{fmtUsd(usd)}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 py-2.5">
              <LogoTile logo={PLATFORM_LOGOS.usdc} size={30} decorative />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Cash buffer on NEAR</p>
                <p className="truncate text-xs text-soft">USDC for redemptions</p>
              </div>
              <span className="w-16 text-right text-sm font-semibold tabular-nums">{fmtUsd(nav.cashUsd)}</span>
            </li>
          </ul>
          <Link href={appUrl(`/meme/${SHOWCASE_MEME}`)} className="link mt-2 inline-block text-sm">
            Open the full balance sheet
          </Link>
        </div>
      </div>
    </div>
  );
}
