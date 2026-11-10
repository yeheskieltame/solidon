"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";

/**
 * Morpho's horizontal section nav: plain items, the one in view in blue. Sticky under the
 * app header with a blurred backdrop; clicking scrolls to the section.
 */
export function SectionNav({ items, className }: { items: { id: string; label: string; className?: string }[]; className?: string }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const onScroll = () => {
      const line = window.innerHeight * 0.32;
      let current = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = els[els.length - 1].id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  return (
    <nav aria-label="On this page" className={cn("subnav", className)}>
      <div className="flex gap-7 overflow-x-auto [scrollbar-width:none]">
        {items.map((i) => (
          <a key={i.id} href={`#${i.id}`} aria-current={active === i.id ? "true" : undefined} className={i.className}>
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
