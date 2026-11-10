"use client";

import { ArrowLeft, ExternalLink, RefreshCw, Scale } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { CountUp } from "./count-up";
import { EventLog } from "./event-log";
import { ZONE_PILL } from "./meme-card";
import { MemeIcon } from "./meme-icon";
import { MnavGauge } from "./mnav-gauge";
import { Notice } from "./notice";
import { Term } from "./term";
import { useToast } from "./toast";
import { TradePanel, useUserBalances } from "./trade-panel";
import { TreasuryChains } from "./treasury-chains";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ledgerHoldings, normaliseTreasury } from "@/lib/chains";
import { MEME_DECIMALS, NEARBLOCKS } from "@/lib/config";
import { fmtAmount, fmtRaw, fmtUsd, shortAddr, timeAgo, toBig } from "@/lib/format";
import { estimateNav, lastMnav, oracleUsd, scaledToUsd } from "@/lib/math";
import { loadMeme } from "@/lib/meme";
import { fmtPrice, fmtPriceLong } from "@/lib/price";
import { fmtTimes, mnavSentence, zoneName, zoneOf } from "@/lib/mnav";
import { useAsync } from "@/lib/use-async";
import { TESTNET_VENUES } from "@/lib/venues";
import { errorText, useWallet } from "@/lib/wallet";

function StatTile({
  label,
  value,
  format,
  note,
  tone,
  badge,
  title,
}: {
  label: ReactNode;
  value: number | null;
  format: (n: number) => string;
  note?: string;
  tone: string;
  badge?: ReactNode;
  title?: string;
}) {
  return (
    <div className={cn("rounded-3xl border-2 border-ink p-4 shadow-[0_4px_0_var(--ink)] sm:p-5", tone)}>
      <dt className="flex flex-wrap items-center justify-between gap-2 text-sm font-extrabold">
        <span>{label}</span>
        {badge}
      </dt>
      <dd className="type-num mt-2 text-[clamp(1.6rem,2.3vw,2rem)] whitespace-nowrap" title={title}>
        <CountUp value={value} format={format} />
      </dd>
      {note && <dd className="mt-2 text-[0.8125rem] font-semibold text-soft">{note}</dd>}
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-28">
      <h2 id={id} className="type-h2 !text-[clamp(1.6rem,3vw,2.1rem)]">
        {title}
      </h2>
      {intro && <p className="mt-2 max-w-[62ch] text-[0.9375rem] font-semibold text-soft">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SheetRow({ k, v, strong }: { k: ReactNode; v: string; strong?: boolean }) {
  return (
    <tr className={cn("border-t-2", strong ? "border-ink" : "border-line")}>
      <th scope="row" className={cn("py-2.5 pr-4 text-left", strong ? "font-extrabold" : "font-semibold text-soft")}>
        {k}
      </th>
      <td className={cn("py-2.5 text-right", strong ? "font-heading text-lg font-extrabold" : "font-bold")}>{v}</td>
    </tr>
  );
}

function fmtSecs(s: number) {
  if (s % 86_400 === 0) return `${s / 86_400} day${s === 86_400 ? "" : "s"}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  return `${Math.round(s / 60)} minutes`;
}

function PageSkeleton() {
  return (
    <div className="wrap grid gap-6 pt-8 pb-20" aria-busy aria-label="Loading the meme">
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 -rotate-3 rounded-3xl" />
        <div className="grid flex-1 gap-3">
          <Skeleton className="h-12 w-2/5" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
          <Skeleton className="h-56 rounded-3xl" />
        </div>
        <Skeleton className="h-[28rem] rounded-3xl" />
      </div>
    </div>
  );
}

export function MemePage({ account }: { account: string }) {
  const snap = useAsync(() => loadMeme(account), [account]);
  const { accountId, send, connect } = useWallet();
  const user = useUserBalances(account, accountId);
  const toast = useToast();
  const [rebalanceMsg, setRebalanceMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [rebalancing, setRebalancing] = useState(false);

  if (snap.loading && !snap.data) return <PageSkeleton />;
  if (snap.error || !snap.data) {
    return (
      <div className="wrap py-16">
        <Notice
          tone="error"
          sticker="telescope"
          title={`We looked everywhere for ${account}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={snap.reload}>
                Try again
              </Button>
              <Link href="/#memes" className="btn">
                See live memes
              </Link>
            </div>
          }
        >
          {snap.error ?? "Unknown error"}. Check the account name and your connection.
        </Notice>
      </div>
    );
  }

  const d = snap.data;
  const { metadata, info, pool, treasury, params } = d;
  const ticker = info?.stock.ticker ?? "?";
  const stockName = TESTNET_VENUES[ticker]?.name;
  const chains = normaliseTreasury(d.chains, info?.stock ?? null);
  const nav = estimateNav(pool, treasury, ledgerHoldings(chains, treasury?.stock_units), d.price);
  const contractMnav = lastMnav(treasury);
  const thresholds = {
    redemption: params.redemption_mnav_bps / 10_000,
    buyback: params.buyback_mnav_bps / 10_000,
    issuance: params.issuance_mnav_bps / 10_000,
  };
  const seeded = pool ? toBig(pool.usdc_reserve) > 0n : false;
  const spotUsd = pool ? scaledToUsd(toBig(pool.spot_price)) : null;
  const stockPrice = oracleUsd(d.price);
  const now = d.fetchedAt;
  const priceAge = d.price ? now - d.price.publish_time : null;
  const stale = priceAge !== null && priceAge > params.oracle_max_age_secs;
  const canRebalance = !!treasury && (treasury.last_rebalance === 0 || now >= treasury.next_rebalance);
  const bufferTarget = params.cash_buffer_bps / 10_000;
  const refillAt = params.cash_refill_bps / 10_000;
  const epochCap = toBig(treasury?.epoch_cap);
  const epochIssued = toBig(treasury?.epoch_issued);
  const shownMnav = nav.mnav ?? contractMnav;
  const zone = zoneOf(shownMnav, thresholds);
  const cashPct = (nav.cashShare ?? 0) * 100;
  // The buffer bar spans 0 to twice the target, so the 20% mark sits mid-bar.
  const barMax = Math.max(bufferTarget * 2, 0.01);
  const barAt = (x: number) => `${Math.min(100, (x / barMax) * 100)}%`;

  const reload = () => {
    snap.reload();
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
    }
  }

  return (
    <div className="wrap pt-6 pb-20 sm:pt-8">
      <Link href="/#memes" className="btn btn-ghost btn-sm -ml-3">
        <ArrowLeft className="size-4" aria-hidden />
        All memes
      </Link>

      {/* Identity */}
      <header className="mt-3 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <MemeIcon icon={metadata.icon} symbol={metadata.symbol} size={84} className="pop" />
          <div className="min-w-0">
            <h1 className="type-display !text-[clamp(2.25rem,6vw,4rem)] break-all">{metadata.symbol}</h1>
            <p className="mt-2 font-semibold text-soft">
              {metadata.name}, a tiny treasury company holding{" "}
              <span className="font-extrabold text-ink">{ticker}</span>
              {stockName && ` (${stockName})`}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5 text-sm sm:items-end">
          <a className="link inline-flex items-center gap-1 break-all" href={`${NEARBLOCKS}/address/${account}`} target="_blank" rel="noreferrer">
            {account}
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only"> on NearBlocks (opens in a new tab)</span>
          </a>
          {info && (
            <span className="font-semibold text-soft" title={info.creator}>
              Created by {shortAddr(info.creator, 16, 10)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={reload} disabled={snap.loading}>
            <RefreshCw className={cn("size-4", snap.loading && "animate-spin")} aria-hidden />
            Refresh data
          </Button>
        </div>
      </header>

      <nav aria-label="On this page" className="mt-5 flex gap-2 overflow-x-auto pb-1 text-sm">
        {[
          ["#trade", "Trade", "lg:hidden"],
          ["#treasury", "Treasury", ""],
          ["#cash", "Cash buffer", ""],
          ["#sheet", "Balance sheet", ""],
          ["#rules", "Locked rules", ""],
          ["#activity", "Activity", ""],
        ].map(([href, label, cls]) => (
          <a key={href} href={href} className={cn("chip shrink-0", cls)}>
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-6 grid gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* A: the headline story */}
        <div className="grid min-w-0 gap-5 lg:col-start-1">
          <dl className="grid gap-4 sm:grid-cols-3">
            <StatTile
              tone="bg-white"
              label={
                nav.usesTwap ? (
                  <>
                    Price (<Term k="twap" align="start">30-min TWAP</Term>)
                  </>
                ) : (
                  "Price (spot)"
                )
              }
              value={seeded ? nav.priceUsd : null}
              format={fmtPrice}
              title={seeded ? fmtPriceLong(nav.priceUsd) : undefined}
              note={seeded && spotUsd !== null && nav.usesTwap ? `Spot ${fmtPrice(spotUsd)}` : seeded ? undefined : "Pool not seeded"}
            />
            <StatTile
              tone="bg-blue-wash"
              label={
                <>
                  <Term k="nav" align="start">NAV</Term> per token
                </>
              }
              value={nav.navUsd}
              format={fmtPrice}
              title={nav.navUsd !== null ? fmtPriceLong(nav.navUsd) : undefined}
              note={nav.navUsd === null ? "Starts once tokens circulate" : "Estimated now from the ledger and the oracle"}
            />
            <StatTile
              tone="bg-golden-wash"
              label={<Term k="mnav">mNAV now</Term>}
              value={nav.mnav}
              format={fmtTimes}
              badge={zone && <span className={cn("pill border-2 border-ink !bg-white", ZONE_PILL[zone])}>{zoneName(zone)}</span>}
              note={
                contractMnav !== null
                  ? `Last rebalance: ${fmtTimes(contractMnav)}${treasury?.last_rebalance ? `, ${timeAgo(treasury.last_rebalance)}` : ""}`
                  : "No rebalance yet"
              }
            />
          </dl>

          <div className="card p-4 sm:p-6">
            <p className="max-w-[60ch] text-lg leading-snug font-extrabold sm:text-xl">
              {mnavSentence(shownMnav, thresholds, ticker)}
            </p>
            <MnavGauge
              value={shownMnav}
              thresholds={thresholds}
              label={nav.mnav !== null ? "mNAV now" : "Last mNAV"}
              legend
              className="mt-4"
            />
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-soft">
              <span className={cn("pill", treasury?.redemption_open ? "pill-green" : "")}>
                Redemption window {treasury?.redemption_open ? "open" : "closed"}
              </span>
              The floor defends NAV, not the price.
            </p>
          </div>
        </div>

        {/* B: actions, sticky on desktop, right after the story on mobile */}
        <aside id="trade" aria-label="Trade and rebalance" className="scroll-mt-28 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="grid gap-5 lg:sticky lg:top-24">
            <TradePanel snap={d} user={user.data ?? null} onDone={reload} />

            <div className="card p-4 sm:p-5">
              <p className="type-h3 flex items-center gap-2">
                <Scale className="size-5" aria-hidden />
                Run the rules
              </p>
              <p className="mt-1.5 text-sm font-semibold text-soft">
                A rebalance reads the oracle and the average price, then issues, buys back, opens
                redemption or does nothing. Anyone can call it once per {fmtSecs(params.rebalance_cooldown_secs)}.
              </p>
              <p className="mt-3 text-sm font-extrabold">
                {!treasury
                  ? "Treasury view unavailable."
                  : treasury.last_rebalance === 0
                    ? "Never rebalanced. Available now."
                    : canRebalance
                      ? `Last run ${timeAgo(treasury.last_rebalance)}. Available now.`
                      : `Next run available in ${Math.ceil((treasury.next_rebalance - now) / 60)} min.`}
              </p>
              {accountId ? (
                <Button className="mt-4 w-full" variant="golden" disabled={!canRebalance || rebalancing} onClick={rebalance}>
                  {rebalancing ? <span className="dots">Waiting for your wallet</span> : canRebalance ? "Rebalance now" : "Cooling down"}
                </Button>
              ) : (
                <Button className="mt-4 w-full" variant="outline" onClick={() => connect().catch(() => undefined)}>
                  Connect a wallet to rebalance
                </Button>
              )}
              {rebalanceMsg && (
                <p
                  role={rebalanceMsg.error ? "alert" : "status"}
                  className={cn(
                    "mt-3 rounded-xl border-2 p-2.5 text-sm font-bold break-words",
                    rebalanceMsg.error ? "border-red bg-red-wash text-red-ink" : "border-green bg-green-wash text-green-ink",
                  )}
                >
                  {rebalanceMsg.text}
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* C: the proof dashboard */}
        <div className="grid min-w-0 gap-12 lg:col-start-1">
          <Section
            id="treasury"
            title="Treasury per chain"
            intro={
              <>
                Addresses only this contract can sign for, through NEAR Chain Signatures
                {d.chains?.mpc ? ` (MPC ${d.chains.mpc})` : ""}. It signs two shapes per chain: an
                approval to the locked router and a swap from USDC into {ticker}. The ledger books
                the minimum out of every swap; on-chain is read live by your browser.
                {d.chains?.signing ? " A signature request is in flight." : ""}
              </>
            }
          >
            <TreasuryChains chains={chains} price={d.price} ticker={ticker} note={d.chainsNote} raw={d.chains} />
          </Section>

          <Section
            id="cash"
            title="Cash buffer"
            intro={
              <>
                Redemptions are paid from USDC on NEAR. The target is {bufferTarget * 100}% of assets;
                below {refillAt * 100}% a stock sale refills it. Buybacks only spend cash above the{" "}
                <Term k="buffer">buffer</Term>.
              </>
            }
          >
            <div className="card p-4 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="type-num text-4xl">{nav.cashShare !== null ? `${cashPct.toFixed(1)}%` : "–"}</p>
                <p className="font-extrabold">{fmtUsd(nav.cashUsd)} in USDC on NEAR</p>
              </div>
              <div className="relative mt-9 mb-7">
                <div
                  className="bar !h-7"
                  role="meter"
                  aria-label="Cash as a share of assets"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Number(cashPct.toFixed(1))}
                  aria-valuetext={`Cash is ${cashPct.toFixed(1)}% of assets. Target ${bufferTarget * 100}%, refill below ${refillAt * 100}%.`}
                >
                  <div
                    className="bar-fill"
                    style={{
                      width: barAt(nav.cashShare ?? 0),
                      background: (nav.cashShare ?? 0) < refillAt ? "var(--orange)" : "var(--green)",
                    }}
                  />
                </div>
                {(
                  [
                    [bufferTarget, `Target ${bufferTarget * 100}%`, "top"],
                    [refillAt, `Refill ${refillAt * 100}%`, "bottom"],
                  ] as const
                ).map(([x, label, side]) => (
                  <span key={label} className="absolute inset-y-[-6px] w-1 -translate-x-1/2 rounded-full bg-ink" style={{ left: barAt(x) }} aria-hidden>
                    <span
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 text-xs font-extrabold whitespace-nowrap",
                        side === "top" ? "bottom-full mb-1" : "top-full mt-1",
                      )}
                    >
                      {label}
                    </span>
                  </span>
                ))}
              </div>
              <p className="text-sm font-semibold text-soft">
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

          <Section id="sheet" title="Balance sheet">
            <div className="card p-4 sm:p-6">
              <table className="w-full text-[0.9375rem]">
                <caption className="sr-only">Treasury assets and NAV per token</caption>
                <tbody>
                  <SheetRow k="USDC cash on NEAR" v={fmtUsd(nav.cashUsd)} />
                  <SheetRow k="USDC on treasury chains (ledger)" v={fmtUsd(nav.chainUsdcUsd)} />
                  <SheetRow
                    k={`${ticker} on treasury chains (ledger, at ${stockPrice !== null ? fmtUsd(stockPrice) : "no price"})`}
                    v={fmtUsd(nav.stockUsd)}
                  />
                  <SheetRow k="Total assets" v={fmtUsd(nav.assetsUsd)} strong />
                  <SheetRow k="Circulating supply" v={`${fmtAmount(nav.circulating)} ${metadata.symbol}`} />
                  <SheetRow k="NAV per token" v={nav.navUsd !== null ? fmtPriceLong(nav.navUsd) : "–"} strong />
                </tbody>
              </table>
              <p className={cn("mt-3 text-sm font-semibold", stale ? "text-orange-ink" : "text-soft")}>
                {d.price
                  ? `Oracle ${info?.oracle}: ${ticker} ${fmtUsd(stockPrice)}, published ${timeAgo(d.price.publish_time)}.${stale ? " Older than 15 minutes: every mNAV action pauses until it updates; trading continues." : ""}`
                  : `No price for ${ticker} from the oracle${info ? ` ${info.oracle}` : ""}. Stock is valued at zero here until one is published.`}
              </p>
            </div>
          </Section>

          <Section
            id="rules"
            title="Locked rules"
            intro={d.paramsFromContract ? "Read from get_params. No owner, no setter." : "get_params unavailable: showing the SPEC defaults."}
          >
            <div className="card p-4 sm:p-6">
              <table className="w-full text-[0.9375rem]">
                <caption className="sr-only">Locked parameters</caption>
                <tbody>
                  <SheetRow k="Issuance above" v={`${fmtTimes(thresholds.issuance)}, at most ${params.max_issuance_bps_per_epoch / 100}% of supply per ${fmtSecs(params.epoch_secs)}`} />
                  <SheetRow k="Issued this epoch" v={epochCap > 0n ? `${fmtRaw(epochIssued, MEME_DECIMALS)} of ${fmtRaw(epochCap, MEME_DECIMALS)}` : "Epoch starts at the first rebalance"} />
                  <SheetRow k="Buyback below" v={`${fmtTimes(thresholds.buyback)}, cash above the ${bufferTarget * 100}% buffer only`} />
                  <SheetRow k="Redemption below" v={`${fmtTimes(thresholds.redemption)}, at NAV per token`} />
                  <SheetRow k="Pool fee" v={`${params.pool_fee_bps / 100}% (${params.treasury_fee_bps / 100}% treasury, ${params.creator_fee_bps / 100}% creator)`} />
                  <SheetRow k="Price for mNAV" v={`${fmtSecs(params.twap_window_secs)} TWAP`} />
                  <SheetRow k="Oracle staleness limit" v={fmtSecs(params.oracle_max_age_secs)} />
                  <SheetRow k="Rebalance cooldown" v={`${fmtSecs(params.rebalance_cooldown_secs)}, caller tip ${params.caller_tip_bps / 100}%`} />
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="activity" title="Activity">
            <EventLog account={account} symbol={metadata.symbol} />
          </Section>
        </div>
      </div>
    </div>
  );
}
