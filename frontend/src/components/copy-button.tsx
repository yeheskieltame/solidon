"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useState } from "react";

/** Copies `value` to the clipboard; the icon turns into a tick for a moment. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={done ? "Copied" : `Copy ${label}`}
      title={done ? "Copied" : `Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          },
          () => undefined,
        );
      }}
    >
      {done ? <Check className="text-green-ink" aria-hidden /> : <Copy aria-hidden />}
    </button>
  );
}

/** The small external-link icon after an address. */
export function ExplorerLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="icon-btn" aria-label={`${label} (opens in a new tab)`} title={label}>
      <ArrowUpRight aria-hidden />
    </a>
  );
}
