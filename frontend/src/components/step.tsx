import { cn } from "cn";
import type { ReactNode } from "react";

export type StepStatus = "todo" | "active" | "done";

/** One step of a real sequence (launch, then seed, then treasury). */
export function Step({
  n,
  title,
  status,
  summary,
  children,
}: {
  n: number;
  title: string;
  status: StepStatus;
  summary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className={cn("grid grid-cols-[3rem_1fr] gap-4 border-t border-ink py-8 sm:grid-cols-[4.5rem_1fr]")}>
      <span
        className={cn(
          "type-display flex size-12 items-center justify-center border border-ink text-2xl sm:size-16 sm:text-3xl",
          status === "done" && "bg-ink text-paper",
          status === "todo" && "border-dashed text-graphite",
        )}
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0">
        <h2 className={cn("type-wide text-2xl", status === "todo" && "text-graphite")}>
          {title}
          <span className="sr-only">
            {status === "done" ? " (done)" : status === "active" ? " (current step)" : " (not yet)"}
          </span>
        </h2>
        {summary && <div className="mt-1 text-sm text-graphite">{summary}</div>}
        {status === "active" && children && <div className="mt-6">{children}</div>}
      </div>
    </li>
  );
}
