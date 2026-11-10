"use client";

import { Stat, StatRow } from "@/components/stat";
import { FACTORY } from "@/lib/config";
import { fmtUsdCompact } from "@/lib/figure";
import { loadMarket } from "@/lib/market";
import { factory } from "@/lib/near";
import { useAsync } from "@/lib/use-async";

const int = (n: number) => Math.round(n).toLocaleString("en-US");

/** Factory-wide figures read live from NEAR, as open stats; each falls back to a dash on its own. */
export function LiveStats() {
  const market = useAsync(() => loadMarket(), []);
  const stocks = useAsync(() => factory.stocks(), []);
  const rows = market.data?.rows ?? [];
  const treasury = rows.reduce((s, r) => s + r.nav.assetsUsd, 0);
  const holders = rows.filter((r) => r.chainsHeld.length > 0).length;

  return (
    <section aria-labelledby="stats-title" className="wrap pb-20 sm:pb-28">
      <h2 id="stats-title" className="sr-only">
        Live figures
      </h2>
      <StatRow className="sm:justify-between">
        <Stat label="Memes launched" hint={`Memes deployed by the factory ${FACTORY}.`} value={market.data ? rows.length : null} format={int} sub="On NEAR testnet" />
        <Stat
          label="Treasury value"
          hint="All memes together: USDC on NEAR plus USDC and stock on each chain, with stock at the oracle price."
          value={market.data ? treasury : null}
          format={fmtUsdCompact}
          sub="Across every meme"
        />
        <Stat label="Holding stock" hint="Memes whose ledger holds stock on at least one chain." value={market.data ? holders : null} format={int} sub="Memes with stock on a chain" />
        <Stat label="Stocks listed" hint="Stocks a new meme can pick as its thesis." value={stocks.data ? stocks.data.length : null} format={int} sub="Each on three chains" />
      </StatRow>
      <p className="mt-8 flex items-center gap-2 text-sm text-soft">
        <span className="live-dot" aria-hidden />
        Read from {FACTORY} as you load this page.
        {market.error && ` The RPC did not answer (${market.error}).`}
      </p>
    </section>
  );
}
