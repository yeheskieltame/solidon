"use client";

import { ChartNoAxesColumn, LayoutDashboard, Rocket, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { Logo } from "@/components/logo";
import { ConnectModal } from "@/components/connect-modal";
import { GasBanner } from "@/components/gas-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletControls } from "@/components/wallet-controls";
import { AppLink, useAppPath } from "@/lib/app-link";
import { FACTORY, NETWORK } from "@/lib/config";
import { SITE_URL } from "@/lib/site";

const TABS: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/", label: "Markets", icon: ChartNoAxesColumn, match: (p) => p === "/" || p.startsWith("/meme") },
  { href: "/launch", label: "Launch", icon: Rocket, match: (p) => p.startsWith("/launch") },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p) => p.startsWith("/dashboard") },
];

/** Desktop tabs; `path` is null in the prerendered shell, before the route is known. */
function DesktopTabs({ path }: { path: string | null }) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label="App" className="hidden items-center gap-1 md:flex">
      {TABS.map((t) => {
        const on = path !== null && t.match(path);
        return (
          <AppLink
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("relative rounded-[10px] px-4 py-2.5 text-[0.9375rem] transition-colors", on ? "text-ink" : "text-ink-2 hover:text-ink")}
          >
            {on && (
              <motion.span
                layoutId="app-tab"
                className="absolute inset-0 rounded-[10px] bg-page-deep"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                aria-hidden
              />
            )}
            <span className="relative">{t.label}</span>
          </AppLink>
        );
      })}
    </nav>
  );
}

/** Compact tab bar for phones. */
function MobileTabs({ path }: { path: string | null }) {
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-page/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="grid grid-cols-3">
        {TABS.map((t) => {
          const on = path !== null && t.match(path);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <AppLink
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[0.6875rem]", on ? "text-blue-ink" : "text-soft")}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-page-deep")}>
                  <Icon className="size-[1.125rem]" strokeWidth={on ? 2.25 : 1.75} aria-hidden />
                </span>
                {t.label}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function LiveDesktopTabs() {
  return <DesktopTabs path={useAppPath()} />;
}

function LiveMobileTabs() {
  return <MobileTabs path={useAppPath()} />;
}

/** App chrome: logo, the three tabs (a sliding pill marks the active one), theme toggle, wallet. */
export function AppHeader() {
  return (
    <>
      {NETWORK === "testnet" && (
        <p className="px-4 pt-2 text-center text-xs text-faint">
          NEAR testnet: synthetic stocks and test USDC with no value.
          <span className="hidden sm:inline"> Factory {FACTORY}.</span>
        </p>
      )}
      <header className="sticky top-0 z-40 bg-page/90 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-[var(--header-h)] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <AppLink href="/" aria-label="Solidon app, Markets" className="rounded-lg">
              <Logo suffix="app" />
            </AppLink>
            <Suspense fallback={<DesktopTabs path={null} />}>
              <LiveDesktopTabs />
            </Suspense>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href={SITE_URL || "/"} className="hidden text-sm text-soft hover:text-ink lg:inline">
              About Solidon
            </Link>
            <ThemeToggle />
            <WalletControls />
          </div>
        </div>
      </header>
      <GasBanner />
      <ConnectModal />
      <Suspense fallback={<MobileTabs path={null} />}>
        <LiveMobileTabs />
      </Suspense>
    </>
  );
}
