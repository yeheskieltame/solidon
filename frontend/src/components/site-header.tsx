import Link from "next/link";
import { FACTORY, NETWORK } from "@/lib/config";
import { WalletControls } from "./wallet-controls";

export function SiteHeader() {
  return (
    <header className="border-b border-ink">
      {NETWORK === "testnet" && (
        <p className="bg-ink px-4 py-1.5 text-center text-xs text-paper">
          NEAR testnet. Synthetic stocks and test USDC with no value. Factory {FACTORY}.
        </p>
      )}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex items-baseline gap-6">
          <Link href="/" className="type-display text-2xl">
            Solidon
          </Link>
          <nav aria-label="Main" className="flex gap-4 text-sm">
            <Link href="/" className="underline-offset-4 hover:underline">
              Launchpad
            </Link>
            <Link href="/launch" className="underline-offset-4 hover:underline">
              Launch a meme
            </Link>
          </nav>
        </div>
        <WalletControls />
      </div>
    </header>
  );
}
