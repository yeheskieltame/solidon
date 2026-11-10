"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "cn";
import { THEME_KEY, type Theme } from "@/lib/theme";

function read(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

/** The theme on <html>; null while server rendering. */
export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

function setTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
}

/** Sun / moon button. CSS picks the icon from html[data-theme], so it is right before hydration. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === "light" ? "dark" : "light";
  const label = theme ? `Switch to ${next} theme` : "Switch theme";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-page-deep hover:text-ink",
        className,
      )}
    >
      <Sun className="theme-icon-sun size-[1.125rem]" strokeWidth={1.75} aria-hidden />
      <Moon className="theme-icon-moon size-[1.125rem]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
