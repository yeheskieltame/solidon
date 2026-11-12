// Pure presentation helpers for mNAV: where a value sits on the gauge, which rule
// zone it is in, and one plain sentence about what the contract does there.

import { fmtAmount, fmtUsd, toBig, toNumber } from "./format";
import { MEME_DECIMALS } from "./config";
import type { NavEstimate } from "./math";
import type { MemeSnapshot } from "./meme";

export type Thresholds = { redemption: number; buyback: number; issuance: number };

export const DEFAULT_THRESHOLDS: Thresholds = { redemption: 0.9, buyback: 1.0, issuance: 2.0 };

/** Right edge of the gauge. Anything above is pinned there. */
export const GAUGE_MAX = 3;

export type Zone = "redeem" | "buyback" | "free" | "issuance";

export const ZONES: { zone: Zone; name: string; rule: string }[] = [
  { zone: "redeem", name: "Redeem", rule: "Holders can redeem at NAV" },
  { zone: "buyback", name: "Buyback", rule: "Spare cash buys back and burns" },
  { zone: "free", name: "Free band", rule: "The contract does nothing" },
  { zone: "issuance", name: "Issuance", rule: "New tokens buy more stock" },
];

/**
 * Piecewise scale so the narrow buyback band stays readable.
 * Stops: 0 -> 0%, redemption -> 24%, buyback -> 36%, issuance -> 74%, GAUGE_MAX -> 100%.
 */
export function gaugePosition(m: number, t: Thresholds = DEFAULT_THRESHOLDS): number {
  const stops: [number, number][] = [
    [0, 0],
    [t.redemption, 24],
    [t.buyback, 36],
    [t.issuance, 74],
    [GAUGE_MAX, 100],
  ];
  if (!(m > 0)) return 0;
  for (let i = 1; i < stops.length; i++) {
    const [x0, p0] = stops[i - 1];
    const [x1, p1] = stops[i];
    if (m <= x1) return p0 + ((m - x0) / (x1 - x0)) * (p1 - p0);
  }
  return 100;
}

export function zoneOf(m: number | null, t: Thresholds = DEFAULT_THRESHOLDS): Zone | null {
  if (m === null || !Number.isFinite(m)) return null;
  if (m < t.redemption) return "redeem";
  if (m < t.buyback) return "buyback";
  if (m <= t.issuance) return "free";
  return "issuance";
}

export function zoneName(z: Zone | null): string {
  return ZONES.find((x) => x.zone === z)?.name ?? "No mNAV yet";
}

/** "186×", "12.4×", "1.42×": as many digits as a glance needs. */
export function fmtTimes(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "–";
  if (m >= 100_000) return `${m.toExponential(1)}×`;
  if (m >= 100) return `${Math.round(m).toLocaleString("en-US")}×`;
  if (m >= 10) return `${m.toFixed(1)}×`;
  return `${m.toFixed(2)}×`;
}

/**
 * What the next rebalance can actually do, from the contract's own views. Lets the sentence
 * say "today's cap is used" instead of promising an issuance the epoch cap forbids.
 */
export type EngineState = {
  /** Unix seconds the snapshot was read. */
  now: number;
  /** When the cooldown ends; null when a rebalance can run now. */
  nextRebalance: number | null;
  /** Tokens the next rebalance may still issue (whole tokens): the room left under the epoch cap. */
  issueRoom: number;
  /** The epoch cap as a share of supply, in percent. */
  capPct: number;
  epochSecs: number;
  /** When the epoch cap resets; null when the epoch start is unknown. */
  epochEndsAt: number | null;
  /** USDC on NEAR above the cash buffer, the only money a buyback may spend. */
  spareCashUsd: number;
  bufferPct: number;
  redemptionOpen: boolean;
  symbol: string;
};

/**
 * The engine state of a live snapshot. `epochStart` comes from `fetchEpochStart` (the
 * contract does not expose it); without it the cap reset time stays unknown.
 */
export function engineState(
  snap: Pick<MemeSnapshot, "treasury" | "params" | "fetchedAt" | "metadata">,
  nav: Pick<NavEstimate, "cashUsd" | "assetsUsd">,
  epochStart: number | null,
): EngineState | null {
  const { treasury: tr, params: p, fetchedAt: now } = snap;
  if (!tr) return null;
  const epochEndsAt = epochStart !== null ? epochStart + p.epoch_secs : null;
  const circulating = toBig(tr.circulating);
  // A rebalance after the epoch ended starts a new one with a fresh cap on today's supply.
  const fresh = toBig(tr.epoch_cap) === 0n || (epochEndsAt !== null && Math.max(now, tr.next_rebalance) >= epochEndsAt);
  const roomRaw = fresh
    ? (circulating * BigInt(p.max_issuance_bps_per_epoch)) / 10_000n
    : toBig(tr.epoch_cap) - toBig(tr.epoch_issued);
  const bufferPct = p.cash_buffer_bps / 100;
  return {
    now,
    nextRebalance: tr.last_rebalance === 0 || now >= tr.next_rebalance ? null : tr.next_rebalance,
    issueRoom: roomRaw > 0n ? toNumber(roomRaw, MEME_DECIMALS) : 0,
    capPct: p.max_issuance_bps_per_epoch / 100,
    epochSecs: p.epoch_secs,
    epochEndsAt,
    spareCashUsd: Math.max(0, nav.cashUsd - (nav.assetsUsd * bufferPct) / 100),
    bufferPct,
    redemptionOpen: tr.redemption_open,
    symbol: snap.metadata.symbol,
  };
}

/** "34 min", "~13 h", "~2 d". */
export function fmtIn(secs: number): string {
  const s = Math.max(60, secs);
  if (s < 3600) return `${Math.ceil(s / 60)} min`;
  if (s < 2 * 86_400) return `~${Math.round(s / 3600)} h`;
  return `~${Math.round(s / 86_400)} d`;
}

/** Whole-token amounts for a sentence: "6.09M", "12,400". */
function fmtTokens(n: number): string {
  return n >= 1e6 ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 }) : fmtAmount(n, 0);
}

/**
 * One plain-language sentence: where the meme trades and what the contract will do about it.
 * With `state` (a live snapshot) it says what the next rebalance can really do, caps included;
 * without it (the playground, a frozen snapshot) it states the rule.
 */
export function mnavSentence(
  m: number | null,
  t: Thresholds = DEFAULT_THRESHOLDS,
  ticker = "stock",
  state: EngineState | null = null,
): string {
  const z = zoneOf(m, t);
  if (z === null || m === null) {
    return "No mNAV yet: it appears once tokens circulate and the treasury holds something.";
  }
  const at = `Trading at ${fmtTimes(m)} its assets`;
  if (z === "free") return `${at}: inside the free band, so the contract does nothing and the price runs on its own.`;
  if (!state) {
    switch (z) {
      case "redeem":
        return `${at}, under the ${t.redemption}× floor: holders can redeem at NAV once a rebalance opens the window.`;
      case "buyback":
        return `${at}, just under NAV: cash above the buffer, if any, buys back and burns tokens at the next rebalance.`;
      case "issuance":
        return `${at}: above ${t.issuance}×, so rebalances issue new tokens, up to a daily cap, to buy more ${ticker}.`;
    }
  }
  const when = state.nextRebalance !== null ? ` (in ${fmtIn(state.nextRebalance - state.now)})` : "";
  switch (z) {
    case "redeem":
      return state.redemptionOpen
        ? `${at}, under the ${t.redemption}× floor: the redemption window is open, so holders can redeem at NAV.`
        : `${at}, under the ${t.redemption}× floor: the next rebalance${when} opens redemption at NAV.`;
    case "buyback":
      return state.spareCashUsd >= 0.01
        ? `${at}, just under NAV: the next rebalance${when} can spend up to ${fmtUsd(state.spareCashUsd)} of spare cash buying back tokens.`
        : `${at}, just under NAV, but no cash sits above the ${state.bufferPct}% buffer, so there is nothing to buy back with.`;
    case "issuance": {
      if (state.issueRoom > 0) {
        return `${at}: above ${t.issuance}×, so the next rebalance${when} can issue up to ${fmtTokens(state.issueRoom)} ${state.symbol} to buy more ${ticker}.`;
      }
      const cap = `${state.epochSecs === 86_400 ? "today's" : "this epoch's"} issuance cap (${state.capPct}% of supply)`;
      const reopen = state.epochEndsAt !== null ? Math.max(state.epochEndsAt, state.nextRebalance ?? 0) - state.now : null;
      return reopen !== null
        ? `${at}: above ${t.issuance}×, but ${cap} is used; next window in ${fmtIn(reopen)}.`
        : `${at}: above ${t.issuance}×, but ${cap} is used until the epoch resets.`;
    }
  }
}
