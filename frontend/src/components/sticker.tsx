import { cn } from "cn";

/** The eight die-cut space stickers (MotionSites "Orbit Stickers"), stored in /public/stickers. */
export const STICKERS = {
  rocket: { src: "/stickers/st-0.webp", w: 820, h: 821 },
  telescope: { src: "/stickers/st-1.webp", w: 940, h: 610 },
  rover: { src: "/stickers/st-2.webp", w: 990, h: 622 },
  colony: { src: "/stickers/st-3.webp", w: 790, h: 655 },
  astronaut: { src: "/stickers/st-4.webp", w: 1162, h: 1340 },
  lander: { src: "/stickers/st-5.webp", w: 860, h: 573 },
  control: { src: "/stickers/st-6.webp", w: 940, h: 514 },
  saturn: { src: "/stickers/st-7.webp", w: 870, h: 467 },
} as const;

export type StickerName = keyof typeof STICKERS;

/** A decorative sticker. Always aria-hidden: the copy next to it carries the meaning. */
export function Sticker({
  name,
  className,
  eager = false,
}: {
  name: StickerName;
  className?: string;
  eager?: boolean;
}) {
  const s = STICKERS[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized static WebP, no optimizer needed
    <img
      src={s.src}
      width={s.w}
      height={s.h}
      alt=""
      aria-hidden
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("h-auto select-none drop-shadow-[0_5px_8px_rgb(24_46_72/0.18)]", className)}
    />
  );
}
