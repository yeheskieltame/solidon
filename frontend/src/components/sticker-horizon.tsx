"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { cn } from "cn";
import { STICKERS, type StickerName } from "./sticker";

/**
 * The draggable sticker horizon from the MotionSites "Orbit Stickers" prompt:
 * same reference geometry (1280-unit collage scaled by --cu), same staged entrance
 * (back row, astronaut, front row), same grab behaviour (1.06 pop, deeper shadow,
 * 1:1 follow, stays where dropped). Adapted to a scrolling page: stickers keep
 * `touch-action: pan-y`, so a vertical swipe still scrolls.
 */
const LAYOUT: { name: StickerName; rot: number; l: number; t: number; w: number; h: number }[] = [
  { name: "rocket", rot: -7.5, l: -16.8, t: 304.4, w: 316.6, h: 317.2 },
  { name: "telescope", rot: -1, l: 210.4, t: 296.1, w: 369.2, h: 239.8 },
  { name: "rover", rot: 4.5, l: 685.2, t: 314.9, w: 386.6, h: 243.1 },
  { name: "colony", rot: 1, l: 1006, t: 296.5, w: 305, h: 253.1 },
  { name: "astronaut", rot: 8.5, l: 362.1, t: 250.6, w: 528.7, h: 609.7 },
  { name: "lander", rot: 1.5, l: 164.6, t: 489.4, w: 331.8, h: 221.2 },
  { name: "control", rot: 11.5, l: 600.2, t: 506, w: 365.6, h: 199.9 },
  { name: "saturn", rot: 1.5, l: 942.1, t: 511.2, w: 334.8, h: 179.6 },
];

export function StickerHorizon() {
  const collage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const drag = useRef<{
    el: HTMLElement;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    unit: number;
  } | null>(null);
  const zTop = useRef(10);

  // The board only becomes live once the entrance has resolved.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  function down(e: PointerEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".st");
    const box = collage.current;
    if (!ready || !el || !box || e.button) return;
    e.preventDefault();
    drag.current = {
      el,
      unit: box.getBoundingClientRect().width / 1280,
      ox: parseFloat(el.style.getPropertyValue("--ox")) || 0,
      oy: parseFloat(el.style.getPropertyValue("--oy")) || 0,
      sx: e.clientX,
      sy: e.clientY,
    };
    el.style.zIndex = String(++zTop.current);
    el.classList.add("held");
    el.setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.el.style.setProperty("--ox", String(d.ox + (e.clientX - d.sx) / d.unit));
    d.el.style.setProperty("--oy", String(d.oy + (e.clientY - d.sy) / d.unit));
  }

  function drop(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.el.classList.remove("held");
    try {
      d.el.releasePointerCapture(e.pointerId);
    } catch {
      // Capture was already released.
    }
    drag.current = null;
  }

  return (
    <div
      ref={collage}
      className={cn("collage", ready && "ready")}
      aria-hidden
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={drop}
      onPointerCancel={drop}
      onLostPointerCapture={drop}
    >
      {LAYOUT.map((s, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized static WebP, positioned by CSS units
        <img
          key={s.name}
          className="st"
          src={STICKERS[s.name].src}
          alt=""
          draggable={false}
          fetchPriority={s.name === "astronaut" ? "high" : "auto"}
          style={
            {
              "--rot": `${s.rot}deg`,
              "--seq": i,
              "--l": s.l,
              "--t": s.t,
              "--w": s.w,
              "--h": s.h,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
