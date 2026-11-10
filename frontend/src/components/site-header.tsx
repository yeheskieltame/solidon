import Link from "next/link";
import { FACTORY, NETWORK } from "@/lib/config";
import { Logo } from "./logo";
import { WalletControls } from "./wallet-controls";

export function SiteHeader() {
  return (
    <>
      {NETWORK === "testnet" && (
        <p className="on-ink px-4 py-1.5 text-center text-[0.8125rem] font-bold">
          NEAR testnet: synthetic stocks and test USDC with no value.{" "}
          <span className="hidden text-white/70 sm:inline">Factory {FACTORY}.</span>
        </p>
      )}
      <header className="sticky top-0 z-30 border-b-2 border-line bg-page/85 backdrop-blur-md">
        <div className="wrap flex min-h-[var(--header-h)] flex-wrap items-center justify-between gap-x-2 gap-y-2 py-2.5 sm:gap-x-4">
          <div className="flex items-center gap-1 sm:gap-6">
            <Link href="/" aria-label="Solidon home" className="wiggle rounded-xl">
              <Logo />
            </Link>
            <nav aria-label="Main" className="flex items-center text-[0.9375rem] font-extrabold">
              <Link href="/#memes" className="hidden rounded-xl px-3 py-2 hover:bg-white sm:block">
                Memes
              </Link>
              <Link href="/#how" className="hidden rounded-xl px-3 py-2 hover:bg-white md:block">
                How it works
              </Link>
              <Link href="/launch" className="rounded-xl px-2 py-2 hover:bg-white sm:px-3">
                Launch
              </Link>
            </nav>
          </div>
          <WalletControls />
        </div>
      </header>
    </>
  );
}
