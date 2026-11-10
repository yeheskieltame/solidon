import { cn } from "cn";
import type { CSSProperties } from "react";
import {
  DEFAULT_THRESHOLDS,
  GAUGE_MAX,
  ZONES,
  fmtTimes,
  gaugePosition,
  mnavSentence,
  zoneName,
  zoneOf,
  type Thresholds,
  type Zone,
} from "@/lib/mnav";

export const ZONE_PILL: Record<Zone, string> = {
  redeem: "pill-red",
  buyback: "pill-orange",
  free: "pill-green",
  issuance: "pill-lilac",
};

/** The zone as a small badge: "Issuance", "Free band", ... */
export function ZoneBadge({ zone, fallback = "No mNAV yet", className }: { zone: Zone | null; fallback?: string; className?: string }) {
  return (
    <span className={cn("pill", zone ? ZONE_PILL[zone] : "", className)}>
      <span className="dot" aria-hidden />
      {zone ? zoneName(zone) : fallback}
    </span>
  );
}

/**
 * The mNAV meter: a thin bar split into the four rule zones (redeem < 0.9×, buyback < 1.0×,
 * free band, issuance > 2.0×), a needle at the current value and precise threshold ticks.
 */
export function MnavGauge({
  value,
  thresholds = DEFAULT_THRESHOLDS,
  size = "lg",
  label = "mNAV",
  legend = false,
  className,
}: {
  value: number | null;
  thresholds?: Thresholds;
  size?: "sm" | "lg";
  label?: string;
  legend?: boolean;
  className?: string;
}) {
  const t = thresholds;
  const bounds: Record<Zone, [number, number]> = {
    redeem: [0, t.redemption],
    buyback: [t.redemption, t.buyback],
    free: [t.buyback, t.issuance],
    issuance: [t.issuance, GAUGE_MAX],
  };
  const pos = value === null ? null : Math.min(99.5, Math.max(0.5, gaugePosition(value, t)));
  const zone = zoneOf(value, t);
  const over = value !== null && value > GAUGE_MAX;
  const nudge = pos === null ? "0%" : pos < 8 ? "40%" : pos > 92 ? "-40%" : "0%";

  return (
    <div className={cn("w-full", className)}>
      <div
        className="gauge"
        data-size={size}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={GAUGE_MAX}
        aria-valuenow={value === null ? undefined : Math.min(value, GAUGE_MAX)}
        aria-valuetext={
          value === null
            ? "Not available yet"
            : `${fmtTimes(value)}. ${mnavSentence(value, t)} Rules: redeem below ${t.redemption}×, buyback below ${t.buyback}×, issuance above ${t.issuance}×.`
        }
      >
        <div className="gauge-track" aria-hidden>
          {ZONES.map((z) => (
            <div
              key={z.zone}
              className="gauge-zone"
              data-zone={z.zone}
              style={{
                width: `${gaugePosition(bounds[z.zone][1], t) - gaugePosition(bounds[z.zone][0], t)}%`,
                opacity: zone === null ? 0.35 : zone === z.zone ? 1 : 0.22,
              }}
            />
          ))}
        </div>
        {pos !== null && (
          <div className="gauge-needle" style={{ "--pos": pos } as CSSProperties} aria-hidden>
            {size === "lg" && (
              <span className="gauge-value" style={{ "--nudge": nudge } as CSSProperties}>
                {fmtTimes(value)}
                {over ? " ▸" : ""}
              </span>
            )}
          </div>
        )}
        {size === "lg" && (
          <div className="gauge-ticks" aria-hidden>
            {[t.redemption, t.buyback, t.issuance].map((x) => (
              <span key={x} style={{ left: `${gaugePosition(x, t)}%` }}>
                {x.toFixed(1)}×
              </span>
            ))}
          </div>
        )}
      </div>
      {legend && (
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          {ZONES.map((z) => (
            <li key={z.zone} className={cn("flex items-start gap-2 transition-opacity", zone && zone !== z.zone && "opacity-55")}>
              <span className="gauge-zone mt-1.5 h-1.5 w-3 shrink-0 !rounded-full" data-zone={z.zone} aria-hidden />
              <span className="leading-snug">
                <span className="block font-medium">{z.name}</span>
                <span className="text-[0.8125rem] text-soft">{z.rule}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
