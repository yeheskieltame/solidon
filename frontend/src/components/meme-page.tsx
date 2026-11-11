"use client";

import { ArrowUpRight, BadgeCheck, ChevronDown, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { ChainLogo, StockLogo } from "./brand-logo";
import { CompositionBar, compositionOf } from "./composition";
import { CopyButton, ExplorerLink } from "./copy-button";
import { EventLog, mnavHistory } from "./event-log";
import { HISTORY_EMPTY, HistoryCharts, useMemeHistory } from "./history-charts";
import { MemeIcon } from "./meme-icon";
import { MnavChart } from "./mnav-chart";
import { MnavGauge, ZoneBadge } from "./mnav-gauge";
import { Notice } from "./notice";
import { RulesSection, fmtSecs } from "./rules-section";
import { Stat } from "./stat";
import { GLOSSARY, Term } from "./term";
import { useToast } from "./toast";
import { TradePanel, useUserBalances } from "./trade-panel";
import { TreasuryChains, coverage, useOnChainReadings, type Coverage } from "./treasury-chains";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/lib/app-link";
import { STOCK_LOGOS } from "@/lib/brands";
import { NEARBLOCKS, NETWORK } from "@/lib/config";
import { loadMemeEvents } from "@/lib/events";
import { fmtUsdCompact } from "@/lib/figure";
import { fmtAmount, fmtRaw, fmtUsd, timeAgo, toBig, toNumber } from "@/lib/format";
import { lastMnav, oracleUsd } from "@/lib/math";
import { loadMemeCached, summarize } from "@/lib/market";
import { fmtPrice, fmtPriceLong } from "@/lib/price";
import { fmtTimes, mnavSentence } from "@/lib/mnav";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet } from "@/lib/wallet";

type DetailKey = "history" | "treasury" | "rules" | "balance" | "activity" | "contract";

/** A key/value attribute row with a hairline under it. */
function Attr({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="attr">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** One accordion row: a full-width heading button with a one-line summary, then its panel. */
function DetailItem({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: DetailKey;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panel = useId();
  return (
    <div data-acc-item className="border-t border-line first:border-t-0">
      <h3>
        <button
          type="button"
          id={`details-${id}`}
          aria-expanded={open}
          aria-controls={panel}
          onClick={onToggle}
          className="group flex w-full scroll-mt-[calc(var(--header-h)+1rem)] items-center gap-4 rounded-lg py-5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[1.0625rem] text-ink group-hover:text-blue-ink">{title}</span>
            <span className="mt-0.5 block text-sm text-soft">{summary}</span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 text-soft transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
      </h3>
      <div id={panel} role="region" aria-labelledby={`details-${id}`} hidden={!open} className="pb-10">
        {open && children}
      </div>
    </div>
  );
}

/** The small verdict after a treasury row: only a quiet tick when the chain covers the ledger. */
function CoverageMark({ state }: { state: Coverage }) {
  if (state === "covered")
    return (
      <span className="inline-flex items-center gap-1 text-[0.8125rem] text-green-ink">
        <BadgeCheck className="size-4" aria-hidden />
        <span className="max-sm:sr-only">Verified on-chain</span>
      </span>
    );
  if (state === "short")
    return (
      <span className="inline-flex items-center gap-1 text-[0.8125rem] text-orange-ink">
        <TriangleAlert className="size-4" aria-hidden />
        <span className="max-sm:sr-only">Less on-chain</span>
      </span>
    );
  if (state === "pending") return <span className="text-[0.8125rem] text-faint">Checking</span>;
  if (state === "unreadable") return <span className="text-[0.8125rem] text-soft">Not checked</span>;
  return null;
}

function PageSkeleton() {
  return (
    <div className="wrap grid gap-8 pt-10 pb-20 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-busy aria-label="Loading the meme">
      <div className="grid content-start gap-8">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="h-12 w-64" />
        </div>
        <div className="grid grid-cols-3 gap-8">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-16" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function MemePage({ account }: { account: string }) {
  const [fresh, setFresh] = useState(0);
  const snap = useAsync(() => loadMemeCached(account, fresh > 0), [account, fresh]);
  const events = useAsync(() => loadMemeEvents(account), [account]);
  const priceHistory = useMemeHistory(account);
  const { accountId, send, connect, signHint } = useWallet();
  const user = useUserBalances(account, accountId);
  const toast = useToast();
  const [rebalanceMsg, setRebalanceMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [rebalancing, setRebalancing] = useState(false);
  const [open, setOpen] = useState<Set<DetailKey>>(() => new Set());
  const chainsForReads = snap.data ? summarize(snap.data).chains : [];
  const readings = useOnChainReadings(chainsForReads);

  if (snap.loading && !snap.data) return <PageSkeleton />;
  if (snap.error || !snap.data) {
    return (
      <div className="wrap py-16">
        <Notice
          tone="error"
          title={`Could not read ${account}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setFresh((f) => f + 1)}>
                Try again
              </Button>
              <AppLink href="/" className={buttonVariants()}>
                Back to Markets
              </AppLink>
            </div>
          }
        >
          {snap.error ?? "Unknown error"}. Check the account name and your connection.
        </Notice>
      </div>
    );
  }

  const d = snap.data;
  const row = summarize(d);
  const { metadata, info, treasury, params } = d;
  const { nav, chains, thresholds } = row;
  const ticker = row.ticker ?? "?";
  const stockName = STOCK_LOGOS[ticker]?.name ?? ticker;
  const contractMnav = lastMnav(treasury);
  const liveMnav = nav.mnav ?? contractMnav;
  const seeded = row.seeded;
  const spotUsd = row.spotUsd;
  const stockPrice = oracleUsd(d.price);
  const now = d.fetchedAt;
  const priceAge = d.price ? now - d.price.publish_time : null;
  const stale = priceAge !== null && priceAge > params.oracle_max_age_secs;
  const canRebalance = !!treasury && (treasury.last_rebalance === 0 || now >= treasury.next_rebalance);
  const bufferTarget = params.cash_buffer_bps / 10_000;
  const refillAt = params.cash_refill_bps / 10_000;
  const epochCap = toBig(treasury?.epoch_cap);
  const epochIssued = toBig(treasury?.epoch_issued);
  const cashPct = (nav.cashShare ?? 0) * 100;
  const history = mnavHistory(events.data?.events);
  const hasHistory = (priceHistory.data?.length ?? 0) >= 2 ? priceHistory.data!.length : 0;
  const slices = compositionOf(row);
  const cashSlice = slices.find((s) => s.key === "cash");
  const redemptionOpen = !!treasury?.redemption_open;
  // The buffer bar spans 0 to twice the target, so the 20% mark sits mid-bar.
  const barMax = Math.max(bufferTarget * 2, 0.01);
  const barAt = (x: number) => `${Math.min(100, (x / barMax) * 100)}%`;
  const twapWindow = fmtSecs(params.twap_window_secs);

  // Per-swap caps reported by the contract, per chain.
  const rawChains = [...(d.chains?.chains ?? []), ...(d.chains?.solana ? [d.chains.solana] : [])];
  const caps = rawChains
    .map((c) => {
      const cap = c.config?.max_swap_usdc;
      if (cap === undefined) return null;
      const dec = typeof c.config?.usdc_decimals === "number" ? c.config.usdc_decimals : 6;
      return toNumber(toBig(cap), dec);
    })
    .filter((n): n is number => n !== null);

  const reload = () => {
    setFresh((f) => f + 1);
    user.reload();
    readings.reload();
  };

  const toggle = (k: DetailKey) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  /** Opens one Details row and brings it into view. */
  function reveal(k: DetailKey) {
    setOpen((s) => new Set(s).add(k));
    requestAnimationFrame(() => {
      const el = document.getElementById(`details-${k}`);
      el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      el?.focus({ preventScroll: true });
    });
  }

  async function rebalance() {
    setRebalancing(true);
    setRebalanceMsg(null);
    const id = toast.show({ tone: "pending", title: "Running the rules", body: signHint });
    try {
      const [hash] = await send([{ receiverId: account, methodName: "rebalance", args: {}, gas: 150, deposit: "0" }]);
      const text = "Rebalance sent. The outcome appears in the activity log.";
      setRebalanceMsg({ error: false, text });
      toast.update(id, {
        tone: "success",
        title: "Rebalance sent",
        body: "The outcome appears in the activity log.",
        href: hash ? `${NEARBLOCKS}/txns/${hash}` : `${NEARBLOCKS}/address/${account}`,
        hrefLabel: hash ? "The transaction on NearBlocks" : `${metadata.symbol} on NearBlocks`,
        confetti: true,
      });
    } catch (e) {
      setRebalanceMsg({ error: true, text: errorText(e) });
      toast.update(id, { tone: "error", title: "The rebalance did not go through", body: errorText(e) });
    } finally {
      setRebalancing(false);
      reload();
      events.reload();
    }
  }

  const priceTip = nav.usesTwap
    ? `The ${twapWindow} average price (TWAP), the one the rules use.${spotUsd !== null ? ` Spot price right now: ${fmtPrice(spotUsd)}.` : ""}`
    : `The pool's spot price. The ${twapWindow} average takes over once the pool has history.`;

  return (
    <div className="wrap grid gap-x-12 pt-6 pb-20 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:gap-x-16">
      {/* A: what this coin is, what state it is in */}
      <div className="min-w-0 lg:col-start-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-soft">
            <AppLink href="/" className="hover:text-ink">
              Markets
            </AppLink>
            <ChevronRight className="size-3.5" aria-hidden />
            <span className="text-ink-2" aria-current="page">
              {metadata.symbol}
            </span>
          </nav>
          <span className="flex items-center gap-1">
            <a
              href={`${NEARBLOCKS}/address/${account}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-soft hover:text-ink"
            >
              View on NearBlocks
              <ArrowUpRight className="size-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <button type="button" onClick={reload} disabled={snap.loading} className="icon-btn" aria-label="Refresh data" title="Refresh data">
              <RefreshCw className={cn(snap.loading && "animate-spin")} aria-hidden />
            </button>
          </span>
        </div>

        <header className="mt-6 flex items-center gap-4">
          <MemeIcon icon={metadata.icon} symbol={metadata.symbol} size={56} className="shrink-0 max-sm:!size-12" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[clamp(2rem,3.6vw,2.75rem)] leading-none font-light tracking-[-0.035em] break-all">{metadata.symbol}</span>
              <ZoneBadge zone={row.zone} fallback={seeded ? "New" : "Not seeded"} />
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[0.9375rem] text-soft">
              <span className="text-ink-2">{metadata.name}</span>
              <span>holds</span>
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                <StockLogo ticker={ticker} size={18} decorative />
                {stockName === ticker ? ticker : `${stockName} (${ticker})`}
              </span>
            </p>
          </div>
        </header>

        {/* Three columns from sm up; on phones three label / value rows, so the figures never collide. */}
        <dl className="mt-6 grid divide-y divide-line sm:mt-8 sm:grid-cols-3 sm:gap-x-10 sm:divide-y-0 max-sm:[&>div]:flex max-sm:[&>div]:items-baseline max-sm:[&>div]:justify-between max-sm:[&>div]:py-2.5 max-sm:[&_.stat-value]:mt-0 max-sm:[&_.stat-value]:!text-[1.625rem]">
          <Stat
            size="md"
            label={
              <Term tip={priceTip} align="start">
                Price
              </Term>
            }
            value={seeded ? nav.priceUsd : null}
            format={fmtPrice}
            title={seeded ? fmtPriceLong(nav.priceUsd) : undefined}
          />
          <Stat size="md" label="mNAV" hint={GLOSSARY.mnav} value={nav.mnav ?? contractMnav} format={fmtTimes} />
          <Stat size="md" label="Treasury value" value={nav.assetsUsd} format={fmtUsdCompact} title={fmtUsd(nav.assetsUsd)} />
        </dl>

        <div className="mt-8">
          <p className="max-w-[62ch] text-[0.9375rem] text-ink-2">{mnavSentence(liveMnav, thresholds, ticker)}</p>
          {stale && d.price && (
            <p className="mt-1 max-w-[62ch] text-sm text-orange-ink">
              The {ticker} price was published {timeAgo(d.price.publish_time)}, so the rules pause until it updates. Trading continues.
            </p>
          )}
          <MnavGauge value={liveMnav} thresholds={thresholds} showValue={false} label="mNAV now" className="mt-1" />
        </div>
      </div>

      {/* B: the trade panel, sticky on desktop, right after the status on phones */}
      <aside id="trade" aria-label="Trade" className="mt-10 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <TradePanel snap={d} user={user.data ?? null} onDone={reload} />
        </div>
      </aside>

      {/* C: where the treasury is, in plain rows */}
      <section aria-labelledby="where-title" className="mt-10 min-w-0 lg:col-start-1 lg:mt-9">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="where-title" className="type-h3 font-normal">
            Where the treasury is
          </h2>
          <button type="button" className="link text-sm" onClick={() => reveal("treasury")}>
            How is this verified?
          </button>
        </div>
        <CompositionBar slices={slices} total={nav.assetsUsd} className="mt-4 !h-2" />
        <ul className="mt-2">
          {chains.map((c) => {
            const slice = slices.find((s) => s.key === c.key);
            const chainUsdc = c.ledgerUsdc !== null ? toNumber(c.ledgerUsdc, c.usdcDecimals) : 0;
            const r = readings.data?.[c.key];
            return (
              <li key={c.key} className="flex items-center gap-3 border-b border-line py-3">
                <span className="size-2 shrink-0 rounded-full" style={{ background: slice?.color }} aria-hidden />
                <ChainLogo chain={c.key} size={24} decorative />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem]">{c.meta.label.replace(/ (testnet|devnet|Sepolia)$/, "")}</span>
                  <span className="block truncate text-[0.8125rem] text-soft tabular-nums">
                    {!c.address
                      ? "Not opened yet"
                      : c.ledgerStock !== null
                        ? `${fmtRaw(c.ledgerStock, c.stockDecimals, 6)} ${ticker}${chainUsdc > 0 ? ` and ${fmtUsd(chainUsdc)} USDC` : ""}`
                        : "Not tracked"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row-reverse sm:items-center sm:gap-4">
                  <span className="text-[0.9375rem] tabular-nums">{fmtUsd(slice?.usd ?? 0)}</span>
                  <CoverageMark state={coverage(c, r, readings.loading)} />
                </span>
              </li>
            );
          })}
          {cashSlice && (
            <li className="flex items-center gap-3 py-3">
              <span className="size-2 shrink-0 rounded-full" style={{ background: cashSlice.color }} aria-hidden />
              {cashSlice.logo}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem]">Cash on NEAR</span>
                <span className="block truncate text-[0.8125rem] text-soft">USDC kept for redemptions</span>
              </span>
              <span className="text-[0.9375rem] tabular-nums">{fmtUsd(cashSlice.usd)}</span>
            </li>
          )}
        </ul>
      </section>

      {/* D: everything else, one click away */}
      <section aria-labelledby="details-title" className="mt-14 min-w-0 lg:col-start-1">
        <h2 id="details-title" className="type-section">
          Details
        </h2>
        <div className="mt-2">
          <DetailItem
            id="history"
            title={`${metadata.symbol} against ${ticker}`}
            summary={hasHistory ? `Price against the stock and mNAV over time, ${hasHistory} recorded points` : HISTORY_EMPTY}
            open={open.has("history")}
            onToggle={() => toggle("history")}
          >
            <HistoryCharts history={priceHistory} symbol={metadata.symbol} icon={metadata.icon} ticker={ticker} thresholds={thresholds} />
          </DetailItem>

          <DetailItem
            id="treasury"
            title="Treasury per chain"
            summary="Addresses, what the contract booked against what each chain holds, and how cash is proven"
            open={open.has("treasury")}
            onToggle={() => toggle("treasury")}
          >
            <p className="mb-5 max-w-[68ch] text-[0.9375rem] text-soft">
              Addresses only this contract can sign for, through NEAR Chain Signatures
              {d.chains?.mpc ? ` (MPC ${d.chains.mpc})` : ""}. The ledger books the minimum out of every swap; on-chain is read live by
              your browser. A tick means the chain holds at least what the ledger claims.
              {d.chains?.signing ? " A signature request is in flight." : ""}
            </p>
            <TreasuryChains chains={chains} price={d.price} ticker={ticker} note={d.chainsNote} raw={d.chains} readings={readings} />
          </DetailItem>

          <DetailItem
            id="rules"
            title="Rules"
            summary={`Locked at launch. Redemption window ${redemptionOpen ? "open" : "closed"}. Anyone can run them once per ${fmtSecs(params.rebalance_cooldown_secs)}`}
            open={open.has("rules")}
            onToggle={() => toggle("rules")}
          >
            <RulesSection
              thresholds={thresholds}
              mnav={liveMnav}
              params={params}
              oracle={info?.oracle ?? null}
              epochCap={epochCap}
              epochIssued={epochIssued}
              swapCap={caps}
              redemptionOpen={redemptionOpen}
              fromContract={d.paramsFromContract}
            />
            {!redemptionOpen && (
              <p className="mt-3 max-w-[68ch] text-[0.8125rem] text-soft">
                Redeem appears in the trade panel only while the window is open: a rebalance opens it when mNAV is below{" "}
                {fmtTimes(thresholds.redemption)}, and holders can then burn tokens for NAV per token in USDC.
              </p>
            )}

            <div className="panel mt-8 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-[0.9375rem]">Run the rules</p>
                <p className="mt-1 max-w-[52ch] text-sm text-soft">
                  A rebalance reads the oracle and the average price, then issues, buys back, opens redemption or does nothing.{" "}
                  {!treasury
                    ? "Treasury view unavailable."
                    : treasury.last_rebalance === 0
                      ? "Never run yet. Available now."
                      : canRebalance
                        ? `Last run ${timeAgo(treasury.last_rebalance)}. Available now.`
                        : `Next run in ${Math.ceil((treasury.next_rebalance - now) / 60)} min.`}
                </p>
              </div>
              {accountId ? (
                <Button size="sm" variant="outline" disabled={!canRebalance || rebalancing} onClick={rebalance}>
                  {rebalancing ? <span className="dots">Waiting</span> : canRebalance ? "Rebalance now" : "Cooling down"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => connect().catch(() => undefined)}>
                  Connect to rebalance
                </Button>
              )}
              {rebalanceMsg && (
                <p
                  role={rebalanceMsg.error ? "alert" : "status"}
                  className={cn("w-full rounded-xl p-2.5 text-sm break-words", rebalanceMsg.error ? "bg-red-wash text-red-ink" : "bg-green-wash text-green-ink")}
                >
                  {rebalanceMsg.text}
                </p>
              )}
            </div>
          </DetailItem>

          <DetailItem
            id="balance"
            title="Balance sheet and cash buffer"
            summary="Assets, supply, NAV per token, the oracle price and the USDC kept for redemptions"
            open={open.has("balance")}
            onToggle={() => toggle("balance")}
          >
            <div className="grid gap-x-12 gap-y-10 xl:grid-cols-2">
              <dl>
                <Attr k="USDC cash on NEAR" v={fmtUsd(nav.cashUsd)} />
                <Attr k="USDC on treasury chains" v={fmtUsd(nav.chainUsdcUsd)} />
                <Attr k={`${ticker} on treasury chains`} v={fmtUsd(nav.stockUsd)} />
                <Attr k="Total assets" v={<span className="text-ink">{fmtUsd(nav.assetsUsd)}</span>} />
                <Attr k="Circulating supply" v={`${fmtAmount(nav.circulating)} ${metadata.symbol}`} />
                <Attr k="NAV per token" v={nav.navUsd !== null ? fmtPriceLong(nav.navUsd) : "–"} />
                <Attr k="mNAV at the last rebalance" v={fmtTimes(contractMnav)} />
                <Attr
                  k="Oracle price"
                  v={
                    <span className={cn(stale && "text-orange-ink")}>
                      {d.price ? `1 ${ticker} = ${fmtUsd(stockPrice)}` : "No price yet"}
                    </span>
                  }
                />
              </dl>
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h4 className="text-[0.9375rem]">Cash buffer</h4>
                  <p className="text-[0.9375rem] tabular-nums">
                    {nav.cashShare !== null ? `${cashPct.toFixed(1)}%` : "–"} <span className="text-soft">of assets in USDC on NEAR</span>
                  </p>
                </div>
                <div className="relative mt-9 mb-8">
                  <div
                    className="bar !h-2"
                    role="meter"
                    aria-label="Cash as a share of assets"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Number(cashPct.toFixed(1))}
                    aria-valuetext={`Cash is ${cashPct.toFixed(1)}% of assets. Target ${bufferTarget * 100}%, refill below ${refillAt * 100}%.`}
                  >
                    <div className="bar-fill" style={{ width: barAt(nav.cashShare ?? 0), background: (nav.cashShare ?? 0) < refillAt ? "var(--orange)" : "var(--green)" }} />
                  </div>
                  {(
                    [
                      [bufferTarget, `Target ${bufferTarget * 100}%`, "top"],
                      [refillAt, `Refill ${refillAt * 100}%`, "bottom"],
                    ] as const
                  ).map(([x, label, side]) => (
                    <span key={label} className="absolute inset-y-[-5px] w-px -translate-x-1/2 bg-soft" style={{ left: barAt(x) }} aria-hidden>
                      <span className={cn("absolute left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-soft", side === "top" ? "bottom-full mb-1" : "top-full mt-1")}>
                        {label}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="text-sm text-soft">
                  {GLOSSARY.buffer}{" "}
                  {nav.cashShare === null
                    ? "No assets yet."
                    : nav.cashShare >= bufferTarget
                      ? "Above target: only this surplus can fund buybacks."
                      : nav.cashShare >= refillAt
                        ? "Below target but above the refill line: new fees rebuild the buffer."
                        : "Below the refill line: a stock sale refills the buffer."}
                </p>
              </div>
            </div>
            <p className={cn("mt-6 text-[0.8125rem]", stale ? "text-orange-ink" : "text-soft")}>
              {d.price
                ? `Oracle price published ${timeAgo(d.price.publish_time)}.${stale ? " Older than the allowed age: every mNAV action pauses until it updates; trading continues." : ""} The ledger values ${ticker} at this price.`
                : `No price for ${ticker} from the oracle. Stock is valued at zero here until one is published.`}
            </p>
          </DetailItem>

          <DetailItem
            id="activity"
            title="Activity"
            summary="The latest trades, mints and rebalances the contract logged"
            open={open.has("activity")}
            onToggle={() => toggle("activity")}
          >
            {!hasHistory && history.length >= 3 && (
              <div className="panel mb-8 p-5 sm:p-8">
                <p className="mb-6 text-[0.9375rem] text-soft">mNAV at each of the last {history.length} rebalances, from the contract&apos;s own events</p>
                <MnavChart points={history} thresholds={thresholds} />
              </div>
            )}
            <EventLog account={account} symbol={metadata.symbol} log={events} />
          </DetailItem>

          <DetailItem
            id="contract"
            title="Contract"
            summary="Account, creator and oracle"
            open={open.has("contract")}
            onToggle={() => toggle("contract")}
          >
            <dl className="max-w-[44rem]">
              <Attr
                k="Contract account"
                v={
                  <span className="inline-flex max-w-full items-center gap-0.5" title={account}>
                    <span className="truncate">{account}</span>
                    <CopyButton value={account} label="contract account" />
                    <ExplorerLink href={`${NEARBLOCKS}/address/${account}`} label={`${account} on NearBlocks`} />
                  </span>
                }
              />
              <Attr k="Name" v={metadata.name} />
              <Attr
                k="Creator"
                v={
                  info ? (
                    <span className="inline-flex max-w-full items-center gap-0.5" title={info.creator}>
                      <span className="truncate">{info.creator}</span>
                      <ExplorerLink href={`${NEARBLOCKS}/address/${info.creator}`} label={`${info.creator} on NearBlocks`} />
                    </span>
                  ) : (
                    "–"
                  )
                }
              />
              <Attr
                k="Oracle"
                v={
                  info?.oracle ? (
                    <span className="inline-flex max-w-full items-center gap-0.5" title={info.oracle}>
                      <span className="truncate">{info.oracle}</span>
                      <ExplorerLink href={`${NEARBLOCKS}/address/${info.oracle}`} label={`${info.oracle} on NearBlocks`} />
                    </span>
                  ) : (
                    "–"
                  )
                }
              />
              <Attr k="Thesis stock" v={stockName === ticker ? ticker : `${stockName} (${ticker})`} />
              <Attr k="Network" v={`NEAR ${NETWORK}`} />
            </dl>
          </DetailItem>
        </div>
      </section>
    </div>
  );
}
