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
import { fetchEpochStart } from "@/lib/indexer";
import { toBig } from "@/lib/format";
import { engineState, fmtTimes, mnavSentence } from "@/lib/mnav";
import { fmtPrice } from "@/lib/price";
import { SHOWCASE_SNAPSHOT } from "@/lib/showcase-snapshot";
import { MEME_ART, SHOWCASE_MEME, appUrl } from "@/lib/site";
import { useAsync } from "@/lib/use-async";

/**
 * The hero's product visual: the featured meme's live balance sheet, in the app's own
 * language, with its art pinned to the corner as a sticker. Renders a frozen snapshot first,
 * then the live read.
 */
export function TreasuryShowcase() {
  const live = useAsync(() => loadMemeCached(SHOWCASE_MEME), []);
  const isLive = !!live.data;
  const epochIssued = live.data?.treasury?.epoch_issued ?? null;
  const epochSecs = live.data?.params.epoch_secs ?? 0;
  const epochStart = useAsync(
    () => (epochIssued === null ? Promise.resolve(null) : fetchEpochStart(SHOWCASE_MEME, epochSecs, toBig(epochIssued))),
    [epochIssued, epochSecs],
  );
  const row = summarize(live.data ?? SHOWCASE_SNAPSHOT);
  const { nav } = row;
  const ticker = row.ticker ?? "NVDA";
  const art = MEME_ART[SHOWCASE_MEME];
  // Only a live read says what the next rebalance can do; the frozen snapshot states the rule.
  const engine = live.data ? engineState(live.data, nav, epochStart.data ?? null) : null;

  return (
    <div className="relative rounded-[20px] bg-card p-5 text-left sm:p-8">
      {art && (
        <Link href={appUrl(`/meme/${SHOWCASE_MEME}`)} className="meme-sticker" aria-label={`Open ${row.symbol}`}>
          <Image src={art.src} alt={art.alt} width={1024} height={1024} sizes="10rem" />
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:pr-36 lg:pr-40">
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

      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
        <Stat label="Treasury value" value={nav.assetsUsd} format={fmtUsdCompact} size="md" />
        <Stat label="Price" text={fmtPrice(nav.priceUsd)} size="md" />
        <Stat label="NAV / token" text={fmtPrice(nav.navUsd)} size="md" />
        <Stat label="mNAV" text={fmtTimes(row.mnav)} size="md" />
      </dl>

      <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <div className="panel self-start p-5">
          <p className="text-sm text-soft">mNAV against the locked rules</p>
          <MnavGauge value={row.mnav} thresholds={row.thresholds} className="mt-2" />
          <p className="mt-1 text-sm text-ink-2">{mnavSentence(row.mnav, row.thresholds, ticker, engine)}</p>
        </div>
        <div>
          <p className="text-sm text-soft">Where the treasury sits</p>
          <div className="mt-3">
            <Composition slices={compositionOf(row)} total={nav.assetsUsd} />
          </div>
        </div>
      </div>
      <Link href={appUrl(`/meme/${SHOWCASE_MEME}`)} className="link mt-4 inline-block text-sm">
        Open the full balance sheet
      </Link>
    </div>
  );
}
