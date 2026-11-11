import Image from "next/image";
import { cn } from "cn";

/**
 * Solidon's mark: a smug capybara CFO bursting out of a gold coin (a meme with a balance
 * sheet). Raster art in public/brand; the wordmark is set in Bricolage Grotesque.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image src="/brand/solidon-512.png" alt="" width={512} height={512} className={cn("size-8", className)} aria-hidden />
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
