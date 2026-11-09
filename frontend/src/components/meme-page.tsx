"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import { EventLog } from "./event-log";
import { MemeIcon } from "./meme-icon";
import { MnavRuler, zoneOf } from "./mnav-ruler";
import { Notice } from "./notice";
import { TradePanel, useUserBalances } from "./trade-panel";
import { TreasuryChains } from "./treasury-chains";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ledgerHoldings, normaliseTreasury } from "@/lib/chains";
import { MEME_DECIMALS, NEARBLOCKS } from "@/lib/config";
import { fmtAmount, fmtMnav, fmtRaw, fmtUsd, timeAgo, toBig } from "@/lib/format";
import { estimateNav, lastMnav, oracleUsd, scaledToUsd } from "@/lib/math";
import { loadMeme } from "@/lib/meme";
import { useAsync } from "@/lib/use-async";
import { TESTNET_VENUES } from "@/lib/venues";
import { errorText, useWallet } from "@/lib/wallet";

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-t border-ink pt-3">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="type-wide mt-1 text-[clamp(1.75rem,4vw,2.75rem)] leading-none">{value}</dd>
      {note && <dd className="mt-2 text-xs text-graphite">{note}</dd>}
    </div>
  );
}

function SheetRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <tr className={cn("border-t", strong ? "border-ink font-semibold" : "border-rule")}>
      <th scope="row" className={cn("py-2 pr-4 text-left", strong ? "font-semibold" : "font-normal")}>{k}</th>
      <td className="py-2 text-right">{v}</td>
    </tr>
  );
}

function fmtSecs(s: number) {
  if (s % 86_400 === 0) return `${s / 86_400} day${s === 86_400 ? "" : "s"}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  return `${Math.round(s / 60)} minutes`;
}

export function MemePage({ account }: { account: string }) {
  const snap = useAsync(() => loadMeme(account), [account]);
  const { accountId, send, connect } = useWallet();
  const user = useUserBalances(account, accountId);
  const [rebalanceMsg, setRebalanceMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [rebalancing, setRebalancing] = useState(false);

  if (snap.loading && !snap.data) {
    return (
      <div className="grid gap-6 pt-12" aria-busy>
        <Skeleton className="h-20 w-2/3 rounded-none" />
        <Skeleton className="h-40 w-full rounded-none" />
        <Skeleton className="h-96 w-full rounded-none" />
      </div>
    );
  }
  if (snap.error || !snap.data) {
    return (
      <div className="pt-12">
        <Notice
          tone="error"
          title={`Could not load ${account}`}
          action={
            <Button variant="outline" className="text-ink" onClick={snap.reload}>
              Try again
            </Button>
          }
        >
          {snap.error ?? "Unknown error"}. Check the account name, or go back to the{" "}
          <Link href="/" className="underline">
            launchpad
          </Link>
          .
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

  const reload = () => {
    snap.reload();
    user.reload();
  };

  async function rebalance() {
    setRebalancing(true);
    setRebalanceMsg(null);
    try {
      await send([{ receiverId: account, methodName: "rebalance", args: {}, gas: 150, deposit: "0" }]);
      setRebalanceMsg({ error: false, text: "Rebalance sent. The outcome appears in the event log." });
    } catch (e) {
      setRebalanceMsg({ error: true, text: errorText(e) });
    } finally {
      setRebalancing(false);
      reload();
    }
  }

  return (
    <div className="pt-10">
      {/* Identity */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <MemeIcon icon={metadata.icon} symbol={metadata.symbol} size={72} />
          <div className="min-w-0">
            <h1 className="type-display break-all text-[clamp(2.5rem,8vw,5rem)]">{metadata.symbol}</h1>
            <p className="mt-2 text-graphite">
              {metadata.name}, a treasury company holding{" "}
              <span className="font-semibold text-ink">{ticker}</span>
              {stockName && ` (${stockName})`}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
          <a className="underline underline-offset-4" href={`${NEARBLOCKS}/address/${account}`} target="_blank" rel="noreferrer">
            {account}
          </a>
          {info && <span className="text-graphite">Created by {info.creator}</span>}
          <Button variant="ghost" size="sm" onClick={reload} disabled={snap.loading}>
            {snap.loading ? "Refreshing…" : "Refresh data"}
          </Button>
        </div>
      </div>

      {/* Headline figures */}
      <dl className="mt-10 grid gap-6 sm:grid-cols-3">
        <Figure
          label={nav.usesTwap ? "Price (30-min TWAP)" : "Price (spot)"}
          value={seeded ? fmtUsd(nav.priceUsd) : "–"}
          note={seeded && spotUsd !== null && nav.usesTwap ? `Spot ${fmtUsd(spotUsd)}` : seeded ? undefined : "Pool not seeded"}
        />
        <Figure
          label="NAV per token"
          value={nav.navUsd !== null ? fmtUsd(nav.navUsd) : "–"}
          note={nav.navUsd === null ? "Starts once tokens circulate" : `Estimated now from the ledger and the oracle`}
        />
        <Figure
          label="mNAV now"
          value={fmtMnav(nav.mnav)}
          note={
            contractMnav !== null
              ? `Last rebalance: ${fmtMnav(contractMnav)}, ${treasury?.last_rebalance ? timeAgo(treasury.last_rebalance) : ""}`
              : "No rebalance yet"
          }
        />
      </dl>
      <div className="mt-8">
        <MnavRuler value={nav.mnav ?? contractMnav} thresholds={thresholds} label={nav.mnav !== null ? "mNAV now" : "Last mNAV"} />
        <p className="mt-3 text-sm">
          <span className="font-semibold">{zoneOf(nav.mnav ?? contractMnav, thresholds)}.</span>{" "}
          <span className="text-graphite">
            {nav.mnav === null && contractMnav === null
              ? "mNAV needs circulating tokens and a treasury value."
              : redemptionCopy(nav.mnav ?? contractMnav, thresholds, !!treasury?.redemption_open)}
          </span>
        </p>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_24rem]">
        {/* Proof dashboard */}
        <div className="min-w-0">
          <h2 className="type-wide border-b border-ink pb-3 text-3xl">Balance sheet</h2>

          <section aria-labelledby="assets" className="mt-6">
            <h3 id="assets" className="text-lg font-semibold">Assets and NAV</h3>
            <table className="mt-3 w-full text-sm">
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
                <SheetRow k="NAV per token" v={nav.navUsd !== null ? fmtUsd(nav.navUsd) : "–"} strong />
              </tbody>
            </table>
            <p className="mt-2 text-xs text-graphite">
              {d.price
                ? `Oracle ${info?.oracle}: ${ticker} ${fmtUsd(stockPrice)}, published ${timeAgo(d.price.publish_time)}.${stale ? " Older than 15 minutes: every mNAV action pauses until it updates; trading continues." : ""}`
                : `No price for ${ticker} from the oracle${info ? ` ${info.oracle}` : ""}. Stock is valued at zero here until one is published.`}
            </p>
          </section>

          <section aria-labelledby="buffer" className="mt-10">
            <h3 id="buffer" className="text-lg font-semibold">Cash buffer</h3>
            <p className="mt-1 text-sm text-graphite">
              Redemptions are paid from USDC on NEAR. The target is {bufferTarget * 100}% of assets;
              below {refillAt * 100}% a stock sale refills it. Buybacks only spend cash above the buffer.
            </p>
            <div className="relative mt-4 h-6 border border-ink" role="img" aria-label={`Cash is ${nav.cashShare !== null ? (nav.cashShare * 100).toFixed(1) : "0"}% of assets; target ${bufferTarget * 100}%`}>
              <div className="h-full bg-ink" style={{ width: `${Math.min(100, (nav.cashShare ?? 0) * 100)}%` }} />
              {[refillAt, bufferTarget].map((x) => (
                <span key={x} className="absolute inset-y-[-6px] w-px bg-ink outline outline-1 outline-paper" style={{ left: `${x * 100}%` }} aria-hidden />
              ))}
            </div>
            <div className="relative mt-1 h-4 text-[11px] text-graphite" aria-hidden>
              <span className="absolute -translate-x-1/2" style={{ left: `${refillAt * 100}%` }}>refill {refillAt * 100}%</span>
              <span className="absolute -translate-x-1/2 pl-8" style={{ left: `${bufferTarget * 100}%` }}>target {bufferTarget * 100}%</span>
            </div>
            <p className="mt-2 text-sm">
              Cash is {nav.cashShare !== null ? `${(nav.cashShare * 100).toFixed(1)}%` : "–"} of assets ({fmtUsd(nav.cashUsd)}).
            </p>
          </section>

          <section aria-labelledby="chains" className="mt-10">
            <h3 id="chains" className="text-lg font-semibold">Treasury per chain</h3>
            <p className="mt-1 text-sm text-graphite">
              Addresses controlled only by this contract through NEAR Chain Signatures
              {d.chains?.mpc ? ` (MPC ${d.chains.mpc})` : ""}. The contract signs two shapes per
              chain: an approve to the locked router and a swap from USDC into {ticker}.
              {d.chains?.signing ? " A signature request is in flight." : ""}
            </p>
            <div className="mt-4">
              <TreasuryChains chains={chains} price={d.price} ticker={ticker} note={d.chainsNote} />
            </div>
          </section>

          <section aria-labelledby="rules" className="mt-10">
            <h3 id="rules" className="text-lg font-semibold">Locked rules</h3>
            <p className="mt-1 text-sm text-graphite">
              {d.paramsFromContract ? "Read from get_params. No owner, no setter." : "get_params unavailable: showing the SPEC defaults."}
            </p>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Locked parameters</caption>
              <tbody>
                <SheetRow k="Issuance above" v={`${fmtMnav(thresholds.issuance)}, at most ${params.max_issuance_bps_per_epoch / 100}% of supply per ${fmtSecs(params.epoch_secs)}`} />
                <SheetRow k="Issued this epoch" v={epochCap > 0n ? `${fmtRaw(epochIssued, MEME_DECIMALS)} of ${fmtRaw(epochCap, MEME_DECIMALS)}` : "Epoch starts at the first rebalance"} />
                <SheetRow k="Buyback below" v={`${fmtMnav(thresholds.buyback)}, cash above the ${bufferTarget * 100}% buffer only`} />
                <SheetRow k="Redemption below" v={`${fmtMnav(thresholds.redemption)}, at NAV per token`} />
                <SheetRow k="Pool fee" v={`${params.pool_fee_bps / 100}% (${params.treasury_fee_bps / 100}% treasury, ${params.creator_fee_bps / 100}% creator)`} />
                <SheetRow k="Price for mNAV" v={`${fmtSecs(params.twap_window_secs)} TWAP`} />
                <SheetRow k="Oracle staleness limit" v={fmtSecs(params.oracle_max_age_secs)} />
                <SheetRow k="Rebalance cooldown" v={`${fmtSecs(params.rebalance_cooldown_secs)}, caller tip ${params.caller_tip_bps / 100}%`} />
              </tbody>
            </table>
          </section>

          <section aria-labelledby="log" className="mt-10">
            <h3 id="log" className="text-lg font-semibold">Event log</h3>
            <div className="mt-2">
              <EventLog account={account} symbol={metadata.symbol} />
            </div>
          </section>
        </div>

        {/* Actions */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <TradePanel snap={d} user={user.data ?? null} onDone={reload} />

          <div className="border border-ink p-5">
            <p className="type-wide text-lg">Rebalance</p>
            <p className="mt-1 text-sm text-graphite">
              Runs the mNAV engine: reads the oracle and the TWAP, then issues, buys back, opens
              redemption or does nothing. Anyone can call it once per {fmtSecs(params.rebalance_cooldown_secs)}.
            </p>
            <p className="mt-3 text-sm">
              {!treasury
                ? "Treasury view unavailable."
                : treasury.last_rebalance === 0
                  ? "Never rebalanced. Available now."
                  : canRebalance
                    ? `Last run ${timeAgo(treasury.last_rebalance)}. Available now.`
                    : `Next run available in ${Math.ceil((treasury.next_rebalance - now) / 60)} min.`}
            </p>
            {accountId ? (
              <Button className="mt-4 h-10 w-full" variant="outline" disabled={!canRebalance || rebalancing} onClick={rebalance}>
                {rebalancing ? "Waiting for the wallet…" : "Rebalance"}
              </Button>
            ) : (
              <Button className="mt-4 h-10 w-full" variant="outline" onClick={() => connect().catch(() => undefined)}>
                Connect wallet to rebalance
              </Button>
            )}
            {rebalanceMsg && (
              <p role={rebalanceMsg.error ? "alert" : "status"} className={cn("mt-3 p-2 text-sm", rebalanceMsg.error ? "bg-ink text-paper" : "border border-ink")}>
                {rebalanceMsg.text}
              </p>
            )}
          </div>

          <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "self-start")}>
            Back to the launchpad
          </Link>
        </aside>
      </div>
    </div>
  );
}

function redemptionCopy(
  m: number | null,
  t: { redemption: number; buyback: number; issuance: number },
  open: boolean,
): string {
  if (m === null) return "";
  const window = open ? "The redemption window is open." : "The redemption window is closed.";
  if (m < t.redemption) return `Holders can redeem at NAV once a rebalance confirms it. ${window}`;
  if (m < t.buyback) return `Surplus cash buys back and burns at the next rebalance. ${window}`;
  if (m <= t.issuance) return `The premium moves freely; the contract takes no action. ${window}`;
  return `The next rebalance sells a small, accretive issuance into the pool. ${window}`;
}
