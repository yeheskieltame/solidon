import { cn } from "cn";

/**
 * Solidon's own mark: a golden coin whose smile is a rising chart line
 * (a meme with a balance sheet), next to the wordmark in Epilogue Black.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <circle cx="20" cy="22" r="16" fill="#D9A400" />
      <circle cx="20" cy="19" r="16" fill="#FFC800" stroke="#100F3E" strokeWidth="2.5" />
      <circle cx="14.5" cy="15" r="2.2" fill="#100F3E" />
      <circle cx="25.5" cy="15" r="2.2" fill="#100F3E" />
      <path
        d="M11.5 23.5l5 3.5 4.5-4 7.5-2.5"
        fill="none"
        stroke="#100F3E"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-heading text-[1.4rem] leading-none font-black tracking-[-0.04em] sm:text-[1.6rem]">solidon</span>
    </span>
  );
}
