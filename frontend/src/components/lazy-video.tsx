"use client";

import { useEffect, useRef } from "react";

/** A muted looping background clip that loads and plays only while it is on screen. */
export function LazyVideo({ src, poster, className }: { src: string; poster?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (!video.src) video.src = src;
            void video.play().catch(() => {
              // Autoplay blocked: the poster stays.
            });
          } else {
            video.pause();
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [src]);

  return <video ref={ref} muted loop playsInline preload="none" poster={poster} aria-hidden tabIndex={-1} className={className} />;
}
