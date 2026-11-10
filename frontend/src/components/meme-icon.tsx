import { cn } from "cn";

/** Soft two-stop gradients for memes without an icon, picked from the symbol. */
const TINTS = [
  ["#FFE08A", "#F5B700"],
  ["#C9D4FF", "#5C7CFF"],
  ["#BDF0D8", "#12A46B"],
  ["#FFD2B3", "#F08A24"],
  ["#DCD2FF", "#7457E8"],
  ["#FFC9D6", "#E5487A"],
];

/** The meme's on-chain icon (a data URL from `ft_metadata`), or a gradient monogram of its symbol. */
export function MemeIcon({
  icon,
  symbol,
  size = 40,
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
  const [a, b] = TINTS[hash % TINTS.length];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden ring-1 ring-white/10 ring-inset", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: safe ? "#fff" : `linear-gradient(140deg, ${a}, ${b})`,
      }}
    >
      {safe ? (
        // eslint-disable-next-line @next/next/no-img-element -- on-chain data URL
        <img src={safe} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        <span className="font-semibold tracking-tight text-[#0b1020]" style={{ fontSize: size * 0.36 }} aria-hidden>
          {symbol.slice(0, 2)}
        </span>
      )}
    </span>
  );
}
