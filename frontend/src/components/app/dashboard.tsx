"use client";

import { ArrowUpRight, HandCoins, LockOpen, RefreshCw, Wallet } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { LogoTile, StockLogo } from "@/components/brand-logo";
import { CountUp } from "@/components/count-up";
import { describeEvent, eventKind } from "@/components/event-log";
import { MemeIcon } from "@/components/meme-icon";
import { ZoneBadge } from "@/components/mnav-gauge";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { GetTestUsdcButton } from "@/components/wallet-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/lib/app-link";
import { PLATFORM_LOGOS } from "@/lib/brands";
import { NEARBLOCKS, USDC_DECIMALS } from "@/lib/config";
import { fetchMemeEvents, type MemeEvent } from "@/lib/events";
import { fmtAmount, fmtRaw, fmtUsd, timeAgo } from "@/lib/format";
import { loadMarket } from "@/lib/market";
import { loadPortfolio, type Position } from "@/lib/portfolio";
import { fmtTimes } from "@/lib/mnav";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet } from "@/lib/wallet";

const pct = (n: number | null) =>
  n === null ? "–" : n === 0 ? "0%" : n < 0.0001 ? "<0.01%" : `${(n * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** The Dashboard tab: the connected account's USDC, positions in every meme, claims and activity. */
export function Dashboard() {
  const { accountId, ready, connect, send } = useWallet();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const data = useAsync(async () => {
    if (!accountId) return null;
    const market = await loadMarket(tick > 0);
    return loadPortfolio(accountId, market.rows);
  }, [accountId, tick]);

  const held = (data.data?.positions ?? []).filter((p) => p.balance > 0n).slice(0, 3);
  const activity = useAsync(async (): Promise<(MemeEvent & { symbol: string; account: string })[]> => {
    if (!accountId || held.length === 0) return [];
    const out: (MemeEvent & { symbol: string; account: string })[] = [];
    // Sequential: the NearBlocks public API is rate limited.
    for (const p of held) {
      const events = await fetchMemeEvents(p.row.account, 8).catch(() => []);
      for (const e of events) {
        const who = [e.data.account, e.data.old_owner_id, e.data.new_owner_id, e.data.owner_id];
        if (who.includes(accountId)) out.push({ ...e, symbol: p.row.symbol, account: p.row.account });
      }
    }
    return out.sort((a, b) => b.time - a.time).slice(0, 12);
  }, [accountId, held.map((p) => p.row.account).join(",")]);

  async function claim(p: Position) {
    setBusy(p.row.account);
    const id = toast.show({ tone: "pending", title: `Claiming USDC from ${p.row.symbol}`, body: "Confirm it in your wallet." });
    try {
      await send([{ receiverId: p.row.account, methodName: "claim_usdc", args: {}, gas: 50, deposit: "0" }]);
      toast.update(id, {
        tone: "success",
        title: `Claimed ${fmtRaw(p.claimable, USDC_DECIMALS, 4)} USDC`,
        href: accountId ? `${NEARBLOCKS}/address/${accountId}` : undefined,
        hrefLabel: "Your transactions on NearBlocks",
        confetti: true,
      });
    } catch (e) {
      toast.update(id, { tone: "error", title: "The claim did not go through", body: errorText(e) });
    } finally {
      setBusy(null);
      setTick((t) => t + 1);
    }
  }

  if (!accountId) {
    return (
      <Shell>
        <div className="card relative isolate overflow-hidden px-6 py-14 text-center sm:py-20">
          <div className="halftone absolute inset-0 -z-10 opacity-60" aria-hidden />
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink text-white" aria-hidden>
            <Wallet className="size-5" />
          </span>
          <h2 className="type-h1 mx-auto mt-5 max-w-[20ch]">Connect a wallet to see your portfolio.</h2>
          <p className="mx-auto mt-3 max-w-[36rem] text-soft">
            Your USDC, every meme you hold valued at the pool price and at NAV, your share of each
            treasury and anything waiting to be claimed.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              disabled={!ready}
              onClick={() => connect().catch((e) => toast.show({ tone: "error", title: "Could not open the wallet picker", body: errorText(e) }))}
            >
              <Wallet aria-hidden />
              Connect wallet
            </Button>
            <AppLink href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Explore markets
            </AppLink>
          </div>
        </div>
      </Shell>
    );
  }

  const pf = data.data;
  const positions = pf?.positions ?? [];

  return (
    <Shell
      action={
        <Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)} disabled={data.loading}>
          <RefreshCw className={cn(data.loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      }
    >
      {data.error ? (
        <Notice tone="error" title="Could not read your portfolio" action={<Button variant="outline" onClick={() => setTick((t) => t + 1)}>Try again</Button>}>
          {data.error}
        </Notice>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-[var(--shadow-sm)] lg:grid-cols-4">
            <Tile label="Portfolio, at pool price" value={pf ? pf.totals.atPrice : null} note={pf ? `A full sell returns about ${fmtUsd(pf.totals.sellQuoteUsd)}` : undefined} />
            <Tile
              label="Backed by NAV"
              value={pf ? pf.totals.atNav : null}
              note={pf && pf.totals.atPrice > 0 ? `${pct(pf.totals.atNav / pf.totals.atPrice)} of the pool value` : "Treasury assets behind your tokens"}
            />
            <Tile
              label="USDC on NEAR"
              value={pf ? Number(pf.usdc) / 10 ** USDC_DECIMALS : null}
              icon={<LogoTile logo={PLATFORM_LOGOS.usdc} size={18} decorative rounded="full" className="!ring-0" />}
              extra={<GetTestUsdcButton onDone={() => setTick((t) => t + 1)} label="Get test USDC" />}
            />
            <Tile label="Claimable USDC" value={pf ? pf.totals.claimableUsd : null} note="Creator fees, tips and failed payouts" />
          </dl>

          <section aria-labelledby="positions-title" className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="positions-title" className="type-h3">
                Positions
              </h2>
              {pf && <p className="text-sm text-soft">{positions.length} {positions.length === 1 ? "meme" : "memes"}</p>}
            </div>
            <div className="mt-3">
              {data.loading && !pf ? (
                <div className="card grid gap-3 p-4" aria-busy aria-label="Loading positions">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : positions.length === 0 ? (
                <Notice
                  title="No positions yet"
                  action={
                    <AppLink href="/" className={buttonVariants()}>
                      Explore markets
                    </AppLink>
                  }
                >
                  Buy a meme from its page and it shows up here, valued at the pool price and at NAV.
                </Notice>
              ) : (
                <ul className="card divide-y divide-line overflow-hidden">
                  {positions.map((p) => (
                    <PositionRow key={p.row.account} p={p} busy={busy === p.row.account} onClaim={() => claim(p)} />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="activity-title" className="mt-8">
            <h2 id="activity-title" className="type-h3">
              Your recent activity
            </h2>
            <div className="mt-3">
              {held.length === 0 ? (
                <p className="text-sm text-soft">Trades on memes you hold appear here.</p>
              ) : activity.loading && !activity.data ? (
                <Skeleton className="h-24 rounded-2xl" />
              ) : (activity.data?.length ?? 0) === 0 ? (
                <Notice title="Nothing recent">
                  No trades by {accountId} in the latest transactions of your memes.{" "}
                  <a className="link" href={`${NEARBLOCKS}/address/${accountId}`} target="_blank" rel="noreferrer">
                    Your account on NearBlocks
                  </a>
                </Notice>
              ) : (
                <ol className="card divide-y divide-line">
                  {activity.data!.map((e, i) => {
                    const kind = eventKind(e.event);
                    const Icon = kind.icon;
                    return (
                      <li key={`${e.txHash}-${i}`} className="flex items-start gap-3 p-3.5">
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", kind.tint)} aria-hidden>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {kind.label} <span className="font-normal text-soft">on {e.symbol}</span>
                          </p>
                          <p className="text-[0.8125rem] break-words text-soft">{describeEvent(e, e.symbol)}</p>
                        </div>
                        <a href={`${NEARBLOCKS}/txns/${e.txHash}`} target="_blank" rel="noreferrer" className="link shrink-0 text-xs">
                          {e.time ? timeAgo(e.time) : "tx"}
                          <span className="sr-only">: transaction on NearBlocks (opens in a new tab)</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}

function Shell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="wrap pt-8 pb-16 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Dashboard</h1>
          <p className="mt-1.5 text-soft">Your positions across every meme, read live from NEAR.</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  icon,
  extra,
}: {
  label: string;
  value: number | null;
  note?: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-card p-4 sm:p-5">
      <dt className="flex items-center gap-1.5 text-xs text-soft">
        {icon}
        {label}
      </dt>
      <dd className="type-num mt-1.5 text-2xl sm:text-[1.75rem]">
        <CountUp value={value} format={fmtUsd} />
      </dd>
      {note && <dd className="mt-1 text-xs text-soft">{note}</dd>}
      {extra && <dd className="mt-3">{extra}</dd>}
    </div>
  );
}

function PositionRow({ p, busy, onClaim }: { p: Position; busy: boolean; onClaim: () => void }) {
  const r = p.row;
  return (
    <li className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_auto] lg:items-center">
      <div className="flex items-center gap-3">
        <MemeIcon icon={r.icon} symbol={r.symbol} size={40} />
        <div className="min-w-0">
          <AppLink href={`/meme/${r.account}`} className="font-medium hover:underline">
            {r.symbol}
          </AppLink>
          <p className="flex items-center gap-1.5 text-xs text-soft">
            <StockLogo ticker={r.ticker} size={14} decorative />
            {r.ticker ?? "?"}
            <ZoneBadge zone={r.zone} className="ml-1" />
          </p>
        </div>
      </div>
      <Cell k="Balance" v={`${fmtAmount(p.tokens)} ${r.symbol}`} />
      <Cell k="At pool price" v={fmtUsd(p.valueAtPrice)} />
      <Cell k="At NAV" v={fmtUsd(p.valueAtNav)} sub={`mNAV ${fmtTimes(r.mnav)}`} />
      <Cell k="Share of treasury" v={pct(p.shareOfTreasury)} sub={p.shareOfTreasury !== null ? `${fmtUsd(r.nav.assetsUsd * p.shareOfTreasury)} of ${fmtUsd(r.nav.assetsUsd)}` : undefined} />
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {p.redeemable && (
          <span className="pill pill-green">
            <LockOpen aria-hidden />
            Redeemable
          </span>
        )}
        {p.claimable > 0n && (
          <Button size="sm" variant="golden" disabled={busy} onClick={onClaim}>
            <HandCoins aria-hidden />
            {busy ? <span className="dots">Waiting</span> : `Claim ${fmtRaw(p.claimable, USDC_DECIMALS, 4)}`}
          </Button>
        )}
        <AppLink href={`/meme/${r.account}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Trade
          <ArrowUpRight aria-hidden />
        </AppLink>
      </div>
    </li>
  );
}

function Cell({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 lg:block">
      <p className="text-xs text-soft">{k}</p>
      <p className="text-right lg:text-left">
        <span className="block text-sm font-medium tabular-nums">{v}</span>
        {sub && <span className="block text-xs text-soft">{sub}</span>}
      </p>
    </div>
  );
}
