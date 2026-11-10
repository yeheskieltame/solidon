"use client";

import { useId, useState } from "react";
import { cn } from "cn";
import { LazyVideo } from "./lazy-video";
import { MnavGauge } from "./mnav-gauge";
import { Term } from "./term";
import { fmtTimes, mnavSentence, zoneOf, type Zone } from "@/lib/mnav";

const PRESETS: { label: string; value: number }[] = [
  { label: "Panic", value: 0.78 },
  { label: "Dip", value: 0.95 },
  { label: "Calm", value: 1.42 },
  { label: "Hype", value: 2.6 },
];

const ZONE_TINT: Record<Zone, string> = {
  redeem: "bg-red-wash text-red-ink",
  buyback: "bg-orange-wash text-orange-ink",
  free: "bg-green-wash text-green-ink",
  issuance: "bg-golden-wash text-golden-ink",
};

const ZONE_HEAD: Record<Zone, string> = {
  redeem: "Redemption opens",
  buyback: "Buyback and burn",
  free: "Hands off",
  issuance: "Issue and buy more stock",
};

/** Drag the price and watch which locked rule wakes up. Example data, clearly labelled. */
export function RulesPlayground() {
  const [value, setValue] = useState(1.42);
  const id = useId();
  const zone = zoneOf(value) ?? "free";

  return (
    <div className="relative isolate overflow-hidden rounded-[32px] border-2 border-ink bg-white shadow-[0_6px_0_var(--ink)]">
      <LazyVideo
        src="/backgrounds/neon-flux.mp4"
        poster="/backgrounds/neon-flux.jpg"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-70"
      />
      <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_20rem] lg:gap-10">
        <div className="min-w-0">
          <p className="font-extrabold">
            <Term k="mnav" align="start">
              mNAV
            </Term>{" "}
            = token price ÷{" "}
            <Term k="nav">NAV</Term> per token
          </p>
          <MnavGauge value={value} label="Example mNAV" className="mt-4" />
          <label htmlFor={id} className="mt-5 block text-sm font-extrabold">
            Drag the market price
          </label>
          <input
            id={id}
            type="range"
            className="slider"
            min={0.5}
            max={3}
            step={0.01}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            aria-valuetext={`${fmtTimes(value)}: ${ZONE_HEAD[zone]}`}
          />
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Jump to a market mood">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="chip"
                aria-pressed={Math.abs(value - p.value) < 0.005}
                onClick={() => setValue(p.value)}
              >
                {p.label} {fmtTimes(p.value)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-3xl border-2 border-ink bg-white p-5" aria-live="polite">
          <span className={cn("pill self-start", ZONE_TINT[zone])}>{ZONE_HEAD[zone]}</span>
          <p className="type-num mt-3 text-6xl">{fmtTimes(value)}</p>
          <p className="mt-3 text-[0.9375rem] font-semibold text-soft">{mnavSentence(value, undefined, "NVDA")}</p>
          <p className="mt-3 text-xs font-bold text-soft">An example, not a live meme.</p>
        </div>
      </div>
    </div>
  );
}
