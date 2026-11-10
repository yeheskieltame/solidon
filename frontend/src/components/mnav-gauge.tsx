import { cn } from "cn";
import type { CSSProperties } from "react";
import {
  DEFAULT_THRESHOLDS,
  GAUGE_MAX,
  ZONES,
  fmtTimes,
  gaugePosition,
  mnavSentence,
  zoneOf,
  type Thresholds,
} from "@/lib/mnav";

/**
 * The mNAV thermometer: four coloured rule zones and a bouncy marker.
 * Redeem (red) < 0.9× · buyback (orange) < 1.0× · free band (soft green) · issuance (golden) > 2.0×.
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
  const bounds: Record<string, [number, number]> = {
    redeem: [0, t.redemption],
    buyback: [t.redemption, t.buyback],
    free: [t.buyback, t.issuance],
    issuance: [t.issuance, GAUGE_MAX],
  };
  const pos = value === null ? null : Math.min(98.5, Math.max(1.5, gaugePosition(value, t)));
  const zone = zoneOf(value, t);
  const over = value !== null && value > GAUGE_MAX;
  const nudge = pos === null ? "0%" : pos < 10 ? "32%" : pos > 90 ? "-32%" : "0%";

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
                opacity: zone === null || zone === z.zone ? 1 : 0.55,
              }}
            />
          ))}
        </div>
        {pos !== null && (
          <div className="gauge-rail" style={{ "--pos": pos } as CSSProperties} aria-hidden>
            {size === "lg" && (
              <div className="gauge-marker">
                <span className="gauge-bubble" style={{ "--nudge": nudge } as CSSProperties}>
                  {fmtTimes(value)}
                  {over ? " ›" : ""}
                </span>
                <span className="gauge-stem" />
              </div>
            )}
            <span className="gauge-knob" />
          </div>
        )}
        <div className="gauge-ticks" aria-hidden>
          {[t.redemption, t.buyback, t.issuance].map((x) => (
            <span key={x} style={{ left: `${gaugePosition(x, t)}%` }}>
              {x.toFixed(1)}×
            </span>
          ))}
        </div>
      </div>
      {legend && (
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {ZONES.map((z) => (
            <li
              key={z.zone}
              className={cn(
                "flex items-start gap-2 rounded-xl border-2 p-2.5 transition-colors",
                zone === z.zone ? "border-ink bg-white" : "border-transparent",
              )}
            >
              <span className="gauge-zone mt-0.5 size-4 shrink-0 rounded-md border-2 border-ink" data-zone={z.zone} />
              <span className="leading-tight">
                <span className="block font-extrabold">{z.name}</span>
                <span className="text-[0.8125rem] text-soft">{z.rule}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
