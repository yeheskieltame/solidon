import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { ExplorerLink } from "./copy-button";
import { GLOSSARY, Hint } from "./term";
import { MEME_DECIMALS, NEARBLOCKS } from "@/lib/config";
import { fmtCompact } from "@/lib/figure";
import { fmtRaw, toNumber } from "@/lib/format";
import { GAUGE_MAX, ZONES, fmtTimes, zoneOf, type Thresholds, type Zone } from "@/lib/mnav";
import type { Params } from "@/lib/near";

/** "15 minutes", "1 hour", "1 day". */
export function fmtSecs(s: number) {
  if (s % 86_400 === 0) return `${s / 86_400} day${s === 86_400 ? "" : "s"}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  return `${Math.round(s / 60)} minutes`;
}

/** "a day", "an hour", "every 2 days". */
function fmtPer(s: number) {
  if (s === 86_400) return "a day";
  if (s === 3600) return "an hour";
  return `every ${fmtSecs(s)}`;
}

const pct = (bps: number) => `${bps / 100}%`;

/*
 * The axis is ordinal: the three thresholds sit at the centres of three equal columns
 * (1/6, 1/2, 5/6), so each number stands right under its tick. The current mNAV is placed
 * piecewise between them and pinned near the right end above GAUGE_MAX.
 */
const STOPS = [0, 100 / 6, 50, 500 / 6, 100];
function axisPosition(m: number, t: Thresholds) {
  const xs = [0, t.redemption, t.buyback, t.issuance, GAUGE_MAX];
  if (!(m > 0)) return 1;
  for (let i = 1; i < xs.length; i++) {
    if (m <= xs[i]) return STOPS[i - 1] + ((m - xs[i - 1]) / (xs[i] - xs[i - 1])) * (STOPS[i] - STOPS[i - 1]);
  }
  return 98;
}

const RULES: { zone: Zone; label: string; key: keyof Thresholds }[] = [
  { zone: "redeem", label: "Redeem below", key: "redemption" },
  { zone: "buyback", label: "Buy back below", key: "buyback" },
  { zone: "issuance", label: "Issue above", key: "issuance" },
];
const SEGMENTS: { zone: Zone; from: number; to: number }[] = [
  { zone: "redeem", from: STOPS[0], to: STOPS[1] },
  { zone: "buyback", from: STOPS[1], to: STOPS[2] },
  { zone: "free", from: STOPS[2], to: STOPS[3] },
  { zone: "issuance", from: STOPS[3], to: STOPS[4] },
];

/** The three mNAV rules on one thin axis, with where the meme trades now. */
function ThresholdAxis({ thresholds, mnav }: { thresholds: Thresholds; mnav: number | null }) {
  const zone = zoneOf(mnav, thresholds);
  const pos = mnav === null ? null : Math.min(98, Math.max(2, axisPosition(mnav, thresholds)));
  return (
    <div>
      <div className="relative h-9" aria-hidden>
        {pos !== null && (
          <span className="rules-now" data-edge={pos > 88 ? "end" : pos < 12 ? "start" : undefined} style={{ "--pos": `${pos}%` } as CSSProperties}>
            Now {fmtTimes(mnav)}
          </span>
        )}
      </div>
      <div className="relative h-0.5" aria-hidden>
        {SEGMENTS.map((s) => (
          <span
            key={s.zone}
            data-zone={s.zone}
            className="absolute inset-y-0 rounded-full transition-opacity"
            style={{ left: `calc(${s.from}% + 1px)`, width: `calc(${s.to - s.from}% - 2px)`, opacity: zone === s.zone ? 0.9 : 0.28 }}
          />
        ))}
        {pos !== null && <span className="rules-needle" style={{ left: `${pos}%` }} />}
      </div>
      <ul className="grid grid-cols-3">
        {RULES.map((r) => {
          const rule = ZONES.find((z) => z.zone === r.zone)?.rule;
          return (
            <li key={r.zone} className="relative px-1.5 pt-5 text-center sm:px-4">
              <span className="absolute top-[-5px] left-1/2 h-3 w-px -translate-x-1/2 bg-line-strong" aria-hidden />
              <p className="text-[0.8125rem] text-soft">{r.label}</p>
              <p className="type-num mt-1 text-[1.625rem] sm:text-[2rem]">
                {thresholds[r.key].toFixed(2)}
                <span className="fig-dim">×</span>
              </p>
              <p className="mx-auto mt-1.5 max-w-[16rem] text-[0.8125rem] leading-snug text-ink-2">{rule}</p>
            </li>
          );
        })}
      </ul>
      <p className="sr-only">
        {mnav === null ? "No mNAV yet." : `mNAV is ${fmtTimes(mnav)} now.`} Redeem below {fmtTimes(thresholds.redemption)}, buy
        back below {fmtTimes(thresholds.buyback)}, issue above {fmtTimes(thresholds.issuance)}.
      </p>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[0.9375rem] text-ink">
        {title}
        {hint && <Hint tip={hint} align="start" />}
      </h3>
      <dl className="mt-3 grid gap-y-2.5">{children}</dl>
    </div>
  );
}

function Row({ k, v, title }: { k: string; v: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[0.875rem]">
      <dt className="shrink-0 text-soft">{k}</dt>
      <dd className="min-w-0 text-right whitespace-nowrap text-ink-2 tabular-nums" title={title}>
        {v}
      </dd>
    </div>
  );
}

/** The meme's locked rules: the three mNAV thresholds, then supply, cash and oracle settings. */
export function RulesSection({
  thresholds,
  mnav,
  params,
  oracle,
  epochCap,
  epochIssued,
  swapCap,
  redemptionOpen,
  fromContract,
}: {
  thresholds: Thresholds;
  mnav: number | null;
  params: Params;
  oracle: string | null;
  epochCap: bigint;
  epochIssued: bigint;
  /** Per-swap caps reported by the chains, in USDC. */
  swapCap: number[];
  redemptionOpen: boolean;
  fromContract: boolean;
}) {
  const issued = toNumber(epochIssued, MEME_DECIMALS);
  const cap = toNumber(epochCap, MEME_DECIMALS);
  const used = cap > 0 ? Math.min(1, issued / cap) : 0;
  const caps = [...new Set(swapCap)];

  return (
    <div>
      <ThresholdAxis thresholds={thresholds} mnav={mnav} />

      <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
        <Group title="Supply" hint="Above the issuance threshold a rebalance mints new tokens into the pool, up to this cap, and the proceeds buy more stock.">
          <Row k="Issuance cap" v={`${pct(params.max_issuance_bps_per_epoch)} of supply ${fmtPer(params.epoch_secs)}`} />
          {cap > 0 ? (
            <div>
              <Row
                k="Issued this epoch"
                v={`${fmtCompact(issued)} / ${fmtCompact(cap)}`}
                title={`${fmtRaw(epochIssued, MEME_DECIMALS)} of ${fmtRaw(epochCap, MEME_DECIMALS)}`}
              />
              <div
                className="bar mt-2.5 !h-1"
                role="meter"
                aria-label="Issued this epoch"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(used * 100)}
              >
                <div className="bar-fill bg-lilac" style={{ width: `${used * 100}%` }} />
              </div>
            </div>
          ) : (
            <Row k="Issued this epoch" v="Starts at the first rebalance" />
          )}
        </Group>

        <Group title="Cash and trading" hint="Spare cash above the buffer target funds buybacks. A swap cap is the most USDC one signed treasury swap may spend.">
          <Row k="Cash buffer target" v={pct(params.cash_buffer_bps)} />
          <Row k="Refill below" v={pct(params.cash_refill_bps)} />
          <Row k="Pool fee" v={pct(params.pool_fee_bps)} />
          <Row k="To treasury / creator" v={`${pct(params.treasury_fee_bps)} / ${pct(params.creator_fee_bps)}`} />
          {caps.length > 0 && <Row k="Swap cap" v={caps.length === 1 ? `${fmtCompact(caps[0])} USDC per chain` : caps.map((c) => `${fmtCompact(c)} USDC`).join(" / ")} />}
        </Group>

        <Group title="Oracle and timing" hint={GLOSSARY.twap.replace("30 minutes", fmtSecs(params.twap_window_secs))}>
          <Row k="TWAP window" v={fmtSecs(params.twap_window_secs)} />
          <Row
            k="Oracle"
            v={
              oracle ? (
                <span className="inline-flex max-w-full items-center gap-0.5" title={oracle}>
                  <span className="truncate">{oracle}</span>
                  <ExplorerLink href={`${NEARBLOCKS}/address/${oracle}`} label={`${oracle} on NearBlocks`} />
                </span>
              ) : (
                "–"
              )
            }
          />
          <Row k="Max price age" v={fmtSecs(params.oracle_max_age_secs)} />
          <Row k="Rebalance cooldown" v={fmtSecs(params.rebalance_cooldown_secs)} />
          <Row k="Caller tip" v={pct(params.caller_tip_bps)} />
        </Group>
      </div>

      <p className="mt-12 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-soft">
        <span className={cn("dot", redemptionOpen ? "text-green" : "text-faint")} aria-hidden />
        <span className={cn(redemptionOpen && "text-green-ink")}>Redemption window {redemptionOpen ? "open" : "closed"}.</span>
        <span>{fromContract ? "Locked at launch, read from get_params. No owner, no setter." : "get_params is unavailable on this meme: showing the SPEC defaults."}</span>
      </p>
    </div>
  );
}
