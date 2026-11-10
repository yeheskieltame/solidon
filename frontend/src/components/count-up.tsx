"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { splitFigure } from "@/lib/figure";

/** Writes a figure, optionally as a bright head and a dimmed tail (`.fig-dim`). */
function paint(el: HTMLElement, text: string, split: boolean) {
  if (!split) {
    el.textContent = text;
    return;
  }
  el.replaceChildren(
    ...splitFigure(text).map((p) => {
      const s = document.createElement("span");
      s.textContent = p.text;
      if (p.dim) s.className = "fig-dim";
      return s;
    }),
  );
}

/**
 * Counts a key figure up from its previous value (zero at first). The text is written
 * straight to the DOM, so there is no re-render per frame; under
 * prefers-reduced-motion it jumps to the end. `split` dims the less significant tail.
 */
export function CountUp({
  value,
  format,
  className,
  split = false,
}: {
  value: number | null;
  format: (n: number) => string;
  className?: string;
  split?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const fmt = useRef(format);
  useEffect(() => {
    fmt.current = format;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === null || !Number.isFinite(value)) {
      paint(el, "–", split);
      return;
    }
    const start = from.current;
    from.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || start === value) {
      paint(el, fmt.current(value), split);
      return;
    }
    paint(el, fmt.current(start), split);
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      paint(el, fmt.current(p < 1 ? start + (value - start) * eased : value), split);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      paint(el, fmt.current(value), split);
    };
  }, [value, split]);

  return <span ref={ref} className={className} />;
}
