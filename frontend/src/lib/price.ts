// Display-only price formatting. Meme prices are often tiny ($0.0000017), which does not
// fit a stat tile, so they use the zero-count subscript traders know: "$0.0₅17".

import { fmtUsd } from "./format";

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** USD price for tight spaces. Values of $0.001 and up read like `fmtUsd`. */
export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs === 0 || abs >= 0.001) return fmtUsd(n);
  let exp = Math.floor(Math.log10(abs));
  let digits = Math.round(abs / 10 ** (exp - 3));
  if (digits >= 10_000) {
    digits = 1000;
    exp += 1;
  }
  if (exp >= -3) return fmtUsd(n);
  const zeros = String(-exp - 1)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
  const tail = String(digits).replace(/0+$/, "") || "0";
  return `${n < 0 ? "-" : ""}$0.0${zeros}${tail}`;
}

/** The same price written out in full, for titles and screen readers. */
export function fmtPriceLong(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "not available";
  if (n !== 0 && Math.abs(n) < 0.001) return `$${n.toFixed(12).replace(/0+$/, "")}`;
  return fmtUsd(n);
}
