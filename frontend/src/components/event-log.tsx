"use client";

import { Button } from "@/components/ui/button";
import { MEME_DECIMALS, NEARBLOCKS, USDC_DECIMALS } from "@/lib/config";
import { fmtMnav, fmtRaw, shortAddr, timeAgo, toBig } from "@/lib/format";
import { fetchMemeEvents, type MemeEvent } from "@/lib/events";
import { useAsync } from "@/lib/use-async";

const LABELS: Record<string, string> = {
  ft_mint: "Mint",
  ft_burn: "Burn",
  ft_transfer: "Transfer",
  seed: "Pool seeded",
  buy: "Buy",
  sell: "Sell",
  rebalance: "Rebalance",
  redeem: "Redeem",
  redeem_refunded: "Redemption refunded",
  payout_failed: "Payout failed, now claimable",
  treasury: "Treasury opened",
  evm_tx_signed: "Treasury tx signed",
  evm_tx_rejected: "Signature rejected",
  buy_stock_skipped: "Stock buy skipped",
  signature_cleared: "Signature slot cleared",
};

function usdc(v: unknown) {
  return `${fmtRaw(toBig(v as string), USDC_DECIMALS, 4)} USDC`;
}
function meme(v: unknown, sym: string) {
  return `${fmtRaw(toBig(v as string), MEME_DECIMALS)} ${sym}`;
}

function describe(e: MemeEvent, sym: string): string {
  const d = e.data;
  switch (e.event) {
    case "seed":
      return `${d.account} seeded ${usdc(d.usdc_in)}`;
    case "buy":
      return `${d.account} paid ${usdc(d.usdc_in)} for ${meme(d.meme_out, sym)}`;
    case "sell":
      return `${d.account} sold ${meme(d.meme_in, sym)} for ${usdc(d.usdc_out)}`;
    case "redeem":
      return `${d.account} burned ${meme(d.meme_in, sym)} for ${usdc(d.usdc_out)}`;
    case "redeem_refunded":
      return `${meme(d.meme, sym)} returned to ${d.account}`;
    case "rebalance": {
      // Outcome is "no_action" / "cooldown" or {"issued": {...}} / {"bought_back": {...}}.
      const key =
        typeof d.outcome === "string"
          ? d.outcome
          : d.outcome && typeof d.outcome === "object"
            ? Object.keys(d.outcome)[0]
            : "";
      const outcome = (key ?? "").replace(/_/g, " ");
      return `mNAV ${fmtMnav(Number(toBig(d.mnav_bps as string)) / 10_000)}, ${outcome || "no action"}${d.redemption_open ? ", redemption open" : ""}`;
    }
    case "ft_mint":
    case "ft_burn":
      return `${meme(d.amount, sym)}${d.memo ? ` (${d.memo})` : ""}`;
    case "ft_transfer":
      return `${meme(d.amount, sym)} from ${d.old_owner_id} to ${d.new_owner_id}`;
    case "treasury":
      return String(d.evm_address ?? "");
    case "evm_tx_signed":
      return `${d.chain}, nonce ${d.nonce}`;
    default:
      return JSON.stringify(d).slice(0, 140);
  }
}

export function EventLog({ account, symbol }: { account: string; symbol: string }) {
  const log = useAsync(() => fetchMemeEvents(account), [account]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graphite">
          Every mint, burn, trade and rebalance the contract logged, from NearBlocks.
        </p>
        <Button variant="outline" size="sm" onClick={log.reload} disabled={log.loading}>
          {log.loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      {log.error ? (
        <p className="mt-3 border border-dashed border-ink p-3 text-sm text-graphite">
          Event log unavailable: {log.error}. Every transaction is also on{" "}
          <a className="underline underline-offset-4" href={`${NEARBLOCKS}/address/${account}`} target="_blank" rel="noreferrer">
            NearBlocks
          </a>
          .
        </p>
      ) : log.data && log.data.length === 0 ? (
        <p className="mt-3 text-sm text-graphite">No events yet.</p>
      ) : (
        <ol className="mt-3">
          {(log.data ?? []).map((e, i) => (
            <li key={`${e.txHash}-${i}`} className="grid grid-cols-[7.5rem_1fr] gap-3 border-t border-rule py-2 text-sm sm:grid-cols-[10rem_1fr_6rem]">
              <span className="font-semibold">{LABELS[e.event] ?? e.event}</span>
              <span className="min-w-0 break-words text-graphite">{describe(e, symbol)}</span>
              <a
                href={`${NEARBLOCKS}/txns/${e.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="col-start-2 text-xs underline underline-offset-4 sm:col-start-auto sm:text-right"
                title={e.txHash}
              >
                {e.time ? timeAgo(e.time) : shortAddr(e.txHash)}
                <span className="sr-only"> transaction on NearBlocks</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
