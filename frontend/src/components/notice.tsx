import { cn } from "cn";
import { CircleAlert, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Empty, error and info states: an icon, what happened in plain words, and one clear
 * action. Errors are announced (role="alert") and tinted red.
 */
export function Notice({
  title,
  children,
  tone = "quiet",
  action,
  icon,
  className,
}: {
  title: string;
  children?: ReactNode;
  tone?: "quiet" | "error";
  action?: ReactNode;
  /** Shown beside the copy; defaults to an info or alert icon. */
  icon?: LucideIcon;
  className?: string;
}) {
  const Icon = icon ?? (tone === "error" ? CircleAlert : Info);
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-[18px] p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5",
        tone === "error" ? "bg-red-wash" : "bg-panel",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          tone === "error" ? "bg-page text-red-ink" : "bg-page-deep text-ink-2",
        )}
        aria-hidden
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-h3">{title}</p>
        {children && <div className="mt-0.5 text-sm break-words text-soft">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
