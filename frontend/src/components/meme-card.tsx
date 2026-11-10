"use client";

import Link from "next/link";
import { cn } from "cn";
import { MnavGauge } from "./mnav-gauge";
import { MemeIcon } from "./meme-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ledgerHoldings, normaliseTreasury } from "@/lib/chains";
import { toBig } from "@/lib/format";
import { estimateNav, lastMnav, scaledToUsd } from "@/lib/math";
import { loadMeme } from "@/lib/meme";
import { fmtPrice, fmtPriceLong } from "@/lib/price";
import { fmtTimes, zoneName, zoneOf, type Zone } from "@/lib/mnav";
import { useAsync } from "@/lib/use-async";
import { TESTNET_VENUES } from "@/lib/venues";

export const ZONE_PILL: Record<Zone, string> = {
  redeem: "pill-red",
  buyback: "pill-orange",
  free: "pill-green",
  issuance: "pill-golden",
};

export function MemeCardSkeleton() {
  return (
    <div className="card flex flex-col gap-4 p-5" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 -rotate-3" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <Skeleton className="h-4 rounded-full" />
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-xl bg-page px-2.5 py-2">
      <dt className="text-xs font-bold text-soft">{label}</dt>
      <dd className="type-num mt-1 truncate text-[1.0625rem]" title={title}>
        {value}
      </dd>
    </div>
  );
}

export function MemeCard({ account }: { account: string }) {
  const { data, error, loading } = useAsync(() => loadMeme(account), [account]);

  if (loading && !data) return <MemeCardSkeleton />;
  if (error || !data) {
    return (
      <div className="flex flex-col gap-1 rounded-3xl border-2 border-dashed border-red bg-red-wash p-5 text-sm" role="alert">
        <span className="font-extrabold break-all">{account}</span>
        <span className="text-soft">Could not read this meme: {error}</span>
      </div>
    );
  }

  const { metadata, info, pool, treasury } = data;
  const ticker = info?.stock.ticker;
  const chains = normaliseTreasury(data.chains, info?.stock ?? null);
  const nav = estimateNav(pool, treasury, ledgerHoldings(chains, treasury?.stock_units), data.price);
  const seeded = pool ? toBig(pool.usdc_reserve) > 0n : false;
  const contractMnav = lastMnav(treasury);
  const shownMnav = nav.mnav ?? contractMnav;
  const t = {
    redemption: data.params.redemption_mnav_bps / 10_000,
    buyback: data.params.buyback_mnav_bps / 10_000,
    issuance: data.params.issuance_mnav_bps / 10_000,
  };
  const zone = zoneOf(shownMnav, t);
  const venues = chains.filter((c) => c.stockToken).length;
  const spot = seeded && pool ? scaledToUsd(toBig(pool.spot_price)) : null;

  return (
    <Link href={`/meme/${account}`} className="card card-lift group flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <MemeIcon icon={metadata.icon} symbol={metadata.symbol} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-2xl leading-tight font-black tracking-tight">{metadata.symbol}</p>
          <p className="truncate text-sm font-semibold text-soft">{metadata.name}</p>
        </div>
        <span className={cn("pill", zone ? ZONE_PILL[zone] : "")}>{zone ? zoneName(zone) : seeded ? "New" : "Not seeded"}</span>
      </div>
      <p className="text-[0.9375rem] font-semibold">
        {ticker ? (
          <>
            Holds <span className="font-extrabold">{ticker}</span>
            {TESTNET_VENUES[ticker] && <span className="text-soft"> ({TESTNET_VENUES[ticker].name})</span>}
            {venues > 0 && ` on ${venues} ${venues === 1 ? "chain" : "chains"}`}
          </>
        ) : (
          <span className="text-soft">Thesis stock unknown</span>
        )}
      </p>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Price" value={spot !== null ? fmtPrice(spot) : "–"} title={spot !== null ? fmtPriceLong(spot) : undefined} />
        <Stat
          label="NAV / token"
          value={nav.navUsd !== null ? fmtPrice(nav.navUsd) : "–"}
          title={nav.navUsd !== null ? fmtPriceLong(nav.navUsd) : undefined}
        />
        <Stat label="mNAV" value={fmtTimes(shownMnav)} />
      </dl>
      <MnavGauge value={shownMnav} thresholds={t} size="sm" />
      {nav.navUsd === null && (
        <p className="text-xs font-semibold text-soft">
          {seeded
            ? "No tokens circulate yet: NAV starts with the first buy."
            : "Waiting for the creator to seed the pool."}
        </p>
      )}
      <span className="mt-auto text-sm font-extrabold text-blue-ink group-hover:underline">Open the balance sheet</span>
    </Link>
  );
}
