"use client";

import { BadgeCheck, Radio, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { ChainLogo, LogoTile, StockLogo } from "./brand-logo";
import { CopyButton, ExplorerLink } from "./copy-button";
import { Notice } from "./notice";
import { Hint, Term } from "./term";
import { readOnChain, type OnChainBalance, type TreasuryChain } from "@/lib/chains";
import { PLATFORM_LOGOS } from "@/lib/brands";
import { USDC_DECIMALS } from "@/lib/config";
import { fmtRaw, fmtUsd, shortAddr } from "@/lib/format";
import { stockUsd } from "@/lib/math";
import type { PythPrice, TreasuryChainsRaw } from "@/lib/near";
import { PROOF_COPY, chainProof } from "@/lib/proof";
import { useAsync } from "@/lib/use-async";

/** What the contract wrote down against what the chain holds right now. */
function verdict(ledger: bigint | null, chain: bigint | null, decimals: number, loading: boolean) {
  if (loading) return <span className="text-soft"><span className="dots">Reading the chain</span></span>;
  if (ledger === null) return <span className="text-soft">Not tracked</span>;
  if (chain === null) return <span className="text-soft">Chain not readable</span>;
  if (chain === ledger)
    return (
      <span className="inline-flex items-center gap-1.5 text-green-ink">
        <BadgeCheck className="size-4" aria-hidden /> Matches
      </span>
    );
  if (chain > ledger)
    return (
      <span className="inline-flex items-center gap-1.5 text-green-ink" title={`The chain holds ${fmtRaw(chain - ledger, decimals, 8)} more`}>
        <BadgeCheck className="size-4" aria-hidden /> Covered, +{fmtRaw(chain - ledger, decimals, 6)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-orange-ink">
      <TriangleAlert className="size-4" aria-hidden /> Short by {fmtRaw(ledger - chain, decimals, 6)}
    </span>
  );
}

/** One chain as a group of rows: a header with the address and proof type, then each asset. */
function ChainGroup({ c, price, ticker, raw }: { c: TreasuryChain; price: PythPrice | null; ticker: string; raw: TreasuryChainsRaw | null }) {
  const onChain = useAsync<OnChainBalance>(() => readOnChain(c), [c.key, c.address, c.stockToken, c.usdcToken]);
  const stockUnit = c.stockSymbol ?? ticker;
  const valued = c.ledgerStock !== null ? stockUsd(c.ledgerStock, c.stockDecimals, price) : null;
  const proof = chainProof(raw, c.key);
  const copy = PROOF_COPY[proof.kind];
  const reading = onChain.loading && !!c.address;
  const cell = (v: bigint | null, d: number, wait = false) => (wait ? "…" : v === null ? "–" : fmtRaw(v, d, 8));

  return (
    <tbody>
      <tr className="group">
        <td colSpan={4}>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <span className="flex items-center gap-2.5 text-[0.9375rem] text-ink">
              <ChainLogo chain={c.key} size={22} decorative />
              {c.meta.label}
              <span className={cn("pill", proof.kind === "mpc" ? "pill-green" : "pill-orange")}>
                {proof.kind === "mpc" ? <BadgeCheck aria-hidden /> : <Radio aria-hidden />}
                {copy.label}
              </span>
              <Hint tip={`${copy.tip} ${c.meta.proof}`} label={`About ${copy.label}`} />
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {c.address ? (
                <span className="flex items-center gap-1 text-ink-2" title={c.address}>
                  <span className="text-soft">Treasury</span>
                  <span className="tabular-nums">{shortAddr(c.address, 6, 4)}</span>
                  <CopyButton value={c.address} label={`${c.meta.label} treasury address`} />
                  <ExplorerLink href={c.meta.explorer("address", c.address)} label={`${c.meta.label} treasury on the explorer`} />
                </span>
              ) : (
                <span className="text-soft">
                  {c.meta.kind === "solana" ? "Address not reported by this contract yet" : "Not opened yet (init_treasury)"}
                </span>
              )}
              {c.approved !== null && <span className="text-soft">{c.approved ? "Router approved" : "Router not approved yet"}</span>}
              {c.nonce !== null && <span className="text-soft">Nonce {c.nonce}</span>}
            </span>
          </div>
        </td>
      </tr>
      <tr>
        <td>
          <span className="flex items-center gap-2.5">
            <StockLogo ticker={ticker} size={22} decorative />
            <span>
              {stockUnit}
              {valued !== null && valued > 0 && <span className="block text-xs text-soft">{fmtUsd(valued)} at the oracle price</span>}
            </span>
            {c.stockToken ? (
              <ExplorerLink href={c.meta.explorer("token", c.stockToken)} label={`${stockUnit} token ${shortAddr(c.stockToken, 6, 4)}${c.venueFromRegistry ? " (testnet registry)" : ""}`} />
            ) : (
              <span className="text-xs text-soft">does not trade here</span>
            )}
          </span>
        </td>
        <td className="num">{cell(c.ledgerStock, c.stockDecimals)}</td>
        <td className="num">{cell(onChain.data?.stock ?? null, c.stockDecimals, reading)}</td>
        <td className="num">{verdict(c.ledgerStock, onChain.data?.stock ?? null, c.stockDecimals, reading)}</td>
      </tr>
      <tr>
        <td>
          <span className="flex items-center gap-2.5">
            <LogoTile logo={PLATFORM_LOGOS.usdc} size={22} decorative className="!ring-0" />
            USDC
          </span>
        </td>
        <td className="num">{cell(c.ledgerUsdc, c.usdcDecimals)}</td>
        <td className="num">{cell(onChain.data?.usdc ?? null, c.usdcDecimals, reading)}</td>
        <td className="num">{verdict(c.ledgerUsdc, onChain.data?.usdc ?? null, c.usdcDecimals, reading)}</td>
      </tr>
      {(proof.inTransit !== null || onChain.data?.error) && (
        <tr>
          <td colSpan={4} className="!py-3 text-sm">
            <span className="flex flex-wrap items-center justify-between gap-3">
              {proof.inTransit !== null ? (
                <span className="text-soft">
                  <Term k="transit" align="start">
                    In transit
                  </Term>{" "}
                  <span className={cn("tabular-nums", proof.inTransit > 0n ? "text-blue-ink" : "text-ink-2")}>
                    {fmtRaw(proof.inTransit, USDC_DECIMALS, 4)} USDC
                  </span>
                </span>
              ) : (
                <span />
              )}
              {onChain.data?.error && (
                <span className="text-orange-ink" role="status">
                  {onChain.data.error}
                </span>
              )}
            </span>
          </td>
        </tr>
      )}
    </tbody>
  );
}

/** The treasury on every chain as one grouped table: ledger against the live on-chain balance. */
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
      <div className="panel overflow-x-auto">
        <table className="table min-w-[42rem]">
          <caption className="sr-only">Treasury holdings per chain: ledger against on-chain balances</caption>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col" className="num">
                <Term k="ledger" align="end">Ledger</Term>
              </th>
              <th scope="col" className="num">
                <Term k="onchain" align="end">On-chain</Term>
              </th>
              <th scope="col" className="num">
                Status
              </th>
            </tr>
          </thead>
          {chains.map((c) => (
            <ChainGroup key={c.key} c={c} price={price} ticker={ticker} raw={raw} />
          ))}
        </table>
      </div>
    </div>
  );
}
