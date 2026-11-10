"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { StockLogo } from "@/components/brand-logo";
import { TESTNET_VENUES } from "@/lib/venues";

const STOCKS = Object.entries(TESTNET_VENUES).map(([ticker, v]) => ({ ticker, name: v.name }));

function Item({ ticker, name }: { ticker: string; name: string }) {
  return (
    <li className="flex shrink-0 items-center gap-3">
      <StockLogo ticker={ticker} size={40} decorative />
      <span className="leading-tight">
        <span className="block text-[1.0625rem]">{name}</span>
        <span className="block text-sm text-soft">{ticker}</span>
      </span>
    </li>
  );
}

function Row({ items, reverse, shift }: { items: typeof STOCKS; reverse?: boolean; shift: MotionValue<number> | null }) {
  // Four copies: each half of the loop is wider than any screen.
  const doubled = [...items, ...items, ...items, ...items];
  return (
    <motion.div style={shift ? { x: shift } : undefined}>
      <ul className="marquee" data-reverse={reverse}>
        {doubled.map((s, i) => (
          <Item key={`${s.ticker}-${i}`} {...s} />
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * The supported stocks: one row drifting sideways, nudged further by the scroll position.
 * Pauses on hover; static under reduced motion.
 */
export function StockMarquee() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const a = useTransform(scrollYProgress, [0, 1], [60, -60]);

  if (reduce) {
    return (
      <ul className="wrap flex flex-wrap justify-center gap-8" aria-label="Supported stocks">
        {STOCKS.map((s) => (
          <Item key={s.ticker} {...s} />
        ))}
      </ul>
    );
  }
  return (
    <div ref={ref} className="marquee-mask overflow-hidden py-1" aria-label="Supported stocks" role="region">
      <Row items={STOCKS} shift={a} />
    </div>
  );
}
