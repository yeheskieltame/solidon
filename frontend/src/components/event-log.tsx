"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeCheck,
  CircleSlash,
  Flame,
  HandCoins,
  Landmark,
  PenLine,
  RefreshCw,
  Scale,
  Send,
  Sparkles,
  Sprout,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Notice } from "./notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { chainMeta } from "@/lib/chains";
import { MEME_DECIMALS, NEARBLOCKS, USDC_DECIMALS } from "@/lib/config";
import { fmtRaw, shortAddr, timeAgo, toBig } from "@/lib/format";
import type { EventFeed, MemeEvent } from "@/lib/events";
import { fmtTimes } from "@/lib/mnav";
import type { AsyncState } from "@/lib/use-async";

const KINDS: Record<string, { label: string; icon: LucideIcon; tint: string }> = {
  ft_mint: { label: "Mint", icon: Sparkles, tint: "bg-golden-wash text-golden-ink" },
  ft_burn: { label: "Burn", icon: Flame, tint: "bg-orange-wash text-orange-ink" },
  ft_transfer: { label: "Transfer", icon: ArrowLeftRight, tint: "bg-page-deep text-ink-2" },
  seed: { label: "Pool seeded", icon: Sprout, tint: "bg-green-wash text-green-ink" },
  buy: { label: "Buy", icon: ArrowDownLeft, tint: "bg-green-wash text-green-ink" },
  sell: { label: "Sell", icon: ArrowUpRight, tint: "bg-orange-wash text-orange-ink" },
  rebalance: { label: "Rebalance", icon: Scale, tint: "bg-golden-wash text-golden-ink" },
  redeem: { label: "Redeem", icon: HandCoins, tint: "bg-red-wash text-red-ink" },
  redeem_refunded: { label: "Redemption refunded", icon: Undo2, tint: "bg-page-deep text-ink-2" },
  payout_failed: { label: "Payout failed, now claimable", icon: CircleSlash, tint: "bg-red-wash text-red-ink" },
  treasury: { label: "Treasury opened", icon: Landmark, tint: "bg-blue-wash text-blue-ink" },
  evm_tx_signed: { label: "Treasury tx signed", icon: PenLine, tint: "bg-blue-wash text-blue-ink" },
  evm_tx_rejected: { label: "Signature rejected", icon: CircleSlash, tint: "bg-red-wash text-red-ink" },
  buy_stock_skipped: { label: "Stock buy skipped", icon: CircleSlash, tint: "bg-page-deep text-ink-2" },
  signature_cleared: { label: "Signature slot cleared", icon: PenLine, tint: "bg-page-deep text-ink-2" },
  solana_tx_signed: { label: "Solana tx signed", icon: PenLine, tint: "bg-blue-wash text-blue-ink" },
  solana_tx_rejected: { label: "Solana signature rejected", icon: CircleSlash, tint: "bg-red-wash text-red-ink" },
  solana_accounts: { label: "Solana token accounts set", icon: Landmark, tint: "bg-blue-wash text-blue-ink" },
  cash_sent: { label: "Cash sent to a chain", icon: Send, tint: "bg-blue-wash text-blue-ink" },
  cash_credited: { label: "Cash arrived", icon: BadgeCheck, tint: "bg-green-wash text-green-ink" },
  cash_returned: { label: "Cash returned", icon: Undo2, tint: "bg-page-deep text-ink-2" },
  cash_rejected: { label: "Cash proof rejected", icon: CircleSlash, tint: "bg-red-wash text-red-ink" },
  fund_chain_skipped: { label: "Funding skipped", icon: CircleSlash, tint: "bg-page-deep text-ink-2" },
};

/** Account ids as people read them: 64-hex implicit accounts shortened. */
function who(v: unknown) {
  const id = String(v ?? "");
  return /^[0-9a-f]{64}$/.test(id) ? shortAddr(id, 6, 4) : id;
}

function chainName(v: unknown) {
  const name = String(v ?? "");
  return chainMeta(name)?.label ?? name;
}

function usdc(v: unknown) {
  return `${fmtRaw(toBig(v as string), USDC_DECIMALS, 4)} USDC`;
}
function meme(v: unknown, sym: string) {
  return `${fmtRaw(toBig(v as string), MEME_DECIMALS)} ${sym}`;
}

export function describeEvent(e: MemeEvent, sym: string): string {
  const d = e.data;
  switch (e.event) {
    case "seed":
      return `${who(d.account)} seeded ${usdc(d.usdc_in)}`;
    case "buy":
      return `${who(d.account)} paid ${usdc(d.usdc_in)} for ${meme(d.meme_out, sym)}`;
    case "sell":
      return `${who(d.account)} sold ${meme(d.meme_in, sym)} for ${usdc(d.usdc_out)}`;
    case "redeem":
      return `${who(d.account)} burned ${meme(d.meme_in, sym)} for ${usdc(d.usdc_out)}`;
    case "redeem_refunded":
      return `${meme(d.meme, sym)} returned to ${who(d.account)}`;
    case "rebalance": {
      // Outcome is "no_action" / "cooldown" or {"issued": {...}} / {"bought_back": {...}}.
      const key =
        typeof d.outcome === "string"
          ? d.outcome
          : d.outcome && typeof d.outcome === "object"
            ? Object.keys(d.outcome)[0]
            : "";
      const outcome = (key ?? "").replace(/_/g, " ");
      return `mNAV ${fmtTimes(Number(toBig(d.mnav_bps as string)) / 10_000)}, ${outcome || "no action"}${d.redemption_open ? ", redemption open" : ""}`;
    }
    case "ft_mint":
    case "ft_burn":
      return `${meme(d.amount, sym)}${d.memo ? ` (${d.memo})` : ""}`;
    case "ft_transfer":
      return `${meme(d.amount, sym)} from ${who(d.old_owner_id)} to ${who(d.new_owner_id)}`;
    case "treasury":
      return String(d.evm_address ?? d.solana_address ?? "");
    case "evm_tx_signed":
      return `${chainName(d.chain)}, nonce ${d.nonce}`;
    case "solana_tx_signed":
      return `${chainName(d.chain)}, ${d.kind ? `${String(d.kind).replace(/_/g, " ")}, ` : ""}sequence ${d.seq}`;
    case "cash_sent":
      return `${usdc(d.amount)} on its way to ${chainName(d.chain)}`;
    case "cash_credited":
      return `${usdc(d.amount)} credited on ${chainName(d.chain)}, ${d.proof === "mpc" ? "proven by the MPC" : "reported by the relayer"}`;
    case "cash_returned":
      return `${usdc(d.amount)} came back from ${chainName(d.chain)}`;
    case "cash_rejected":
      return `${chainName(d.chain)}: the transfer proof did not verify`;
    case "fund_chain_skipped":
    case "buy_stock_skipped":
      return `${chainName(d.chain)}: ${d.reason ?? "skipped"}`;
    default:
      return JSON.stringify(d).slice(0, 140);
  }
}

export function eventKind(event: string): { label: string; icon: LucideIcon; tint: string } {
  return KINDS[event] ?? { label: event, icon: Sparkles, tint: "bg-page-deep text-ink-2" };
}

/** Rebalance results from the log as (time, mNAV) points, oldest first: real on-chain history. */
export function mnavHistory(events: MemeEvent[] | undefined): { t: number; v: number }[] {
  return (events ?? [])
    .filter((e) => e.event === "rebalance" && e.time > 0 && e.data.mnav_bps !== undefined)
    .map((e) => ({ t: e.time, v: Number(toBig(e.data.mnav_bps as string)) / 10_000 }))
    .filter((p) => p.v > 0)
    .sort((a, b) => a.t - b.t);
}

/** The meme's events as a table: event, what happened, when (linked to the transaction). */
export function EventLog({ account, symbol, log }: { account: string; symbol: string; log: AsyncState<EventFeed> }) {
  const events = log.data?.events;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-[0.9375rem] text-soft">
          {log.data?.source === "indexer"
            ? "Every mint, burn, trade and rebalance the contract logged, from the keeper's indexer."
            : "Every mint, burn, trade and rebalance the contract logged in its latest transactions, read from NearBlocks."}
        </p>
        <Button variant="ghost" size="sm" onClick={log.reload} disabled={log.loading}>
          <RefreshCw className={cn(log.loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>
      {log.loading && !log.data ? (
        <div className="panel mt-4 grid gap-3 p-5" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : log.error ? (
        <Notice
          className="mt-4"
          title="The event log is unavailable"
          action={
            <a className="btn btn-white btn-sm" href={`${NEARBLOCKS}/address/${account}`} target="_blank" rel="noreferrer">
              Open NearBlocks
            </a>
          }
        >
          {log.error}. Every transaction is also on NearBlocks.
        </Notice>
      ) : events && events.length === 0 ? (
        <Notice className="mt-4" title="Nothing has happened yet">
          The first trade or rebalance shows up here.
        </Notice>
      ) : (
        <div className="panel mt-4 overflow-x-auto">
          <table className="table min-w-[36rem]">
            <caption className="sr-only">Contract events</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Details</th>
                <th scope="col" className="num">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e, i) => {
                const kind = eventKind(e.event);
                const Icon = kind.icon;
                return (
                  <tr key={`${e.txHash}-${i}`} data-hover="true">
                    <td className="w-[15rem]">
                      <span className="flex items-center gap-3">
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", kind.tint)} aria-hidden>
                          <Icon className="size-3.5" strokeWidth={2} />
                        </span>
                        <span className="text-[0.9375rem]">{kind.label}</span>
                      </span>
                    </td>
                    <td className="text-[0.875rem] break-words text-soft">{describeEvent(e, symbol)}</td>
                    <td className="num">
                      <a href={`${NEARBLOCKS}/txns/${e.txHash}`} target="_blank" rel="noreferrer" className="num-link text-sm" title={e.txHash}>
                        {e.time ? timeAgo(e.time) : shortAddr(e.txHash)}
                        <span className="sr-only">: transaction on NearBlocks (opens in a new tab)</span>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
