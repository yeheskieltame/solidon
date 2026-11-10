"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TESTNET_VENUES } from "@/lib/venues";

/**
 * Two counter-moving rows of chunky pills, after the MotionSites "Scroll Marquee" prompt:
 * each row is tripled and shifted by the section's scroll progress. Two changes: an idle
 * CSS loop keeps the tape alive when nobody scrolls, and the scroll shift is always
 * negative, so the row never opens a gap on its leading edge.
 */
function Dot({ color }: { color: string }) {
  return <span className="size-3 rounded-full border-2 border-ink" style={{ background: color }} aria-hidden />;
}

const STOCKS = Object.entries(TESTNET_VENUES).map(([ticker, v]) => ({ ticker, name: v.name }));

const FACTS: { label: string; color: string }[] = [
  { label: "Base", color: "var(--chain-base)" },
  { label: "Redeem at NAV under 0.9×", color: "var(--red)" },
  { label: "Robinhood Chain", color: "var(--chain-hood)" },
  { label: "Buyback under 1.0×", color: "var(--orange)" },
  { label: "Solana", color: "var(--chain-sol-a)" },
  { label: "Issue above 2.0×", color: "var(--golden)" },
  { label: "NEAR Chain Signatures", color: "var(--green)" },
  { label: "No admin key", color: "var(--ink)" },
  { label: "1% fee feeds the treasury", color: "var(--blue)" },
];

function Row({ children, dir }: { children: ReactNode; dir?: "rev" }) {
  return (
    <div className="tape" data-dir={dir}>
      <div className="tape-shift" data-tape={dir ?? "fwd"}>
        <div className="tape-row">
          {[0, 1, 2].map((copy) => (
            <div key={copy} className="flex gap-3" aria-hidden={copy > 0}>
              {children}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TickerTape() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-tape]"));
    let frame = 0;
    const apply = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      for (const row of rows) {
        const shift = row.dataset.tape === "rev" ? -(1 - progress) * 220 : -progress * 220;
        row.style.setProperty("--shift", shift.toFixed(1));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={root} className="border-y-2 border-ink bg-golden py-3" role="group" aria-label="Stocks and rules on Solidon">
      <Row>
        {STOCKS.map((s) => (
          <span key={s.ticker} className="tape-item">
            <span className="font-heading font-black tracking-tight">{s.ticker}</span>
            <span className="text-sm text-soft">{s.name}</span>
          </span>
        ))}
      </Row>
      <Row dir="rev">
        {FACTS.map((f) => (
          <span key={f.label} className="tape-item">
            <Dot color={f.color} />
            {f.label}
          </span>
        ))}
      </Row>
    </div>
  );
}
