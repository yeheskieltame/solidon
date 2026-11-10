import { cn } from "cn";
import type { ReactNode } from "react";
import { Sticker, type StickerName } from "./sticker";

/**
 * Empty, error and info states: a sticker, what happened in plain words, and one
 * clear action. Errors are announced (role="alert") and tinted red.
 */
export function Notice({
  title,
  children,
  tone = "quiet",
  action,
  sticker,
  className,
}: {
  title: string;
  children?: ReactNode;
  tone?: "quiet" | "error";
  action?: ReactNode;
  /** Shown beside the copy; omit for compact inline notices. */
  sticker?: StickerName;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-4 rounded-3xl border-2 p-5 sm:flex-row sm:items-center",
        tone === "error" ? "border-red bg-red-wash" : "border-dashed border-line-strong bg-white/70",
        className,
      )}
    >
      {sticker && <Sticker name={sticker} className="w-28 shrink-0 -rotate-6 sm:w-32" />}
      <div className="min-w-0 flex-1">
        <p className="type-h3">{title}</p>
        {children && <div className="mt-1.5 text-[0.9375rem] break-words text-soft">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
