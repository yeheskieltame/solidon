import { cn } from "cn";

/** The meme's on-chain icon (a data URL from `ft_metadata`), or its symbol as a monogram. */
export function MemeIcon({
  icon,
  symbol,
  size = 48,
  className,
}: {
  icon: string | null | undefined;
  symbol: string;
  size?: number;
  className?: string;
}) {
  const safe = icon && /^data:image\/(png|jpeg|webp|gif|svg\+xml);/.test(icon) ? icon : null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-ink bg-paper",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {safe ? (
        // eslint-disable-next-line @next/next/no-img-element -- on-chain data URL
        <img src={safe} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        <span className="type-wide" style={{ fontSize: size * 0.34 }} aria-hidden>
          {symbol.slice(0, 2)}
        </span>
      )}
    </span>
  );
}
