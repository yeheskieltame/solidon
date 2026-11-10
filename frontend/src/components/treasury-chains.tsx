"use client";

import { BadgeCheck, ExternalLink, Radio, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { ChainLogo, LogoTile, StockLogo } from "./brand-logo";
import { Notice } from "./notice";
import { Term } from "./term";
import { Skeleton } from "@/components/ui/skeleton";
import { readOnChain, type OnChainBalance, type TreasuryChain } from "@/lib/chains";
import { PLATFORM_LOGOS } from "@/lib/brands";
import { USDC_DECIMALS } from "@/lib/config";
import { fmtRaw, fmtUsd, shortAddr, toNumber } from "@/lib/format";
import { stockUsd } from "@/lib/math";
import type { PythPrice, TreasuryChainsRaw } from "@/lib/near";
import { PROOF_COPY, chainProof } from "@/lib/proof";
import { useAsync } from "@/lib/use-async";

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Two matching bars: what the contract wrote down, and what the chain holds right now. */
function Compare({
  label,
  ledger,
  chain,
  decimals,
  loading,
  icon,
}: {
  label: string;
  ledger: bigint | null;
  chain: bigint | null;
  decimals: number;
  loading: boolean;
  icon?: ReactNode;
}) {
  const l = ledger === null ? 0 : toNumber(ledger, decimals);
  const c = chain === null ? 0 : toNumber(chain, decimals);
  const max = Math.max(l, c);
  const width = (n: number) => (max > 0 ? `${Math.max(3, (n / max) * 100)}%` : "0%");

  let verdict: { ok: boolean; text: string } | null = null;
  if (ledger !== null && chain !== null) {
    if (chain === ledger) verdict = { ok: true, text: "Matches exactly" };
    else if (chain > ledger) verdict = { ok: true, text: `Covered: the chain holds ${fmtRaw(chain - ledger, decimals, 6)} more` };
    else verdict = { ok: false, text: `The chain holds ${fmtRaw(ledger - chain, decimals, 6)} less than the ledger` };
  }

  return (
    <div className="panel p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">{icon}{label}</p>
        {loading ? (
          <span className="pill">
            <span className="dots">Reading the chain</span>
          </span>
        ) : verdict ? (
          <span className={cn("pill", verdict.ok ? "pill-green" : "pill-orange")}>
            {verdict.ok ? <BadgeCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
            {verdict.text}
          </span>
        ) : (
          <span className="pill">{ledger === null ? "Not tracked by this contract" : "Chain not readable"}</span>
        )}
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        {(
          [
            { k: "ledger", name: "Ledger", raw: ledger, n: l, color: "#8ea2ff", wait: false },
            { k: "onchain", name: "On-chain", raw: chain, n: c, color: "var(--green)", wait: loading },
          ] as const
        ).map((row) => (
          <div key={row.k} className="grid grid-cols-[4.75rem_1fr] items-center gap-x-3 sm:grid-cols-[4.75rem_1fr_9.5rem]">
            <dt className="text-soft">
              <Term k={row.k} align="start">
                {row.name}
              </Term>
            </dt>
            <dd className="contents">
              {row.wait ? (
                <Skeleton className="h-1.5 rounded-full" />
              ) : (
                <span className="bar block" aria-hidden>
                  {row.raw !== null && row.n > 0 && <span className="bar-fill block" style={{ width: width(row.n), background: row.color }} />}
                </span>
              )}
              <span className="col-span-2 text-right font-medium tabular-nums sm:col-span-1">
                {row.wait ? "…" : row.raw === null ? "–" : fmtRaw(row.raw, decimals, 8)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ChainCard({
  c,
  price,
  ticker,
  raw,
}: {
  c: TreasuryChain;
  price: PythPrice | null;
  ticker: string;
  raw: TreasuryChainsRaw | null;
}) {
  const onChain = useAsync<OnChainBalance>(() => readOnChain(c), [c.key, c.address, c.stockToken, c.usdcToken]);
  const stockUnit = c.stockSymbol ?? ticker;
  const valued = c.ledgerStock !== null ? stockUsd(c.ledgerStock, c.stockDecimals, price) : null;
  const proof = chainProof(raw, c.key);
  const copy = PROOF_COPY[proof.kind];
  const reading = onChain.loading && !!c.address;

  return (
    <article className="card overflow-hidden" aria-labelledby={`chain-${c.key}`}>
            <div className="grid gap-4 p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ChainLogo chain={c.key} size={40} decorative />
            <div>
              <h3 id={`chain-${c.key}`} className="type-h3">
                {c.meta.label}
              </h3>
              {valued !== null && valued > 0 && (
                <p className="text-[0.8125rem] text-soft">
                  {fmtUsd(valued)} of {ticker} at the oracle price
                </p>
              )}
            </div>
          </div>
          <span className={cn("pill", proof.kind === "mpc" ? "pill-green" : "pill-orange")}>
            {proof.kind === "mpc" ? <BadgeCheck aria-hidden /> : <Radio aria-hidden />}
            <Term tip={`${copy.tip} ${c.meta.proof}`} align="end">
              {copy.label}
            </Term>
          </span>
        </header>

        <dl className="grid gap-x-6 gap-y-1.5 text-[0.8125rem] sm:grid-cols-2">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-soft">Treasury</dt>
            <dd className="font-medium">
              {c.address ? (
                <ExtLink href={c.meta.explorer("address", c.address)}>{shortAddr(c.address, 8, 6)}</ExtLink>
              ) : (
                <span className="text-soft">
                  {c.meta.kind === "solana" ? "not reported by this contract yet" : "not opened yet (init_treasury)"}
                </span>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-soft">Stock token</dt>
            <dd className="font-medium">
              {c.stockToken ? (
                <>
                  <ExtLink href={c.meta.explorer("token", c.stockToken)}>
                    {stockUnit} {shortAddr(c.stockToken, 6, 4)}
                  </ExtLink>
                  {c.venueFromRegistry && <span className="font-normal text-soft"> (testnet registry)</span>}
                </>
              ) : (
                <span className="text-soft">{ticker} does not trade here</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="grid gap-3">
          <Compare label={stockUnit} icon={<StockLogo ticker={ticker} size={18} decorative />} ledger={c.ledgerStock} chain={onChain.data?.stock ?? null} decimals={c.stockDecimals} loading={reading} />
          <Compare label="USDC" icon={<LogoTile logo={PLATFORM_LOGOS.usdc} size={18} decorative rounded="full" className="!ring-0" />} ledger={c.ledgerUsdc} chain={onChain.data?.usdc ?? null} decimals={c.usdcDecimals} loading={reading} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {proof.inTransit !== null && (
            <span className={cn("pill", proof.inTransit > 0n && "pill-blue")}>
              <Term k="transit" align="start">
                In transit
              </Term>
              <span>{fmtRaw(proof.inTransit, USDC_DECIMALS, 4)} USDC</span>
            </span>
          )}
          {c.approved !== null && (
            <span className={cn("pill", c.approved && "pill-green")}>{c.approved ? "Router approved" : "Router not approved yet"}</span>
          )}
          {c.nonce !== null && <span className="pill">Next nonce {c.nonce}</span>}
        </div>
        {onChain.data?.error && (
          <p className="text-sm text-orange-ink" role="status">
            {onChain.data.error}
          </p>
        )}
      </div>
    </article>
  );
}

export function TreasuryChains({
  chains,
  price,
  ticker,
  note,
  raw,
}: {
  chains: TreasuryChain[];
  price: PythPrice | null;
  ticker: string;
  note: string | null;
  raw: TreasuryChainsRaw | null;
}) {
  return (
    <div className="grid gap-4">
      {note && <Notice title="Limited treasury view">{note}</Notice>}
      {chains.map((c) => (
        <ChainCard key={c.key} c={c} price={price} ticker={ticker} raw={raw} />
      ))}
    </div>
  );
}
