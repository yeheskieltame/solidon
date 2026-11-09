import { cn } from "cn";
import type { ReactNode } from "react";

/** Empty, error and info states. Errors invert to solid black so they cannot be missed. */
export function Notice({
  title,
  children,
  tone = "quiet",
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  tone?: "quiet" | "error";
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 border p-5 sm:flex-row sm:items-start sm:justify-between",
        tone === "error" ? "border-ink bg-ink text-paper" : "border-dashed border-ink",
        className,
      )}
    >
      <div className="max-w-prose">
        <p className="font-semibold">{title}</p>
        {children && (
          <div className={cn("mt-1 text-sm", tone === "error" ? "opacity-85" : "text-graphite")}>
            {children}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
