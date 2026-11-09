"use client";

import Link from "next/link";
import { MnavRuler } from "./mnav-ruler";
import { MemeIcon } from "./meme-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ledgerHoldings, normaliseTreasury } from "@/lib/chains";
import { fmtMnav, fmtUsd, toBig } from "@/lib/format";
import { estimateNav, lastMnav, scaledToUsd } from "@/lib/math";
import { loadMeme } from "@/lib/meme";
import { useAsync } from "@/lib/use-async";
import { TESTNET_VENUES } from "@/lib/venues";

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-rule py-1.5 text-sm">
      <dt className="text-graphite">{label}</dt>
      <dd className="text-right">
        {value}
        {hint && <span className="ml-1 text-xs text-graphite">{hint}</span>}
      </dd>
    </div>
  );
}

export function MemeCard({ account }: { account: string }) {
  const { data, error, loading } = useAsync(() => loadMeme(account), [account]);

  if (loading && !data) {
    return (
      <div className="frame flex flex-col gap-3 p-5" aria-busy>
        <Skeleton className="h-12 w-2/3 rounded-none" />
        <Skeleton className="h-24 w-full rounded-none" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-1 border border-dashed border-ink p-5 text-sm">
        <span className="type-wide">{account}</span>
        <span className="text-graphite">Could not read this meme: {error}</span>
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

  return (
    <Link
      href={`/meme/${account}`}
      className="frame group flex flex-col gap-4 p-5 transition-colors hover:bg-wash focus-visible:bg-wash"
    >
      <div className="flex items-start gap-3">
        <MemeIcon icon={metadata.icon} symbol={metadata.symbol} />
        <div className="min-w-0">
          <p className="type-wide truncate text-2xl leading-tight group-hover:underline">
            {metadata.symbol}
          </p>
          <p className="truncate text-sm text-graphite">{metadata.name}</p>
        </div>
      </div>
      <p className="text-sm">
        {ticker ? (
          <>
            Holds <span className="font-semibold">{ticker}</span>
            {TESTNET_VENUES[ticker] && (
              <span className="text-graphite"> ({TESTNET_VENUES[ticker].name})</span>
            )}
          </>
        ) : (
          <span className="text-graphite">Thesis stock unknown</span>
        )}
      </p>
      <dl>
        <Row
          label="Price"
          value={seeded && pool ? fmtUsd(scaledToUsd(toBig(pool.spot_price))) : "Not seeded"}
        />
        <Row label="NAV per token" value={nav.navUsd !== null ? fmtUsd(nav.navUsd) : "–"} />
        <Row
          label="mNAV"
          value={fmtMnav(shownMnav)}
          hint={
            nav.mnav === null && contractMnav !== null
              ? "last rebalance"
              : contractMnav !== null
                ? `contract ${fmtMnav(contractMnav)}`
                : undefined
          }
        />
      </dl>
      <MnavRuler value={shownMnav} thresholds={t} size="sm" />
      {nav.navUsd === null && (
        <p className="text-xs text-graphite">
          {seeded
            ? "No tokens circulate yet: NAV starts with the first buy."
            : "Waiting for the creator to seed the pool."}
        </p>
      )}
    </Link>
  );
}
