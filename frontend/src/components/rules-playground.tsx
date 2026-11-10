"use client";

import { useId, useState } from "react";
import { cn } from "cn";
import { MnavGauge, ZONE_PILL } from "./mnav-gauge";
import { Term } from "./term";
import { fmtTimes, mnavSentence, zoneOf, type Zone } from "@/lib/mnav";

const PRESETS: { label: string; value: number }[] = [
  { label: "Panic", value: 0.78 },
  { label: "Dip", value: 0.95 },
  { label: "Calm", value: 1.42 },
  { label: "Hype", value: 2.6 },
];

/** The four locked rules, highest threshold first, as the contract applies them. */
const RULES: { zone: Zone; when: string; title: string; body: string }[] = [
  {
    zone: "issuance",
    when: "above 2.0×",
    title: "Issue and buy more stock",
    body: "The contract mints new tokens into the pool, at most 1% of supply a day, and the proceeds buy more stock.",
  },
  {
    zone: "free",
    when: "1.0× to 2.0×",
    title: "Hands off",
    body: "Inside the free band the contract does nothing. The price runs on its own.",
  },
  {
    zone: "buyback",
    when: "below 1.0×",
    title: "Buy back and burn",
    body: "Cash above the 20% buffer buys tokens from the pool and burns them, lifting NAV per token.",
  },
  {
    zone: "redeem",
    when: "below 0.9×",
    title: "Open redemption",
    body: "Holders can burn tokens for NAV per token in USDC, paid from the cash buffer on NEAR.",
  },
];

/** Drag an example price and watch which locked rule wakes up. Example data, labelled as such. */
export function RulesPlayground() {
  const [value, setValue] = useState(1.42);
  const id = useId();
  const zone = zoneOf(value) ?? "free";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="panel flex flex-col p-5 sm:p-8">
        <p className="text-sm text-soft">
          <Term k="mnav" align="start">
            mNAV
          </Term>{" "}
          = token price ÷ <Term k="nav">NAV</Term> per token
        </p>
        <p className="stat-value mt-4 !text-6xl sm:!text-7xl" aria-live="polite">
          {fmtTimes(value).replace("×", "")}
          <span className="fig-dim">×</span>
        </p>
        <p className="mt-2 min-h-[3em] max-w-[44ch] text-[0.9375rem] text-soft">{mnavSentence(value, undefined, "NVDA")}</p>
        <MnavGauge value={value} label="Example mNAV" className="mt-4" />
        <label htmlFor={id} className="mt-4 block text-sm text-ink-2">
          Drag the market price
        </label>
        <input
          id={id}
          type="range"
          className="slider mt-1"
          min={0.5}
          max={3}
          step={0.01}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-valuetext={`${fmtTimes(value)}: ${RULES.find((r) => r.zone === zone)?.title}`}
        />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Jump to a market mood">
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
        <p className="mt-auto pt-5 text-xs text-soft">An example, not a live meme.</p>
      </div>

      <ul className="grid content-start border-t border-line" aria-label="The locked rules">
        {RULES.map((r) => {
          const on = r.zone === zone;
          return (
            <li
              key={r.zone}
              className={cn(
                "flex gap-4 border-b border-line py-5 transition-opacity duration-300",
                on ? "opacity-100" : "opacity-55",
              )}
              aria-current={on || undefined}
            >
              <span className="gauge-zone mt-1.5 h-8 w-1 shrink-0 !rounded-full" data-zone={r.zone} style={{ opacity: on ? 1 : 0.35 }} aria-hidden />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="type-h3">{r.title}</span>
                  <span className={cn("pill", on ? ZONE_PILL[r.zone] : "")}>mNAV {r.when}</span>
                </p>
                <p className="mt-1 text-sm text-soft">{r.body}</p>
              </div>
            </li>
          );
        })}
        <li className="flex items-center gap-4 py-5">
          <span className="relative flex size-11 shrink-0 items-center justify-center" aria-hidden>
            <svg viewBox="0 0 36 36" className="size-11 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--page-deep)" strokeWidth="4" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--blue)" strokeWidth="4" strokeDasharray={`${0.2 * 94.25} 94.25`} strokeLinecap="round" />
            </svg>
            <span className="absolute text-[0.6875rem]">20%</span>
          </span>
          <p className="text-sm text-soft">
            <span className="text-ink">A 20% cash buffer.</span> USDC kept on NEAR to pay
            redemptions. Below 10% a stock sale refills it; buybacks only spend what is above it.
          </p>
        </li>
      </ul>
    </div>
  );
}
