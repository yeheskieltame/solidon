"use client";

// "Run rebalance": the mNAV engine is public. Anyone can call `rebalance()` once per cooldown
// (contracts/meme/src/mnav.rs) and is credited a small tip on what it moves. One quiet line
// under the gauge: what it is, then the action or when it becomes available.

import { useEffect, useState } from "react";
import { fmtSecs } from "./rules-section";
import { useToast } from "./toast";
import { Button } from "@/components/ui/button";
import { NEARBLOCKS, USDC_DECIMALS, MEME_DECIMALS } from "@/lib/config";
import { parseEventLog } from "@/lib/events";
import { fmtAmount, fmtUsd, toBig, toNumber } from "@/lib/format";
import type { MemeSnapshot } from "@/lib/meme";
import { fmtIn, fmtTimes } from "@/lib/mnav";
import { txResult, type TxResult } from "@/lib/near";
import { errorText, useWallet } from "@/lib/wallet";

/** The keeper attaches the same (contracts/meme: "attach 100 TGas"). */
const REBALANCE_TGAS = 100;

type Amounts = { meme?: string; usdc?: string };
type RebalanceEvent = { outcome?: string | { issued?: Amounts; bought_back?: Amounts }; tip?: string; mnav_bps?: string };

/** A toast for the rebalance's outcome, from its NEP-297 event, else the callback's return value. */
function describe(r: TxResult | null, symbol: string, ticker: string): { title: string; body: string; moved: boolean } {
  if (!r) return { title: "Rebalance sent", body: "The outcome appears in the activity log in a moment.", moved: false };
  if (r.failure) return { title: "The rebalance did not go through", body: r.failure, moved: false };
  let ev: RebalanceEvent | null = null;
  for (const log of r.logs) {
    const e = parseEventLog(log);
    if (e?.event === "rebalance") ev = (e.data[0] ?? null) as RebalanceEvent | null;
  }
  const tipRaw = toBig(ev?.tip);
  const tip = tipRaw > 0n ? ` Your tip, ${fmtUsd(toNumber(tipRaw, USDC_DECIMALS))}, is claimable in the trade panel.` : "";
  const out = ev?.outcome ?? (r.values.find((v) => typeof v === "string") as string | undefined);
  const mnav = ev?.mnav_bps ? Number(ev.mnav_bps) / 10_000 : null;
  const tokens = (a?: Amounts) => fmtAmount(toNumber(toBig(a?.meme), MEME_DECIMALS), 0);
  const usd = (a?: Amounts) => fmtUsd(toNumber(toBig(a?.usdc), USDC_DECIMALS));
  if (typeof out === "object" && out?.issued) {
    return { title: "Issued new tokens", body: `Sold ${tokens(out.issued)} new ${symbol} into the pool for ${usd(out.issued)}, now treasury cash for more ${ticker}.${tip}`, moved: true };
  }
  if (typeof out === "object" && out?.bought_back) {
    return { title: "Bought back tokens", body: `Bought and burned ${tokens(out.bought_back)} ${symbol} for ${usd(out.bought_back)}.${tip}`, moved: true };
  }
  switch (out) {
    case "no_action":
      return {
        title: "Rules ran: nothing to do",
        body: `mNAV ${mnav !== null ? `was ${fmtTimes(mnav)}, and ` : ""}nothing was allowed within the caps and the buffer. No tip without a move.`,
        moved: false,
      };
    case "stale_price":
      return { title: "Nothing ran: stale price", body: `No ${ticker} price within the allowed age. The cooldown is not used, so try again once it updates.`, moved: false };
    case "no_market":
      return { title: "Nothing ran: no average price yet", body: "The pool is younger than its average-price window. The cooldown is not used.", moved: false };
    default:
      return { title: "Rebalance sent", body: "The outcome appears in the activity log in a moment.", moved: false };
  }
}

/** Unix seconds, ticking every 15 s so "Next in 34 min" counts down and the button wakes up. */
function useNowSecs(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function RebalanceAction({ snap, ticker, onDone }: { snap: MemeSnapshot; ticker: string; onDone: () => void }) {
  const { accountId, send, connect, signHint } = useWallet();
  const toast = useToast();
  const now = useNowSecs();
  const [busy, setBusy] = useState(false);
  const { treasury, params, price, account, metadata } = snap;
  if (!treasury) return null;

  const waitSecs = treasury.last_rebalance === 0 ? 0 : treasury.next_rebalance - now;
  const priceAge = price ? now - price.publish_time : null;
  const fresh = priceAge !== null && priceAge <= params.oracle_max_age_secs;
  const ready = waitSecs <= 0 && fresh;
  const tipPct = params.caller_tip_bps / 100;
  const every = params.rebalance_cooldown_secs === 3600 ? "once an hour" : `once every ${fmtSecs(params.rebalance_cooldown_secs)}`;

  async function run() {
    if (!accountId) return;
    setBusy(true);
    const id = toast.show({ tone: "pending", title: "Running the rules", body: signHint });
    try {
      const [hash] = await send([{ receiverId: account, methodName: "rebalance", args: {}, gas: REBALANCE_TGAS, deposit: "0" }]);
      const result = hash ? await txResult(hash, accountId, account) : null;
      const d = describe(result, metadata.symbol, ticker);
      toast.update(id, {
        tone: result?.failure ? "error" : "success",
        title: d.title,
        body: d.body,
        href: hash ? `${NEARBLOCKS}/txns/${hash}` : `${NEARBLOCKS}/address/${account}`,
        hrefLabel: hash ? "The transaction on NearBlocks" : `${metadata.symbol} on NearBlocks`,
        confetti: d.moved,
      });
    } catch (e) {
      toast.update(id, { tone: "error", title: "The rebalance did not go through", body: errorText(e) });
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[0.8125rem] text-soft">
      <p>Anyone can run the rules {every}, for a {tipPct}% tip on what they move.</p>
      {!ready ? (
        <span className="tabular-nums" aria-live="polite">
          {waitSecs > 0 ? `Next in ${fmtIn(waitSecs)}` : `Waits for a fresh ${ticker} price`}
        </span>
      ) : accountId ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={run}>
          {busy ? <span className="dots">Waiting</span> : "Run rebalance"}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => connect().catch(() => undefined)}>
          Connect to run
        </Button>
      )}
    </div>
  );
}
