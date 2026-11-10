import { cn } from "cn";

/**
 * Solidon's mark: a gold coin whose smile is a rising chart line (a meme with a balance
 * sheet). Flat, with a soft rim; the wordmark is set in Bricolage Grotesque (the only place it is used).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="solidon-coin" x1="6" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD23F" />
          <stop offset="1" stopColor="#F2A900" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#solidon-coin)" />
      <circle cx="16" cy="16" r="12.25" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
      <circle cx="11.6" cy="12.6" r="1.6" fill="#0B1020" />
      <circle cx="20.4" cy="12.6" r="1.6" fill="#0B1020" />
      <path
        d="M9.5 19.6l4.1 2.6 3.6-3.1 5.3-1.9"
        fill="none"
        stroke="#0B1020"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-brand text-[1.3125rem] leading-none font-[650] tracking-[-0.04em]">solidon</span>
      {suffix && (
        <span className="rounded-md bg-page-deep px-1.5 py-0.5 text-xs text-soft">{suffix}</span>
      )}
    </span>
  );
}
