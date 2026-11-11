"use client";

// History from the keeper's indexer: the meme against its thesis stock (both indexed to 100 at
// the first point of the range) and mNAV over time. Only recorded points are drawn; with fewer
// than two the charts are replaced by one quiet line.

import { useId, useMemo, useRef, useState } from "react";
import { StockLogo } from "./brand-logo";
import { MemeIcon } from "./meme-icon";
import { MnavChart } from "./mnav-chart";
import { fetchHistory, type HistoryPoint } from "@/lib/indexer";
import { fmtTimes, type Thresholds } from "@/lib/mnav";
import { fmtPrice } from "@/lib/price";
import { useAsync } from "@/lib/use-async";

const RANGES = [
  { key: "24h", label: "24h", secs: 86_400 },
  { key: "7d", label: "7d", secs: 7 * 86_400 },
  { key: "all", label: "All", secs: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export const HISTORY_EMPTY = "History appears after the keeper has run a while.";

/** The whole history once; ranges are cut in the browser. */
export function useMemeHistory(account: string) {
  return useAsync(() => fetchHistory(account, { limit: 5000 }), [account]);
}

const W = 800;
const H = 240;
const PAD = 16;

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(Math.abs(n) < 10 ? 2 : 1)}%`;

function timeLabel(t: number, span: number) {
  const d = new Date(t * 1000);
  return span < 2 * 86_400
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Meme price and stock price, each as 100 × value / first value. */
function CompareChart({ points, symbol, icon, ticker }: { points: HistoryPoint[]; symbol: string; icon?: string | null; ticker: string }) {
  const gid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const m0 = points[0].price!;
  const s0 = points[0].stock_price!;
  const series = points.map((p) => ({ t: p.t, m: (p.price! / m0) * 100, s: (p.stock_price! / s0) * 100, price: p.price!, stock: p.stock_price! }));
  const t0 = series[0].t;
  const t1 = series[series.length - 1].t;
  const all = series.flatMap((p) => [p.m, p.s]);
  const lo0 = Math.min(...all, 100);
  const hi0 = Math.max(...all, 100);
  const pad = (hi0 - lo0 || 10) * 0.12;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const x = (t: number) => (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * W);
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
  const path = (k: "m" | "s") => series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  const pct = (px: number, total: number) => `${(px / total) * 100}%`;
  const nTicks = Math.min(5, series.length);
  const ticks = Array.from({ length: nTicks }, (_, i) => t0 + ((t1 - t0) * i) / Math.max(1, nTicks - 1));
  const h = hover !== null ? series[hover] : null;

  function onMove(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < series.length; i++) if (Math.abs(series[i].t - t) < Math.abs(series[best].t - t)) best = i;
    setHover(best);
  }

  return (
    <figure>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" aria-hidden>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-blue" />
          <MemeIcon icon={icon} symbol={symbol} size={18} />
          {symbol}
          <span className={last.m >= 100 ? "text-green-ink tabular-nums" : "text-red-ink tabular-nums"}>{signed(last.m - 100)}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-soft" />
          <StockLogo ticker={ticker} size={18} decorative />
          {ticker}
          <span className={last.s >= 100 ? "text-green-ink tabular-nums" : "text-red-ink tabular-nums"}>{signed(last.s - 100)}</span>
        </span>
      </div>
      <div
        ref={box}
        className="relative mt-4 h-60 touch-pan-y overflow-hidden rounded-xl bg-[var(--chart-bg)]"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <linearGradient id={`cmp-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--blue)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={W} y1={y(100)} y2={y(100)} className="chart-guide" vectorEffect="non-scaling-stroke" />
          <path d={`${path("m")} L${x(t1)} ${H} L${x(t0)} ${H} Z`} fill={`url(#cmp-${gid})`} />
          <path d={path("s")} fill="none" stroke="var(--soft)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={path("m")} fill="none" stroke="var(--blue)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" pathLength={1} className="draw-in" />
          {h && <line x1={x(h.t)} x2={x(h.t)} y1="0" y2={H} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="absolute left-3 -translate-y-1/2 rounded-md bg-page-deep px-2 py-0.5 text-xs text-ink-2" style={{ top: pct(y(100), H) }}>
          100
        </span>
        {h && (
          <>
            <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue" style={{ left: pct(x(h.t), W), top: pct(y(h.m), H) }} />
            <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-soft" style={{ left: pct(x(h.t), W), top: pct(y(h.s), H) }} />
            <span
              className="pointer-events-none absolute top-2 rounded-lg bg-[var(--tip-bg)] px-2.5 py-1.5 text-xs text-[var(--tip-ink)] tabular-nums shadow-lg"
              style={x(h.t) > W / 2 ? { right: `calc(${pct(W - x(h.t), W)} + 8px)` } : { left: `calc(${pct(x(h.t), W)} + 8px)` }}
            >
              <span className="block opacity-70">{new Date(h.t * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="block">
                {symbol} {fmtPrice(h.price)} ({signed(h.m - 100)})
              </span>
              <span className="block">
                {ticker} ${h.stock.toFixed(2)} ({signed(h.s - 100)})
              </span>
            </span>
          </>
        )}
      </div>
      <div className="relative mt-2 h-5 text-xs text-soft" aria-hidden>
        {ticks.map((t, i) => (
          <span key={t} className="absolute whitespace-nowrap" style={{ left: pct(x(t), W), transform: `translateX(${i === 0 ? "0" : i === ticks.length - 1 ? "-100%" : "-50%"})` }}>
            {timeLabel(t, t1 - t0)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {symbol} against {ticker} over {series.length} recorded points, both indexed to 100 at the start: {symbol} {signed(last.m - 100)}, {ticker}{" "}
        {signed(last.s - 100)}.
      </figcaption>
    </figure>
  );
}

/** The "History" detail: the meme against its stock, and mNAV, with range toggles. */
export function HistoryCharts({
  history,
  symbol,
  icon,
  ticker,
  thresholds,
}: {
  history: { data: HistoryPoint[] | null | undefined; loading: boolean };
  symbol: string;
  icon?: string | null;
  ticker: string;
  thresholds: Thresholds;
}) {
  const [range, setRange] = useState<RangeKey>("all");
  const labelId = useId();
  const all = history.data;
  const cut = useMemo(() => {
    if (!all?.length) return [];
    const secs = RANGES.find((r) => r.key === range)!.secs;
    const from = all[all.length - 1].t - secs;
    return all.filter((p) => p.t >= from);
  }, [all, range]);
  const compare = cut.filter((p) => (p.price ?? 0) > 0 && (p.stock_price ?? 0) > 0);
  const mnav = cut.filter((p) => (p.mnav ?? 0) > 0).map((p) => ({ t: p.t, v: p.mnav! }));

  if (history.loading && all === undefined) return <p className="text-sm text-soft">Reading the history…</p>;
  if (!all || all.length < 2)
    return (
      <p className="max-w-[62ch] text-[0.9375rem] text-soft">
        The keeper records price, NAV and mNAV as it runs. Once it has two points, {symbol} is charted against {ticker} here, with mNAV over time.
      </p>
    );

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-[0.9375rem] text-soft" id={labelId}>
          Recorded by the keeper{all.length ? ` since ${new Date(all[0].t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}. Both lines start at 100.
        </p>
        <span className="seg" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </span>
      </div>
      <div className="panel p-5 sm:p-8">
        <h4 className="mb-4 text-[0.9375rem]">
          {symbol} against {ticker}
        </h4>
        {compare.length >= 2 ? (
          <CompareChart points={compare} symbol={symbol} icon={icon} ticker={ticker} />
        ) : (
          <p className="text-sm text-soft">Not enough points in this range yet. Try All.</p>
        )}
      </div>
      <div className="panel p-5 sm:p-8">
        <h4 className="mb-6 text-[0.9375rem]">
          mNAV over time{mnav.length >= 2 ? <span className="text-soft"> · now {fmtTimes(mnav[mnav.length - 1].v)}</span> : null}
        </h4>
        {mnav.length >= 2 ? <MnavChart points={mnav} thresholds={thresholds} /> : <p className="text-sm text-soft">Not enough points in this range yet.</p>}
      </div>
    </div>
  );
}

/** A tiny price line for the Markets table; nothing when there are fewer than two points. */
export function Sparkline({ points, className }: { points: HistoryPoint[] | null | undefined; className?: string }) {
  const ps = (points ?? []).filter((p) => (p.price ?? 0) > 0);
  if (ps.length < 2) return null;
  const w = 64;
  const h = 22;
  const vs = ps.map((p) => p.price!);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const t0 = ps[0].t;
  const t1 = ps[ps.length - 1].t;
  const d = ps
    .map((p, i) => `${i ? "L" : "M"}${(((p.t - t0) / (t1 - t0 || 1)) * w).toFixed(1)} ${(hi === lo ? h / 2 : 2 + (1 - (p.price! - lo) / (hi - lo)) * (h - 4)).toFixed(1)}`)
    .join(" ");
  const up = vs[vs.length - 1] >= vs[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} role="img" aria-label={`7-day price ${up ? "up" : "down"} ${Math.abs((vs[vs.length - 1] / vs[0] - 1) * 100).toFixed(1)}%`}>
      <path d={d} fill="none" stroke={up ? "var(--green)" : "var(--red)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
