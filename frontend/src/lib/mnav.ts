// Pure presentation helpers for mNAV: where a value sits on the gauge, which rule
// zone it is in, and one plain sentence about what the contract does there.

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

/** One plain-language sentence: where the meme trades and what the contract does about it. */
export function mnavSentence(
  m: number | null,
  t: Thresholds = DEFAULT_THRESHOLDS,
  ticker = "stock",
): string {
  const z = zoneOf(m, t);
  if (z === null || m === null) {
    return "No mNAV yet: it appears once tokens circulate and the treasury holds something.";
  }
  const at = `Trading at ${fmtTimes(m)} its assets`;
  switch (z) {
    case "redeem":
      return `${at}, under the ${t.redemption}× floor: holders can redeem at NAV once a rebalance opens the window.`;
    case "buyback":
      return `${at}, just under NAV: spare cash buys back and burns tokens at the next rebalance.`;
    case "free":
      return `${at}: inside the free band, so the contract does nothing and the price runs on its own.`;
    case "issuance":
      return `${at}: the contract is issuing new tokens to buy more ${ticker}.`;
  }
}
