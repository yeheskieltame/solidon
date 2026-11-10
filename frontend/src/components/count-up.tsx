"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Counts a key figure up from its previous value (zero at first). The text is written
 * straight to the DOM, so there is no re-render per frame; under
 * prefers-reduced-motion it jumps to the end.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number | null;
  format: (n: number) => string;
  className?: string;
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
      el.textContent = "–";
      return;
    }
    const start = from.current;
    from.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || start === value) {
      el.textContent = fmt.current(value);
      return;
    }
    el.textContent = fmt.current(start);
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt.current(p < 1 ? start + (value - start) * eased : value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = fmt.current(value);
    };
  }, [value]);

  return <span ref={ref} className={className} />;
}
