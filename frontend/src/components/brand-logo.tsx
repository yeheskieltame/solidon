import { cn } from "cn";
import { chainLogo, stockLogo, type BrandLogo } from "@/lib/brands";

/**
 * A real logo in a round tile (like a token icon): same size for every brand, so a row of
 * stocks or chains reads as one set. `decorative` hides it from screen readers when the name
 * is printed next to it.
 */
export function LogoTile({
  logo,
  size = 28,
  decorative = false,
  className,
  rounded = "full",
}: {
  logo: BrandLogo;
  size?: number;
  decorative?: boolean;
  className?: string;
  rounded?: "md" | "full";
}) {
  const inner = Math.round(size * (logo.scale ?? 0.6));
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden ring-1 ring-[var(--logo-ring)] ring-inset",
        rounded === "full" ? "rounded-full" : "",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: logo.tile ?? "#fff",
        borderRadius: rounded === "full" ? undefined : Math.max(6, Math.round(size * 0.28)),
      }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : logo.name}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : logo.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG marks, no optimisation needed */}
      <img
        src={logo.src}
        alt=""
        width={inner}
        height={inner}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{ width: inner, height: inner, objectFit: "contain" }}
      />
    </span>
  );
}

/** The thesis stock's logo, or a neutral monogram tile when the ticker has no logo. */
export function StockLogo({
  ticker,
  size = 28,
  decorative,
  className,
}: {
  ticker: string | null | undefined;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const logo = stockLogo(ticker);
  if (logo) return <LogoTile logo={logo} size={size} decorative={decorative} className={className} />;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-page-deep font-semibold text-soft", className)}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      aria-hidden={decorative || undefined}
    >
      {(ticker ?? "?").slice(0, 2)}
    </span>
  );
}

export function ChainLogo({
  chain,
  size = 24,
  decorative,
  className,
}: {
  chain: string;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const logo = chainLogo(chain);
  if (!logo) return null;
  return <LogoTile logo={logo} size={size} decorative={decorative} className={className} />;
}

/** Overlapping chain marks; chains not in `active` are dimmed. */
export function ChainStack({
  chains,
  active,
  size = 22,
  className,
}: {
  chains: string[];
  active?: string[];
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      {chains.map((c, i) => {
        const on = !active || active.includes(c);
        return (
          <ChainLogo
            key={c}
            chain={c}
            size={size}
            className={cn("outline-2 outline-card", i > 0 && "-ml-1.5", !on && "opacity-30 grayscale")}
          />
        );
      })}
    </span>
  );
}
