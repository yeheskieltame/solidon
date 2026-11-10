import { cn } from "cn";

const TINTS = ["#FFC800", "#58CC02", "#1CB0F6", "#FF9600", "#B9A7F5", "#FF8FB1"];

/** The meme's on-chain icon (a data URL from `ft_metadata`), or its symbol as a sticker monogram. */
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
  let hash = 0;
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 -rotate-3 items-center justify-center overflow-hidden border-2 border-ink shadow-[0_3px_0_var(--ink)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: safe ? "#fff" : TINTS[hash % TINTS.length],
      }}
    >
      {safe ? (
        // eslint-disable-next-line @next/next/no-img-element -- on-chain data URL
        <img src={safe} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        <span className="font-heading font-black tracking-tight" style={{ fontSize: size * 0.36 }} aria-hidden>
          {symbol.slice(0, 2)}
        </span>
      )}
    </span>
  );
}
