"use client";

import { useId } from "react";
import { fmtTimes, type Thresholds } from "@/lib/mnav";

const W = 800;
const H = 240;
const PAD_T = 18;
const PAD_B = 14;

/**
 * mNAV at each rebalance, from the contract's own `rebalance` events (no interpolation, no
 * invented points): a thin blue line, a soft gradient fill, a dotted average with its label,
 * the rule thresholds that fall inside the range, and date ticks.
 */
export function MnavChart({ points, thresholds }: { points: { t: number; v: number }[]; thresholds: Thresholds }) {
  const gid = useId().replace(/:/g, "");
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const vs = points.map((p) => p.v);
  const lo0 = Math.min(...vs);
  const hi0 = Math.max(...vs);
  const span = hi0 - lo0 || Math.max(hi0 * 0.2, 0.1);
  const lo = Math.max(0, lo0 - span * 0.25);
  const hi = hi0 + span * 0.25;
  const x = (t: number) => (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * W);
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)} ${H} L${x(t0).toFixed(1)} ${H} Z`;
  const avg = vs.reduce((s, v) => s + v, 0) / vs.length;
  const guides = [
    { v: thresholds.redemption, label: `${thresholds.redemption}× redeem` },
    { v: thresholds.buyback, label: `${thresholds.buyback}× buyback` },
    { v: thresholds.issuance, label: `${thresholds.issuance}× issuance` },
  ].filter((g) => g.v > lo && g.v < hi);
  const nTicks = Math.min(5, points.length);
  const ticks = Array.from({ length: nTicks }, (_, i) => t0 + ((t1 - t0) * i) / Math.max(1, nTicks - 1));
  const date = (t: number) =>
    t1 - t0 < 2 * 86_400
      ? new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  // Dots mark each recorded value while they stay legible; dense series are a plain line.
  const dots = points.length <= 40;
  const pct = (px: number, total: number) => `${(px / total) * 100}%`;

  return (
    <figure>
      <div className="relative h-60 overflow-hidden rounded-xl bg-[var(--chart-bg)]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a6ff7" stopOpacity="0.32" />
              <stop offset="1" stopColor="#3a6ff7" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {guides.map((g) => (
            <line key={g.v} x1="0" x2={W} y1={y(g.v)} y2={y(g.v)} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill={`url(#fill-${gid})`} />
          <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} className="chart-guide" vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" stroke="#3a6ff7" strokeWidth="1.75" vectorEffect="non-scaling-stroke" pathLength={1} className="draw-in" />
        </svg>
        <span className="absolute left-3 -translate-y-1/2 rounded-md bg-page-deep px-2 py-0.5 text-xs text-ink" style={{ top: pct(y(avg), H) }}>
          Avg {fmtTimes(avg)}
        </span>
        {guides.map((g) => (
          <span key={g.v} className="absolute right-3 -translate-y-[115%] text-xs text-soft" style={{ top: pct(y(g.v), H) }}>
            {g.label}
          </span>
        ))}
        {dots && points.map((p) => (
          <span
            key={p.t}
            className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-ink"
            style={{ left: pct(x(p.t), W), top: pct(y(p.v), H) }}
            title={`${fmtTimes(p.v)} on ${new Date(p.t * 1000).toLocaleString("en-GB")}`}
          />
        ))}
      </div>
      <div className="relative mt-2 h-5 text-xs text-soft" aria-hidden>
        {ticks.map((t, i) => (
          <span
            key={t}
            className="absolute whitespace-nowrap"
            style={{ left: pct(x(t), W), transform: `translateX(${i === 0 ? "0" : i === ticks.length - 1 ? "-100%" : "-50%"})` }}
          >
            {date(t)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        mNAV at {points.length} recorded points, from {fmtTimes(points[0].v)} to {fmtTimes(points[points.length - 1].v)}, average {fmtTimes(avg)}.
      </figcaption>
    </figure>
  );
}
