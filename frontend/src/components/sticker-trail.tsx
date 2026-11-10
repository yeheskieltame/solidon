"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "cn";
import { STICKERS } from "./sticker";

const SOURCES = Object.values(STICKERS).map((s) => s.src);

/**
 * Drops a small sticker under the cursor every ~90 ms, after the MotionSites
 * "Mouse Trail CTA" prompt. Each one is a plain DOM node with a 1.1 s CSS keyframe that
 * removes itself on `animationend`, so React never re-renders while the mouse moves.
 * Mouse only, and off under prefers-reduced-motion.
 */
export function StickerTrail({ children, className }: { children: ReactNode; className?: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const turn = useRef(0);

  function move(e: PointerEvent<HTMLDivElement>) {
    const box = layer.current;
    if (!box || e.pointerType !== "mouse") return;
    const now = performance.now();
    if (now - last.current < 90) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    last.current = now;
    const r = box.getBoundingClientRect();
    const img = document.createElement("img");
    img.src = SOURCES[turn.current++ % SOURCES.length];
    img.alt = "";
    img.className = "trail-item";
    img.style.left = `${e.clientX - r.left}px`;
    img.style.top = `${e.clientY - r.top}px`;
    img.style.setProperty("--r", `${((Math.random() - 0.5) * 24).toFixed(1)}deg`);
    img.addEventListener("animationend", () => img.remove(), { once: true });
    box.appendChild(img);
  }

  return (
    <div className={cn("relative", className)} onPointerMove={move}>
      <div ref={layer} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      <div className="relative">{children}</div>
    </div>
  );
}
