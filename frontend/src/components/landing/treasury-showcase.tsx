"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";
import { StockLogo } from "@/components/brand-logo";
import { Composition, compositionOf } from "@/components/composition";
import { MemeIcon } from "@/components/meme-icon";
import { MnavGauge, ZoneBadge } from "@/components/mnav-gauge";
import { Stat } from "@/components/stat";
import { STOCK_LOGOS } from "@/lib/brands";
import { fmtUsdCompact } from "@/lib/figure";
import { summarize, loadMemeCached } from "@/lib/market";
import { fmtTimes, mnavSentence } from "@/lib/mnav";
import { fmtPrice } from "@/lib/price";
import { SHOWCASE_SNAPSHOT } from "@/lib/showcase-snapshot";
import { MEME_ART, SHOWCASE_MEME, appUrl } from "@/lib/site";
import { useAsync } from "@/lib/use-async";

/**
 * The hero's product visual: the featured meme's art beside its live balance sheet, in the
 * app's own language. Renders a frozen snapshot first, then the live read.
 */
export function TreasuryShowcase() {
  const live = useAsync(() => loadMemeCached(SHOWCASE_MEME), []);
  const isLive = !!live.data;
  const row = summarize(live.data ?? SHOWCASE_SNAPSHOT);
  const { nav } = row;
  const ticker = row.ticker ?? "NVDA";
  const art = MEME_ART[SHOWCASE_MEME];

  return (
    <div className="rounded-[20px] bg-card p-5 text-left sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 text-[1.75rem] font-light tracking-[-0.03em] sm:text-[2.25rem]">
          <MemeIcon icon={row.icon} symbol={row.symbol} size={44} />
          <span>{row.symbol}</span>
          <span className="h-8 w-px bg-line-strong" aria-hidden />
          <StockLogo ticker={ticker} size={44} decorative />
          <span>{ticker}</span>
          <span className="sr-only">({STOCK_LOGOS[ticker]?.name})</span>
          <ZoneBadge zone={row.zone} className="ml-1 self-center max-sm:hidden" />
        </div>
        <span className="flex items-center gap-2 text-sm text-soft" aria-live="polite">
          <span className={cn("live-dot", !isLive && "!bg-faint after:hidden")} aria-hidden />
          {isLive ? "Live on NEAR testnet" : "Snapshot from NEAR testnet"}
        </span>
      </div>

      <div className="mt-8 grid items-start gap-x-10 gap-y-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {art && (
          <figure className="meme-poster mx-auto w-full max-w-[17rem]">
            <Image src={art.src} alt={art.alt} width={1024} height={1024} sizes="(min-width: 1024px) 17rem, 80vw" className="rounded-2xl" />
            <figcaption className="mt-3 text-center text-sm text-soft">The more you buy, the more they spy.</figcaption>
          </figure>
        )}
        <div className="min-w-0">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-7">
            <Stat label="Treasury value" value={nav.assetsUsd} format={fmtUsdCompact} size="md" />
            <Stat label="Price" text={fmtPrice(nav.priceUsd)} size="md" />
            <Stat label="NAV / token" text={fmtPrice(nav.navUsd)} size="md" />
            <Stat label="mNAV" text={fmtTimes(row.mnav)} size="md" />
          </dl>

          <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <div className="panel p-5">
              <p className="text-sm text-soft">mNAV against the locked rules</p>
              <MnavGauge value={row.mnav} thresholds={row.thresholds} className="mt-2" />
              <p className="mt-1 text-sm text-ink-2">{mnavSentence(row.mnav, row.thresholds, ticker)}</p>
            </div>
            <div>
              <p className="text-sm text-soft">Where the treasury sits</p>
              <div className="mt-3">
                <Composition slices={compositionOf(row)} total={nav.assetsUsd} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Link href={appUrl(`/meme/${SHOWCASE_MEME}`)} className="link mt-4 inline-block text-sm">
        Open the full balance sheet
      </Link>
    </div>
  );
}
