"use client";

import { cn } from "cn";
import { readOnChain, type OnChainBalance, type TreasuryChain } from "@/lib/chains";
import { fmtRaw, fmtUsd, shortAddr } from "@/lib/format";
import { stockUsd } from "@/lib/math";
import type { PythPrice } from "@/lib/near";
import { useAsync } from "@/lib/use-async";

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:no-underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Ledger next to the chain's own balance. */
function Compare({
  label,
  ledger,
  chain,
  decimals,
  unit,
  loading,
}: {
  label: string;
  ledger: bigint | null;
  chain: bigint | null;
  decimals: number;
  unit: string;
  loading: boolean;
}) {
  let verdict = "";
  if (ledger !== null && chain !== null) {
    if (chain === ledger) verdict = "matches";
    else if (chain > ledger) verdict = `on-chain holds ${fmtRaw(chain - ledger, decimals, 6)} more`;
    else verdict = `on-chain holds ${fmtRaw(ledger - chain, decimals, 6)} less`;
  }
  return (
    <tr className="border-t border-rule align-top">
      <th scope="row" className="py-2 pr-3 text-left font-normal text-graphite">
        {label}
      </th>
      <td className="py-2 pr-3 text-right">
        {ledger === null ? <span className="text-graphite">not tracked</span> : `${fmtRaw(ledger, decimals, 6)} ${unit}`}
      </td>
      <td className="py-2 pr-3 text-right">
        {loading ? <span className="text-graphite">reading…</span> : chain === null ? <span className="text-graphite">–</span> : `${fmtRaw(chain, decimals, 6)} ${unit}`}
      </td>
      <td className={cn("hidden py-2 text-right text-xs sm:table-cell", verdict === "matches" ? "" : "text-graphite")}>{verdict}</td>
    </tr>
  );
}

function ChainCard({ c, price, ticker }: { c: TreasuryChain; price: PythPrice | null; ticker: string }) {
  const onChain = useAsync<OnChainBalance>(() => readOnChain(c), [c.key, c.address, c.stockToken, c.usdcToken]);
  const stockUnit = c.stockSymbol ?? ticker;
  const valued = c.ledgerStock !== null ? stockUsd(c.ledgerStock, c.stockDecimals, price) : null;

  return (
    <article className="border border-ink" aria-labelledby={`chain-${c.key}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink px-4 py-3">
        <h4 id={`chain-${c.key}`} className="type-wide text-lg">
          {c.meta.label}
        </h4>
        <span className="flex gap-3 text-xs text-graphite">
          {c.approved !== null && <span>{c.approved ? "Router approved" : "Router not approved yet"}</span>}
          {c.nonce !== null && <span>Next nonce {c.nonce}</span>}
        </span>
      </header>
      <div className="grid gap-3 px-4 py-3 text-sm">
        <p>
          <span className="text-graphite">Treasury </span>
          {c.address ? (
            <ExtLink href={c.meta.explorer("address", c.address)}>{shortAddr(c.address, 8, 6)}</ExtLink>
          ) : (
            <span className="text-graphite">
              {c.meta.kind === "solana" ? "not reported by this contract yet" : "not opened yet (init_treasury)"}
            </span>
          )}
        </p>
        <p>
          <span className="text-graphite">Stock token </span>
          {c.stockToken ? (
            <>
              <ExtLink href={c.meta.explorer("token", c.stockToken)}>
                {stockUnit} {shortAddr(c.stockToken, 6, 4)}
              </ExtLink>
              {c.venueFromRegistry && <span className="text-xs text-graphite"> (from the testnet registry)</span>}
            </>
          ) : (
            <span className="text-graphite">{ticker} does not trade here</span>
          )}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <caption className="sr-only">{c.meta.label} ledger compared with the on-chain balance</caption>
            <thead>
              <tr className="text-xs text-graphite">
                <th scope="col" className="pb-1 text-left font-normal">Asset</th>
                <th scope="col" className="pb-1 pr-3 text-right font-normal">Ledger</th>
                <th scope="col" className="pb-1 pr-3 text-right font-normal">On-chain</th>
                <th scope="col" className="hidden pb-1 text-right font-normal sm:table-cell">Check</th>
              </tr>
            </thead>
            <tbody>
              <Compare label="USDC" ledger={c.ledgerUsdc} chain={onChain.data?.usdc ?? null} decimals={c.usdcDecimals} unit="" loading={onChain.loading} />
              <Compare label={stockUnit} ledger={c.ledgerStock} chain={onChain.data?.stock ?? null} decimals={c.stockDecimals} unit="" loading={onChain.loading} />
            </tbody>
          </table>
        </div>
        {valued !== null && valued > 0 && (
          <p className="text-xs text-graphite">Ledger stock at the oracle price: {fmtUsd(valued)}</p>
        )}
        {onChain.data?.error && <p className="text-xs text-graphite">{onChain.data.error}</p>}
        <p className="border-t border-rule pt-2 text-xs text-graphite">{c.meta.proof}</p>
      </div>
    </article>
  );
}

export function TreasuryChains({
  chains,
  price,
  ticker,
  note,
}: {
  chains: TreasuryChain[];
  price: PythPrice | null;
  ticker: string;
  note: string | null;
}) {
  return (
    <div className="grid gap-4">
      {note && <p className="border border-dashed border-ink p-3 text-sm text-graphite">{note}</p>}
      <p className="text-sm text-graphite">
        The ledger is what the contract recorded: for every swap it books the minimum stock out,
        never an estimate. On-chain is read live from each chain&apos;s public RPC in your browser.
      </p>
      <div className="grid gap-4 xl:grid-cols-1">
        {chains.map((c) => (
          <ChainCard key={c.key} c={c} price={price} ticker={ticker} />
        ))}
      </div>
    </div>
  );
}
