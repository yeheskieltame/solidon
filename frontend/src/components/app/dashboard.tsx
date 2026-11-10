"use client";

import { ArrowUpRight, Eye, HandCoins, LockOpen, RefreshCw, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { cn } from "cn";
import { LogoTile, StockLogo } from "@/components/brand-logo";
import { describeEvent, eventKind } from "@/components/event-log";
import { MemeIcon } from "@/components/meme-icon";
import { ZoneBadge } from "@/components/mnav-gauge";
import { Notice } from "@/components/notice";
import { Stat, StatRow } from "@/components/stat";
import { useToast } from "@/components/toast";
import { GetTestUsdcButton } from "@/components/wallet-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/lib/app-link";
import { PLATFORM_LOGOS } from "@/lib/brands";
import { NEARBLOCKS, USDC_DECIMALS } from "@/lib/config";
import { fetchMemeEvents, type MemeEvent } from "@/lib/events";
import { fmtUsdCompact } from "@/lib/figure";
import { fmtAmount, fmtRaw, fmtUsd, timeAgo } from "@/lib/format";
import { loadMarket } from "@/lib/market";
import { loadPortfolio, type Position } from "@/lib/portfolio";
import { fmtTimes } from "@/lib/mnav";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet } from "@/lib/wallet";

const pct = (n: number | null) =>
  n === null ? "–" : n === 0 ? "0%" : n < 0.0001 ? "<0.01%" : `${(n * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/**
 * The Dashboard tab: the connected account's USDC, positions in every meme, claims and activity.
 * `?account=<id>` shows any account read-only (no claims), which also works without a wallet.
 */
export function Dashboard() {
  const { accountId: wallet, ready, connect, send } = useWallet();
  const viewAs = useSearchParams().get("account")?.trim().toLowerCase() || null;
  const accountId = viewAs ?? wallet;
  const readOnly = !!viewAs && viewAs !== wallet;
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
    let failed: unknown = null;
    for (const p of held) {
      const events = await fetchMemeEvents(p.row.account, 8).catch((e: unknown) => {
        failed = e;
        return [];
      });
      for (const e of events) {
        const who = [e.data.account, e.data.old_owner_id, e.data.new_owner_id, e.data.owner_id];
        if (who.includes(accountId)) out.push({ ...e, symbol: p.row.symbol, account: p.row.account });
      }
    }
    if (out.length === 0 && failed) throw failed;
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
        <div className="px-2 py-14 text-center sm:py-20">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-page-deep text-ink" aria-hidden>
            <Wallet className="size-5" strokeWidth={1.75} />
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
          <ViewAsForm />
        </div>
      </Shell>
    );
  }

  const pf = data.data;
  const positions = pf?.positions ?? [];

  return (
    <Shell
      action={
        <Button variant="ghost" size="sm" onClick={() => setTick((t) => t + 1)} disabled={data.loading}>
          <RefreshCw className={cn(data.loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      }
    >
      {readOnly && (
        <p className="mb-10 flex flex-wrap items-center gap-2 rounded-xl bg-blue-wash px-3.5 py-2.5 text-sm text-blue-ink" role="status">
          <Eye className="size-4 shrink-0" aria-hidden />
          <span>
            Read-only view of <span className="font-medium">{accountId}</span>. Connect that wallet to claim or trade.
          </span>
        </p>
      )}
      {data.error ? (
        <Notice tone="error" title="Could not read your portfolio" action={<Button variant="outline" onClick={() => setTick((t) => t + 1)}>Try again</Button>}>
          {data.error}
        </Notice>
      ) : (
        <>
          <StatRow>
            <Stat
              label="Portfolio value"
              hint="Every meme you hold at its pool price."
              value={pf ? pf.totals.atPrice : null}
              format={fmtUsdCompact}
              sub={pf ? `A full sell returns ${fmtUsd(pf.totals.sellQuoteUsd)}` : undefined}
            />
            <Stat
              label="At NAV"
              hint="The treasury assets behind your tokens: your share of each meme's NAV."
              value={pf ? pf.totals.atNav : null}
              format={fmtUsdCompact}
              sub={pf && pf.totals.atPrice > 0 ? `${pct(pf.totals.atNav / pf.totals.atPrice)} of the pool value` : "Treasury assets behind your tokens"}
            />
            <Stat
              label="USDC"
              hint="USDC on NEAR in this account, ready to buy with."
              value={pf ? Number(pf.usdc) / 10 ** USDC_DECIMALS : null}
              format={fmtUsdCompact}
              sub={
                readOnly ? (
                  <span className="inline-flex items-center gap-1.5">
                    <LogoTile logo={PLATFORM_LOGOS.usdc} size={16} decorative className="!ring-0" />
                    On NEAR
                  </span>
                ) : (
                  <GetTestUsdcButton onDone={() => setTick((t) => t + 1)} label="Get test USDC" className="-ml-0.5" />
                )
              }
            />
            <Stat label="Claimable" hint="Creator fees, caller tips and failed payouts waiting for this account." value={pf ? pf.totals.claimableUsd : null} format={fmtUsdCompact} sub="Fees, tips, failed payouts" />
          </StatRow>

          <section aria-labelledby="positions-title" className="mt-16">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="positions-title" className="type-section">
                Positions
              </h2>
              {pf && <p className="text-sm text-soft">{positions.length} {positions.length === 1 ? "meme" : "memes"}</p>}
            </div>
            <div className="mt-3">
              {data.loading && !pf ? (
                <div className="panel grid gap-3 p-5" aria-busy aria-label="Loading positions">
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
                <div className="panel overflow-hidden">
                  <div className="hidden grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_13rem] gap-4 border-b border-line px-5 py-3.5 text-sm text-soft lg:grid">
                    <span>Meme</span>
                    <span>Balance</span>
                    <span>At pool price</span>
                    <span>At NAV</span>
                    <span>Share of treasury</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {positions.map((p) => (
                      <PositionRow key={p.row.account} p={p} busy={busy === p.row.account} onClaim={readOnly ? null : () => claim(p)} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="activity-title" className="mt-16">
            <h2 id="activity-title" className="type-section">
              Recent activity
            </h2>
            <div className="mt-5">
              {held.length === 0 ? (
                <p className="text-sm text-soft">Trades on memes you hold appear here.</p>
              ) : activity.loading && !activity.data ? (
                <Skeleton className="h-24 rounded-[18px]" />
              ) : activity.error ? (
                <Notice title="Activity is unavailable right now">
                  {activity.error}.{" "}
                  <a className="link" href={`${NEARBLOCKS}/address/${accountId}`} target="_blank" rel="noreferrer">
                    The account on NearBlocks
                  </a>
                </Notice>
              ) : (activity.data?.length ?? 0) === 0 ? (
                <Notice title="Nothing recent">
                  No trades by {accountId} in the latest transactions of your memes.{" "}
                  <a className="link" href={`${NEARBLOCKS}/address/${accountId}`} target="_blank" rel="noreferrer">
                    Your account on NearBlocks
                  </a>
                </Notice>
              ) : (
                <ol className="panel divide-y divide-line">
                  {activity.data!.map((e, i) => {
                    const kind = eventKind(e.event);
                    const Icon = kind.icon;
                    return (
                      <li key={`${e.txHash}-${i}`} className="flex items-center gap-3 px-5 py-4">
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", kind.tint)} aria-hidden>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.9375rem]">
                            {kind.label} <span className="text-soft">on {e.symbol}</span>
                          </p>
                          <p className="text-[0.8125rem] break-words text-soft">{describeEvent(e, e.symbol)}</p>
                        </div>
                        <a href={`${NEARBLOCKS}/txns/${e.txHash}`} target="_blank" rel="noreferrer" className="num-link shrink-0 text-sm">
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
    <div className="wrap pt-10 pb-20 sm:pt-14">
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Dashboard</h1>
          <p className="mt-2 text-soft">Your positions across every meme, read live from NEAR.</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function PositionRow({ p, busy, onClaim }: { p: Position; busy: boolean; onClaim: (() => void) | null }) {
  const r = p.row;
  return (
    <li className="grid gap-4 px-5 py-4 transition-colors hover:bg-[var(--hover)] lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_13rem] lg:items-center">
      <div className="flex items-center gap-3">
        <MemeIcon icon={r.icon} symbol={r.symbol} size={40} />
        <div className="min-w-0">
          <AppLink href={`/meme/${r.account}`} className="hover:underline">
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
        {p.claimable > 0n && !onClaim && (
          <span className="pill pill-golden">
            <HandCoins aria-hidden />
            {fmtRaw(p.claimable, USDC_DECIMALS, 4)} USDC claimable
          </span>
        )}
        {p.claimable > 0n && onClaim && (
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
      <p className="text-xs text-soft lg:sr-only">{k}</p>
      <p className="text-right lg:text-left">
        <span className="block text-[0.9375rem] tabular-nums">{v}</span>
        {sub && <span className="block text-xs text-soft">{sub}</span>}
      </p>
    </div>
  );
}

/** Look up any account's portfolio without connecting: sets ?account= on the URL. */
function ViewAsForm() {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <form
      className="mx-auto mt-10 flex max-w-md flex-wrap items-center justify-center gap-2 border-t border-line pt-8"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim().toLowerCase();
        if (v) router.push(`${pathname}?account=${encodeURIComponent(v)}`);
      }}
    >
      <label htmlFor={id} className="w-full text-sm text-soft">
        Or look at any account, read-only
      </label>
      <input
        id={id}
        className="field !min-h-10 min-w-0 flex-1"
        placeholder="name.testnet"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
      />
      <Button type="submit" variant="outline" disabled={!value.trim()}>
        View
      </Button>
    </form>
  );
}
