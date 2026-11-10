"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL } from "@/lib/site";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#proof", label: "Proof" },
  { href: "#faq", label: "FAQ" },
];

/** Landing navigation: anchors, the theme toggle and one primary action, Open app. */
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300",
        scrolled || open
          ? "border-b border-line bg-page/85 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent",
      )}
    >
      <div className="wrap flex h-[var(--header-h)] items-center justify-between gap-4">
        <Link href="/" aria-label="Solidon home" className="rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-[0.9375rem] md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-[10px] px-3.5 py-2 text-ink-2 transition-colors hover:bg-page-deep hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href={APP_URL} className={buttonVariants({ size: "sm" })}>
            Open app
          </Link>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-full text-ink hover:bg-page-deep md:hidden"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" aria-label="Main" className="wrap grid gap-1 pb-4 md:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-base hover:bg-page-deep">
              {n.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
