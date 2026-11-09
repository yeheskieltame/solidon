// Raw-unit <-> human formatting. Raw amounts stay bigint; floats are for display only.

export function toBig(v: string | number | bigint | null | undefined): bigint {
  if (v === null || v === undefined || v === "") return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/** Exact decimal string of `raw / 10^decimals`. */
export function toDecimalString(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function toNumber(raw: bigint, decimals: number): number {
  return Number(toDecimalString(raw, decimals));
}

/** Parses a user-typed decimal ("12.5") into raw units, or null if invalid. */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) return null;
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f || "").padEnd(decimals, "0") || "0");
}

/** Human amount with grouping; tiny values keep 4 significant digits. */
export function fmtAmount(n: number, maxFrac = 2): string {
  if (!Number.isFinite(n)) return "–";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs < 1 && abs > 0) {
    return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

export function fmtRaw(raw: bigint, decimals: number, maxFrac = 2): string {
  return fmtAmount(toNumber(raw, decimals), maxFrac);
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  if (n !== 0 && Math.abs(n) < 0.01) {
    return "$" + n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtMnav(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "–";
  if (m >= 1000) return `${m.toExponential(1)}×`;
  return `${m.toFixed(2)}×`;
}

export function shortAddr(a: string, head = 6, tail = 4): string {
  return a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

export function timeAgo(secs: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - secs);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86_400) return `${Math.floor(d / 3600)} h ago`;
  return `${Math.floor(d / 86_400)} d ago`;
}
