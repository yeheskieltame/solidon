"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CircleSlash,
  Flame,
  HandCoins,
  Landmark,
  PenLine,
  RefreshCw,
  Scale,
  Sparkles,
  Sprout,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Notice } from "./notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MEME_DECIMALS, NEARBLOCKS, USDC_DECIMALS } from "@/lib/config";
import { fmtRaw, shortAddr, timeAgo, toBig } from "@/lib/format";
import { fetchMemeEvents, type MemeEvent } from "@/lib/events";
import { fmtTimes } from "@/lib/mnav";
import { useAsync } from "@/lib/use-async";

const KINDS: Record<string, { label: string; icon: LucideIcon; tint: string }> = {
  ft_mint: { label: "Mint", icon: Sparkles, tint: "bg-golden" },
  ft_burn: { label: "Burn", icon: Flame, tint: "bg-orange" },
  ft_transfer: { label: "Transfer", icon: ArrowLeftRight, tint: "bg-lilac-wash" },
  seed: { label: "Pool seeded", icon: Sprout, tint: "bg-green" },
  buy: { label: "Buy", icon: ArrowDownLeft, tint: "bg-green" },
  sell: { label: "Sell", icon: ArrowUpRight, tint: "bg-orange" },
  rebalance: { label: "Rebalance", icon: Scale, tint: "bg-golden" },
  redeem: { label: "Redeem", icon: HandCoins, tint: "bg-red" },
  redeem_refunded: { label: "Redemption refunded", icon: Undo2, tint: "bg-lilac-wash" },
  payout_failed: { label: "Payout failed, now claimable", icon: CircleSlash, tint: "bg-red" },
  treasury: { label: "Treasury opened", icon: Landmark, tint: "bg-blue" },
  evm_tx_signed: { label: "Treasury tx signed", icon: PenLine, tint: "bg-blue" },
  evm_tx_rejected: { label: "Signature rejected", icon: CircleSlash, tint: "bg-red" },
  buy_stock_skipped: { label: "Stock buy skipped", icon: CircleSlash, tint: "bg-lilac-wash" },
  signature_cleared: { label: "Signature slot cleared", icon: PenLine, tint: "bg-lilac-wash" },
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
      return `mNAV ${fmtTimes(Number(toBig(d.mnav_bps as string)) / 10_000)}, ${outcome || "no action"}${d.redemption_open ? ", redemption open" : ""}`;
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
        <p className="max-w-[46ch] text-sm font-semibold text-soft">
          Every mint, burn, trade and rebalance the contract logged, read from NearBlocks.
        </p>
        <Button variant="outline" size="sm" onClick={log.reload} disabled={log.loading}>
          <RefreshCw className={cn("size-4", log.loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>
      {log.loading && !log.data ? (
        <div className="mt-4 grid gap-3" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <Skeleton className="h-10 flex-1" />
            </div>
          ))}
        </div>
      ) : log.error ? (
        <Notice
          className="mt-4"
          title="The event log is napping"
          action={
            <a className="btn btn-white btn-sm" href={`${NEARBLOCKS}/address/${account}`} target="_blank" rel="noreferrer">
              Open NearBlocks
            </a>
          }
        >
          {log.error}. Every transaction is also on NearBlocks.
        </Notice>
      ) : log.data && log.data.length === 0 ? (
        <Notice className="mt-4" title="Nothing has happened yet">
          The first trade or rebalance shows up here.
        </Notice>
      ) : (
        <ol className="relative mt-5 grid gap-1 before:absolute before:top-3 before:bottom-3 before:left-[1.1875rem] before:w-0.5 before:bg-line">
          {(log.data ?? []).map((e, i) => {
            const kind = KINDS[e.event] ?? { label: e.event, icon: Sparkles, tint: "bg-lilac-wash" };
            const Icon = kind.icon;
            return (
              <li key={`${e.txHash}-${i}`} className="relative grid grid-cols-[2.5rem_1fr] items-start gap-3 rounded-2xl py-2 pr-2 hover:bg-white/70">
                <span className={cn("flex size-10 items-center justify-center rounded-xl border-2 border-ink", kind.tint)} aria-hidden>
                  <Icon className="size-5" strokeWidth={2.75} />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-extrabold">{kind.label}</span>
                    <a
                      href={`${NEARBLOCKS}/txns/${e.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="link text-[0.8125rem]"
                      title={e.txHash}
                    >
                      {e.time ? timeAgo(e.time) : shortAddr(e.txHash)}
                      <span className="sr-only"> , transaction on NearBlocks (opens in a new tab)</span>
                    </a>
                  </p>
                  <p className="text-sm font-semibold break-words text-soft">{describe(e, symbol)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
