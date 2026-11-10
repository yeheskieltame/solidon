import { ChainLogo, LogoTile } from "./brand-logo";
import { PLATFORM_LOGOS } from "@/lib/brands";
import { fmtUsd } from "@/lib/format";
import type { MarketRow } from "@/lib/market";
import { stockUsd } from "@/lib/math";

const CHAIN_TINT: Record<string, string> = {
  base: "#3a6ff7",
  robinhood: "#ccff00",
  solana: "#9945ff",
};
const CASH_TINT = "#7c8796";

export type Slice = { key: string; label: string; detail: string; usd: number; color: string; logo: React.ReactNode };

/** Where the treasury sits: stock and USDC per chain (ledger, at the oracle price) and cash on NEAR. */
export function compositionOf(row: MarketRow): Slice[] {
  const ticker = row.ticker ?? "stock";
  const chains: Slice[] = row.chains.map((c) => {
    const stock = c.ledgerStock !== null ? (stockUsd(c.ledgerStock, c.stockDecimals, row.snap.price) ?? 0) : 0;
    const usdc = c.ledgerUsdc !== null ? Number(c.ledgerUsdc) / 10 ** c.usdcDecimals : 0;
    return {
      key: c.key,
      label: c.meta.label,
      detail: usdc > 0 ? `${ticker} and ${fmtUsd(usdc)} USDC` : ticker,
      usd: stock + usdc,
      color: CHAIN_TINT[c.key] ?? "#888",
      logo: <ChainLogo chain={c.key} size={22} decorative />,
    };
  });
  return [
    ...chains,
    {
      key: "cash",
      label: "Cash buffer on NEAR",
      detail: "USDC for redemptions",
      usd: row.nav.cashUsd,
      color: CASH_TINT,
      logo: <LogoTile logo={PLATFORM_LOGOS.usdc} size={22} decorative className="!ring-0" />,
    },
  ];
}

/** The stacked bar alone: one segment per slice, sized by its share of the total. */
export function CompositionBar({ slices, total, className }: { slices: Slice[]; total: number; className?: string }) {
  const safe = Math.max(total, 1e-9);
  return (
    <div className={`flex h-2.5 gap-1 overflow-hidden rounded-full bg-page-deep ${className ?? ""}`} aria-hidden>
      {slices
        .filter((s) => s.usd > 0)
        .map((s) => (
          <span key={s.key} className="bar-fill h-full rounded-full" style={{ width: `${(s.usd / safe) * 100}%`, background: s.color }} />
        ))}
    </div>
  );
}

/** A stacked bar and a legend list. Every figure is the contract's ledger, nothing estimated. */
export function Composition({ slices, total }: { slices: Slice[]; total: number }) {
  const safe = Math.max(total, 1e-9);
  return (
    <div>
      <CompositionBar slices={slices} total={total} />
      <ul className="mt-4">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.logo}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem]">{s.label}</span>
              <span className="block truncate text-xs text-soft">{s.detail}</span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block text-[0.9375rem]">{fmtUsd(s.usd)}</span>
              <span className="block text-xs text-soft">{total > 0 ? `${((s.usd / safe) * 100).toFixed(1)}%` : "–"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
