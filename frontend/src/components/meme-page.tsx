"use client";

import { ChevronRight, RefreshCw, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { ChainLogo, StockLogo } from "./brand-logo";
import { Composition, compositionOf } from "./composition";
import { CopyButton, ExplorerLink } from "./copy-button";
import { EventLog, mnavHistory } from "./event-log";
import { MemeIcon } from "./meme-icon";
import { MnavChart } from "./mnav-chart";
import { MnavGauge, ZoneBadge } from "./mnav-gauge";
import { Notice } from "./notice";
import { SectionNav } from "./section-nav";
import { Stat, StatRow } from "./stat";
import { GLOSSARY, Hint } from "./term";
import { useToast } from "./toast";
import { TradePanel, useUserBalances } from "./trade-panel";
import { TreasuryChains } from "./treasury-chains";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/lib/app-link";
import { STOCK_LOGOS } from "@/lib/brands";
import { MEME_DECIMALS, NEARBLOCKS } from "@/lib/config";
import { fetchMemeEvents } from "@/lib/events";
import { fmtCompact, fmtUsdCompact } from "@/lib/figure";
import { fmtAmount, fmtRaw, fmtUsd, shortAddr, timeAgo, toBig, toNumber } from "@/lib/format";
import { lastMnav, oracleUsd } from "@/lib/math";
import { loadMemeCached, summarize } from "@/lib/market";
import { fmtPrice, fmtPriceLong } from "@/lib/price";
import { fmtTimes, mnavSentence, ZONES } from "@/lib/mnav";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet } from "@/lib/wallet";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "treasury", label: "Treasury" },
  { id: "rules", label: "Rules" },
  { id: "activity", label: "Activity" },
];

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="pt-14">
      <h2 id={`${id}-title`} className="type-section">
        {title}
      </h2>
      {intro && <p className="mt-2 max-w-[68ch] text-[0.9375rem] text-soft">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A key/value attribute row with a hairline under it. */
function Attr({ k, v, hint }: { k: ReactNode; v: ReactNode; hint?: string }) {
  return (
    <div className="attr">
      <dt>
        {k}
        {hint && <Hint tip={hint} align="start" />}
      </dt>
      <dd>{v}</dd>
    </div>
  );
}

function fmtSecs(s: number) {
  if (s % 86_400 === 0) return `${s / 86_400} day${s === 86_400 ? "" : "s"}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  return `${Math.round(s / 60)} minutes`;
}

function PageSkeleton() {
  return (
    <div className="wrap grid gap-8 pt-12 pb-20" aria-busy aria-label="Loading the meme">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-14 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function MemePage({ account }: { account: string }) {
  const [fresh, setFresh] = useState(0);
  const snap = useAsync(() => loadMemeCached(account, fresh > 0), [account, fresh]);
  const events = useAsync(() => fetchMemeEvents(account), [account]);
  const { accountId, send, connect } = useWallet();
  const user = useUserBalances(account, accountId);
  const toast = useToast();
  const [rebalanceMsg, setRebalanceMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [rebalancing, setRebalancing] = useState(false);
  const [mnavView, setMnavView] = useState<"live" | "last">("live");

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
  const stockName = STOCK_LOGOS[ticker]?.name;
  const contractMnav = lastMnav(treasury);
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
  const shownMnav = mnavView === "last" ? contractMnav : (nav.mnav ?? contractMnav);
  const history = mnavHistory(events.data);
  const slices = compositionOf(row);
  const chainsHeld = chains.filter((c) => c.address);
  // The buffer bar spans 0 to twice the target, so the 20% mark sits mid-bar.
  const barMax = Math.max(bufferTarget * 2, 0.01);
  const barAt = (x: number) => `${Math.min(100, (x / barMax) * 100)}%`;

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
  const capText = caps.length === 0 ? null : new Set(caps).size === 1 ? `${fmtAmount(caps[0])} USDC per swap, each chain` : caps.map((c) => `${fmtAmount(c)} USDC`).join(" / ");

  const reload = () => {
    setFresh((f) => f + 1);
    user.reload();
  };

  async function rebalance() {
    setRebalancing(true);
    setRebalanceMsg(null);
    const id = toast.show({ tone: "pending", title: "Running the rules", body: "Confirm it in your wallet." });
    try {
      await send([{ receiverId: account, methodName: "rebalance", args: {}, gas: 150, deposit: "0" }]);
      const text = "Rebalance sent. The outcome appears in the activity log.";
      setRebalanceMsg({ error: false, text });
      toast.update(id, {
        tone: "success",
        title: "Rebalance sent",
        body: "The outcome appears in the activity log.",
        href: `${NEARBLOCKS}/address/${account}`,
        hrefLabel: `${metadata.symbol} on NearBlocks`,
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

  return (
    <div className="wrap grid gap-x-14 pt-8 pb-20 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_25rem]">
      {/* A: identity and the headline figures */}
      <div className="min-w-0 lg:col-start-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-soft">
          <AppLink href="/" className="hover:text-ink">
            Markets
          </AppLink>
          <ChevronRight className="size-3.5" aria-hidden />
          <span className="text-ink-2" aria-current="page">
            {metadata.symbol}
          </span>
        </nav>

        <header className="mt-8">
          <h1 className="flex flex-wrap items-center gap-x-4 gap-y-3 text-[clamp(2.5rem,5vw,4rem)] leading-none font-light tracking-[-0.035em]">
            <span className="flex min-w-0 items-center gap-3.5">
              <MemeIcon icon={metadata.icon} symbol={metadata.symbol} size={64} className="max-sm:!size-12" />
              <span className="break-all">{metadata.symbol}</span>
            </span>
            <span className="h-12 w-px bg-line-strong max-sm:hidden" aria-hidden />
            <span className="flex items-center gap-3.5">
              <span className="sr-only">holds</span>
              <StockLogo ticker={ticker} size={64} decorative className="max-sm:!size-12" />
              <span>{ticker}</span>
            </span>
            <ZoneBadge zone={row.zone} fallback={seeded ? "New" : "Not seeded"} className="self-center" />
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.9375rem]">
            <span className="flex items-center gap-1 text-ink-2" title={account}>
              <span className="max-w-[16rem] truncate">{account}</span>
              <CopyButton value={account} label="contract account" />
              <ExplorerLink href={`${NEARBLOCKS}/address/${account}`} label={`${account} on NearBlocks`} />
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {chainsHeld.map((c) => (
                <span key={c.key} className="flex items-center gap-2 text-ink-2">
                  <ChainLogo chain={c.key} size={18} decorative />
                  {c.meta.label.replace(/ (testnet|devnet|Sepolia)$/, "")}
                </span>
              ))}
            </span>
            <button type="button" onClick={reload} disabled={snap.loading} className="icon-btn !w-auto gap-1.5 px-2 text-sm" aria-label="Refresh data">
              <RefreshCw className={cn(snap.loading && "animate-spin")} aria-hidden />
              <span className="max-sm:hidden">Refresh</span>
            </button>
          </div>
        </header>

        <StatRow className="mt-12">
          <Stat
            label={nav.usesTwap ? "Price (TWAP)" : "Price (spot)"}
            hint={nav.usesTwap ? GLOSSARY.twap : "The pool's spot price. The 30-minute average appears once the pool has history."}
            value={seeded ? nav.priceUsd : null}
            format={fmtPrice}
            title={seeded ? fmtPriceLong(nav.priceUsd) : undefined}
            sub={seeded ? (spotUsd !== null && nav.usesTwap ? `Spot ${fmtPrice(spotUsd)}` : "USDC per token") : "Pool not seeded"}
          />
          <Stat
            label="NAV / token"
            hint={GLOSSARY.nav}
            value={nav.navUsd}
            format={fmtPrice}
            title={nav.navUsd !== null ? fmtPriceLong(nav.navUsd) : undefined}
            sub={nav.navUsd === null ? "Starts once tokens circulate" : "Ledger at the oracle price"}
          />
          <Stat
            label="mNAV"
            hint={GLOSSARY.mnav}
            value={nav.mnav}
            format={fmtTimes}
            sub={contractMnav !== null ? `Last rebalance ${fmtTimes(contractMnav)}` : "No rebalance yet"}
          />
          <Stat
            label="Treasury value"
            hint="Everything the treasury holds: USDC on NEAR, plus USDC and stock on every chain from the ledger, with the stock at the oracle price."
            value={nav.assetsUsd}
            format={fmtUsdCompact}
            sub={`${fmtCompact(nav.circulating)} ${metadata.symbol} circulating`}
          />
        </StatRow>

        <p className="mt-10 flex flex-wrap items-center gap-2 text-[0.9375rem] text-soft">
          {metadata.name} is a treasury company holding
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <StockLogo ticker={ticker} size={18} decorative />
            {stockName ?? ticker}.
          </span>
          {info && <span title={info.creator}>Created by {shortAddr(info.creator, 16, 10)}.</span>}
        </p>
      </div>

      {/* B: the action panel, sticky on desktop, right after the headline on phones */}
      <aside id="trade" aria-label="Trade and rebalance" className="mt-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
        <div className="grid gap-3 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <TradePanel snap={d} user={user.data ?? null} onDone={reload} />

          <div className="panel mt-3 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[0.9375rem]">
                <Scale className="size-4 text-soft" aria-hidden />
                Run the rules
                <Hint
                  tip={`A rebalance reads the oracle and the average price, then issues, buys back, opens redemption or does nothing. Anyone can call it once per ${fmtSecs(params.rebalance_cooldown_secs)}.`}
                  align="start"
                />
              </p>
              {accountId ? (
                <Button size="sm" variant="outline" disabled={!canRebalance || rebalancing} onClick={rebalance}>
                  {rebalancing ? <span className="dots">Waiting</span> : canRebalance ? "Rebalance now" : "Cooling down"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => connect().catch(() => undefined)}>
                  Connect to rebalance
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-sm text-soft">
              {!treasury
                ? "Treasury view unavailable."
                : treasury.last_rebalance === 0
                  ? "Never rebalanced. Available now."
                  : canRebalance
                    ? `Last run ${timeAgo(treasury.last_rebalance)}. Available now.`
                    : `Next run in ${Math.ceil((treasury.next_rebalance - now) / 60)} min.`}
            </p>
            {rebalanceMsg && (
              <p
                role={rebalanceMsg.error ? "alert" : "status"}
                className={cn("mt-3 rounded-xl p-2.5 text-sm break-words", rebalanceMsg.error ? "bg-red-wash text-red-ink" : "bg-green-wash text-green-ink")}
              >
                {rebalanceMsg.text}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* C: sections */}
      <div className="min-w-0 lg:col-start-1">
        <SectionNav items={SECTIONS} className="mt-14 -mx-1 px-1" />

        <Section id="overview" title="Overview">
          <div className="panel p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 text-[0.9375rem] text-soft">
                  {mnavView === "last" ? "mNAV at the last rebalance" : "mNAV now"}
                  <Hint k="mnav" align="start" />
                </p>
                <p className="stat-value mt-2">
                  {fmtTimes(shownMnav).replace("×", "")}
                  <span className="fig-dim">{shownMnav !== null ? "×" : ""}</span>
                </p>
              </div>
              <div className="seg" role="group" aria-label="Which mNAV">
                <button type="button" aria-pressed={mnavView === "live"} onClick={() => setMnavView("live")}>
                  Live
                </button>
                <button type="button" aria-pressed={mnavView === "last"} onClick={() => setMnavView("last")} disabled={contractMnav === null}>
                  Last rebalance
                </button>
              </div>
            </div>
            <MnavGauge value={shownMnav} thresholds={thresholds} label={mnavView === "last" ? "Last mNAV" : "mNAV now"} className="mt-6" />
            <p className="mt-2 max-w-[62ch] text-[0.9375rem] text-ink-2">{mnavSentence(shownMnav, thresholds, ticker)}</p>
            <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-4">
              {ZONES.map((z) => (
                <li key={z.zone} className={cn("transition-opacity", row.zone && row.zone !== z.zone && "opacity-50")}>
                  <span className="flex items-center gap-2">
                    <span className="gauge-zone h-1.5 w-3 shrink-0 !rounded-full" data-zone={z.zone} aria-hidden />
                    {z.name}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-soft">{z.rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {history.length >= 3 && (
            <div className="panel mt-6 p-5 sm:p-8">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[0.9375rem] text-soft">
                  mNAV at each rebalance
                  <Hint tip="Read from the contract's own rebalance events in its latest transactions. No points are interpolated." align="start" />
                </p>
                <p className="text-sm text-soft">{history.length} rebalances</p>
              </div>
              <MnavChart points={history} thresholds={thresholds} />
            </div>
          )}

          <div className="mt-12 grid gap-x-12 gap-y-10 xl:grid-cols-2">
            <div>
              <h3 className="type-h3 font-normal">Where the treasury sits</h3>
              <div className="mt-5">
                <Composition slices={slices} total={nav.assetsUsd} />
              </div>
            </div>
            <div>
              <h3 className="type-h3 font-normal">Balance sheet</h3>
              <dl className="mt-2">
                <Attr k="USDC cash on NEAR" v={fmtUsd(nav.cashUsd)} />
                <Attr k="USDC on treasury chains" hint={GLOSSARY.ledger} v={fmtUsd(nav.chainUsdcUsd)} />
                <Attr k={`${ticker} on treasury chains`} hint={GLOSSARY.ledger} v={fmtUsd(nav.stockUsd)} />
                <Attr k="Total assets" v={<span className="text-ink">{fmtUsd(nav.assetsUsd)}</span>} />
                <Attr k="Circulating supply" v={`${fmtAmount(nav.circulating)} ${metadata.symbol}`} />
                <Attr k="NAV per token" v={nav.navUsd !== null ? fmtPriceLong(nav.navUsd) : "–"} />
                <Attr
                  k="Oracle price"
                  v={
                    <span className={cn(stale && "text-orange-ink")} title={d.price ? `Published ${timeAgo(d.price.publish_time)}` : undefined}>
                      {d.price ? `1 ${ticker} = ${fmtUsd(stockPrice)}` : "No price yet"}
                    </span>
                  }
                />
              </dl>
              <p className={cn("mt-3 text-[0.8125rem]", stale ? "text-orange-ink" : "text-soft")}>
                {d.price
                  ? `Published ${timeAgo(d.price.publish_time)} by ${info?.oracle}.${stale ? " Older than 15 minutes: every mNAV action pauses until it updates; trading continues." : ""}`
                  : `No price for ${ticker} from the oracle. Stock is valued at zero here until one is published.`}
              </p>
            </div>
          </div>

          <div className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="type-h3 flex items-center gap-1.5 font-normal">
                Cash buffer
                <Hint k="buffer" align="start" />
              </h3>
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
              {nav.cashShare === null
                ? "No assets yet."
                : nav.cashShare >= bufferTarget
                  ? "Above target: only this surplus can fund buybacks."
                  : nav.cashShare >= refillAt
                    ? "Below target but above the refill line: new fees rebuild the buffer."
                    : "Below the refill line: a stock sale refills the buffer."}
            </p>
          </div>
        </Section>

        <Section
          id="treasury"
          title="Treasury"
          intro={
            <>
              Addresses only this contract can sign for, through NEAR Chain Signatures
              {d.chains?.mpc ? ` (MPC ${d.chains.mpc})` : ""}. The ledger books the minimum out of every
              swap; on-chain is read live by your browser.
              {d.chains?.signing ? " A signature request is in flight." : ""}
            </>
          }
        >
          <TreasuryChains chains={chains} price={d.price} ticker={ticker} note={d.chainsNote} raw={d.chains} />
        </Section>

        <Section
          id="rules"
          title="Rules"
          intro={d.paramsFromContract ? "Locked at launch and read from get_params. No owner, no setter." : "get_params is unavailable on this meme: showing the SPEC defaults."}
        >
          <dl className="grid gap-x-12 md:grid-cols-2">
            <div>
              <Attr k="Issuance above" v={fmtTimes(thresholds.issuance)} hint="Above this mNAV a rebalance mints new tokens into the pool and the proceeds buy more stock." />
              <Attr k="Issuance cap" v={`${params.max_issuance_bps_per_epoch / 100}% of supply per ${fmtSecs(params.epoch_secs)}`} />
              <Attr k="Issued this epoch" v={epochCap > 0n ? `${fmtRaw(epochIssued, MEME_DECIMALS)} of ${fmtRaw(epochCap, MEME_DECIMALS)}` : "Starts at the first rebalance"} />
              <Attr k="Buyback below" v={fmtTimes(thresholds.buyback)} hint={`Spare cash above the ${bufferTarget * 100}% buffer buys tokens back and burns them.`} />
              <Attr k="Redemption below" v={fmtTimes(thresholds.redemption)} hint="Holders can burn tokens for NAV per token in USDC." />
              <Attr k="Cash buffer" v={`${bufferTarget * 100}% target, refill below ${refillAt * 100}%`} />
            </div>
            <div>
              <Attr k="Pool fee" v={`${params.pool_fee_bps / 100}% (${params.treasury_fee_bps / 100}% treasury, ${params.creator_fee_bps / 100}% creator)`} />
              {capText && <Attr k="Swap cap" v={capText} hint="The most USDC one signed treasury swap may spend." />}
              <Attr k="Price for mNAV" v={`${fmtSecs(params.twap_window_secs)} TWAP`} hint={GLOSSARY.twap} />
              <Attr
                k="Oracle"
                v={
                  info ? (
                    <span className="inline-flex items-center gap-1" title={info.oracle}>
                      <span className="max-w-[12rem] truncate">{info.oracle}</span>
                      <ExplorerLink href={`${NEARBLOCKS}/address/${info.oracle}`} label={`${info.oracle} on NearBlocks`} />
                    </span>
                  ) : (
                    "–"
                  )
                }
              />
              <Attr k="Oracle staleness limit" v={fmtSecs(params.oracle_max_age_secs)} />
              <Attr k="Rebalance cooldown" v={`${fmtSecs(params.rebalance_cooldown_secs)}, caller tip ${params.caller_tip_bps / 100}%`} />
            </div>
          </dl>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-soft">
            <span className={cn("pill", treasury?.redemption_open ? "pill-green" : "")}>
              Redemption window {treasury?.redemption_open ? "open" : "closed"}
            </span>
            The floor defends NAV, not the price.
          </p>
        </Section>

        <Section id="activity" title="Activity">
          <EventLog account={account} symbol={metadata.symbol} log={events} />
        </Section>
      </div>
    </div>
  );
}
