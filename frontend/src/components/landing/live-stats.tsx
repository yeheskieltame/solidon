"use client";

import { CountUp } from "@/components/count-up";
import { FACTORY } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { loadMarket } from "@/lib/market";
import { factory } from "@/lib/near";
import { useAsync } from "@/lib/use-async";

const int = (n: number) => Math.round(n).toLocaleString("en-US");

/** Factory-wide figures read live from NEAR; each tile falls back to a dash on its own. */
export function LiveStats() {
  const market = useAsync(() => loadMarket(), []);
  const stocks = useAsync(() => factory.stocks(), []);
  const rows = market.data?.rows ?? [];
  const treasury = rows.reduce((s, r) => s + r.nav.assetsUsd, 0);
  const holders = rows.filter((r) => r.chainsHeld.length > 0).length;

  const tiles: { label: string; value: number | null; format: (n: number) => string }[] = [
    { label: "Memes launched", value: market.data ? rows.length : null, format: int },
    { label: "Treasury value, all memes", value: market.data ? treasury : null, format: fmtUsd },
    { label: "Memes holding stock", value: market.data ? holders : null, format: int },
    { label: "Stocks listed", value: stocks.data ? stocks.data.length : null, format: int },
  ];

  return (
    <section aria-labelledby="stats-title" className="wrap pb-20 sm:pb-24">
      <h2 id="stats-title" className="sr-only">
        Live figures
      </h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-[var(--shadow-sm)] lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-card p-5 sm:p-7">
            <p className="kicker">{t.label}</p>
            <p className="type-num mt-2 text-[1.75rem] sm:text-4xl" aria-live="polite">
              {market.error && t.value === null ? "–" : <CountUp value={t.value} format={t.format} />}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-soft">
        <span className="live-dot" aria-hidden />
        Read from the factory {FACTORY} on NEAR testnet as you load this page.
        {market.error && ` The RPC did not answer (${market.error}).`}
      </p>
    </section>
  );
}
