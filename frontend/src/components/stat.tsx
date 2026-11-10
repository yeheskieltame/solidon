import { cn } from "cn";
import type { ReactNode } from "react";
import { CountUp } from "./count-up";
import { Hint } from "./term";
import { splitFigure } from "@/lib/figure";

/**
 * An open stat, no box: a small muted label with an (i), a large light figure whose less
 * significant tail is dimmed, and one quiet line under it. Use inside a `<dl>`.
 */
export function Stat({
  label,
  hint,
  value,
  format,
  text,
  sub,
  title,
  size = "lg",
  className,
}: {
  label: ReactNode;
  /** Tooltip for the (i). */
  hint?: string;
  /** A number that counts up, formatted by `format`. */
  value?: number | null;
  format?: (n: number) => string;
  /** Or a ready string (no count-up). */
  text?: string;
  sub?: ReactNode;
  title?: string;
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="flex items-center gap-1.5 text-[0.9375rem] text-soft">
        {label}
        {hint && <Hint tip={hint} align="start" label={`About ${typeof label === "string" ? label : "this figure"}`} />}
      </dt>
      <dd className="stat-value mt-2.5" data-size={size} title={title}>
        {text !== undefined ? (
          splitFigure(text).map((p, i) => (
            <span key={i} className={p.dim ? "fig-dim" : undefined}>
              {p.text}
            </span>
          ))
        ) : (
          <CountUp value={value ?? null} format={format ?? String} split />
        )}
      </dd>
      {sub && <dd className="mt-2 text-[0.9375rem] text-ink-2">{sub}</dd>}
    </div>
  );
}

/** A row of open stats sized to their figures: generous gaps, no dividers. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-x-8 gap-y-9 sm:flex sm:flex-wrap sm:gap-x-14", className)}>{children}</dl>;
}
