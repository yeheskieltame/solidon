import { cn } from "cn";
import { fmtMnav } from "@/lib/format";

type Thresholds = { redemption: number; buyback: number; issuance: number };

const DEFAULT_T: Thresholds = { redemption: 0.9, buyback: 1.0, issuance: 2.0 };
const MAX = 3;

/**
 * Piecewise scale so the narrow 0.9–1.0 buyback band stays readable.
 * Stops: 0 → 0%, redemption → 22%, buyback → 32%, issuance → 72%, MAX → 100%.
 */
function position(m: number, t: Thresholds): number {
  const stops: [number, number][] = [
    [0, 0],
    [t.redemption, 22],
    [t.buyback, 32],
    [t.issuance, 72],
    [MAX, 100],
  ];
  if (m <= 0) return 0;
  for (let i = 1; i < stops.length; i++) {
    const [x0, p0] = stops[i - 1];
    const [x1, p1] = stops[i];
    if (m <= x1) return p0 + ((m - x0) / (x1 - x0)) * (p1 - p0);
  }
  return 100;
}

export function zoneOf(m: number | null, t: Thresholds = DEFAULT_T): string {
  if (m === null) return "No mNAV yet";
  if (m < t.redemption) return "Redemption window";
  if (m < t.buyback) return "Buyback zone";
  if (m <= t.issuance) return "Free band";
  return "Issuance zone";
}

export function MnavRuler({
  value,
  thresholds = DEFAULT_T,
  size = "lg",
  label = "mNAV",
  className,
}: {
  value: number | null;
  thresholds?: Thresholds;
  size?: "sm" | "lg";
  label?: string;
  className?: string;
}) {
  const t = thresholds;
  const zones = [
    { from: 0, to: t.redemption, cls: "hatch-dense", name: "Redeem at NAV" },
    { from: t.redemption, to: t.buyback, cls: "hatch-light", name: "Buyback" },
    { from: t.buyback, to: t.issuance, cls: "", name: "Free band" },
    { from: t.issuance, to: MAX, cls: "bg-ink", name: "Issuance" },
  ];
  const pos = value === null ? null : position(value, t);
  const overflow = value !== null && value > MAX;
  const lg = size === "lg";
  const description =
    value === null
      ? `${label}: not available yet`
      : `${label} ${fmtMnav(value)}: ${zoneOf(value, t)}. Thresholds: redemption below ${t.redemption}×, buyback below ${t.buyback}×, issuance above ${t.issuance}×.`;

  return (
    <figure className={cn("w-full", className)} role="img" aria-label={description}>
      <div className={cn("relative", lg ? "pt-9" : "pt-6")}>
        {pos !== null && (
          <div
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${Math.min(pos, 100)}%` }}
            aria-hidden
          >
            <span
              className={cn(
                "bg-ink px-1.5 py-0.5 leading-none whitespace-nowrap text-paper type-wide",
                lg ? "text-sm" : "text-[11px]",
              )}
            >
              {fmtMnav(value)}
              {overflow ? " ›" : ""}
            </span>
            <span className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink" />
          </div>
        )}
        <div
          className={cn("relative flex w-full overflow-hidden border border-ink", lg ? "h-7" : "h-3")}
          aria-hidden
        >
          {zones.map((z) => (
            <div
              key={z.name}
              className={cn("h-full border-r border-ink last:border-r-0", z.cls)}
              style={{ width: `${position(z.to, t) - position(z.from, t)}%` }}
            />
          ))}
          {pos !== null && (
            <div
              className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-ink outline outline-2 outline-paper"
              style={{ left: `${Math.min(pos, 100)}%` }}
            />
          )}
        </div>
        <div className={cn("relative", lg ? "h-5" : "h-4")} aria-hidden>
          {[t.redemption, t.buyback, t.issuance].map((x) => (
            <span
              key={x}
              className={cn(
                "absolute top-1 -translate-x-1/2 text-graphite",
                lg ? "text-xs" : "text-[10px]",
              )}
              style={{ left: `${position(x, t)}%` }}
            >
              {x.toFixed(1)}×
            </span>
          ))}
        </div>
      </div>
      {lg && (
        <figcaption className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-graphite sm:grid-cols-4">
          {zones.map((z) => (
            <span key={z.name} className="flex items-center gap-2">
              <span className={cn("inline-block size-3 shrink-0 border border-ink", z.cls)} />
              {z.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
