// Display-only: splits a formatted figure into a bright head and a dimmed tail, the way
// Morpho prints "$1.62" bright and "B" dim. Pure string work on already formatted values.

export type FigurePart = { text: string; dim: boolean };

/**
 * "$1.62B" -> $1.62 | B, "5.62%" -> 5.62 | %, "1.42×" -> 1.42 | ×, "$12.34" -> $12 | .34,
 * "$0.0₅3925" -> $0.0₅ (dim) | 3925 (bright), "–" -> dim.
 */
export function splitFigure(text: string): FigurePart[] {
  const t = text.trim();
  if (t === "" || t === "–") return [{ text: t || "–", dim: true }];
  const tiny = /^(-?\$?0\.0[₀-₉]+)(\d+)$/.exec(t);
  if (tiny) return [{ text: tiny[1], dim: true }, { text: tiny[2], dim: false }];
  const suffix = /^(.*?\d)(\s?[A-Za-z%×]+)$/.exec(t);
  if (suffix) return [{ text: suffix[1], dim: false }, { text: suffix[2], dim: true }];
  const cents = /^(-?\$[\d,]+)(\.\d+)$/.exec(t);
  if (cents) return [{ text: cents[1], dim: false }, { text: cents[2], dim: true }];
  return [{ text: t, dim: false }];
}

/** USD with K / M / B above 100,000, so a big figure stays short. */
export function fmtUsdCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs < 100_000) {
    if (n !== 0 && abs < 0.01) return "$" + n.toLocaleString("en-US", { maximumSignificantDigits: 3 });
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  const [div, unit] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `$${(n / div).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}${unit}`;
}

/** A token amount with K / M / B above 100,000: "498.93M". */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs < 100_000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const [div, unit] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  return `${(n / div).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit}`;
}
