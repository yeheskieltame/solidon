"use client";

import { useId, useState } from "react";
import { cn } from "cn";
import { Term } from "./term";
import { fmtTimes, mnavSentence, zoneOf, type Zone } from "@/lib/mnav";

const MIN = 0.5;
const MAX = 3;
const pos = (v: number) => `${((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * 100}%`;

/** The four locked rules in axis order (low to high), as the contract applies them. */
const RULES: { zone: Zone; when: string; title: string; body: string }[] = [
  { zone: "redeem", when: "below 0.9×", title: "Redemption opens", body: "Holders burn tokens for NAV per token in USDC." },
  { zone: "buyback", when: "below 1.0×", title: "Buy back and burn", body: "Spare cash buys tokens from the pool and burns them." },
  { zone: "free", when: "1.0× to 2.0×", title: "Hands off", body: "The contract does nothing. The price runs on its own." },
  { zone: "issuance", when: "above 2.0×", title: "Issue and buy stock", body: "New tokens, at most 1% of supply a day, buy more stock." },
];

const TICKS = [0.9, 1, 2];

/**
 * Drag an example mNAV along one quiet scale and read which locked rule applies.
 * One number, one line, four rules in plain text: no colour coding.
 */
export function RulesPlayground() {
  const [value, setValue] = useState(1.42);
  const id = useId();
  const zone = zoneOf(value) ?? "free";
  const active = RULES.find((r) => r.zone === zone);

  return (
    <div className="panel p-5 sm:p-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-soft">
        <p>
          <Term k="mnav" align="start">
            mNAV
          </Term>{" "}
          = token price ÷ <Term k="nav">NAV</Term> per token
        </p>
        <p className="text-xs">Drag the dot · an example, not a live meme</p>
      </div>

      <div className="mt-6 grid items-end gap-x-10 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)]">
        <p className="stat-value !text-6xl sm:!text-7xl" aria-live="polite">
          {fmtTimes(value).replace("×", "")}
          <span className="fig-dim">×</span>
        </p>
        <p className="max-w-[46ch] pb-2 text-[0.9375rem] text-soft">{mnavSentence(value, undefined, "NVDA")}</p>
      </div>

      {/* The scale: a hairline you can drag along. The native range input sits on top for touch and keyboard. */}
      <div className="rules-scale relative mt-10 h-10">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" aria-hidden />
        {TICKS.map((t) => (
          <div key={t} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line-strong" style={{ left: pos(t) }} aria-hidden />
        ))}
        <div
          className="rules-thumb pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
          style={{ left: pos(value) }}
          aria-hidden
        />
        <input
          id={id}
          type="range"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          min={MIN}
          max={MAX}
          step={0.01}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="Example mNAV"
          aria-valuetext={`${fmtTimes(value)}: ${active?.title}`}
        />
      </div>
      <div className="relative h-5 text-xs text-soft" aria-hidden>
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: pos(t) }}>
            {fmtTimes(t)}
          </span>
        ))}
      </div>

      <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="The locked rules">
        {RULES.map((r) => {
          const on = r.zone === zone;
          return (
            <li key={r.zone} aria-current={on || undefined} className={cn("transition-opacity duration-300", on ? "opacity-100" : "opacity-45")}>
              <p className="text-xs text-soft">mNAV {r.when}</p>
              <p className="mt-1 font-medium text-ink">{r.title}</p>
              <p className="mt-1 text-sm text-soft">{r.body}</p>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 border-t border-line pt-5 text-sm text-soft">
        A 20% cash buffer stays on NEAR to pay redemptions; buybacks only spend what sits above it.
      </p>
    </div>
  );
}
