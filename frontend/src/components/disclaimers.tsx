import Link from "next/link";
import { Logo } from "./logo";
import { GITHUB_URL, SITE_URL, appUrl } from "@/lib/site";

/** Risk statements from docs/SPEC.md "Trust assumptions & threat model". */
export const DISCLAIMERS = [
  {
    title: "A NAV floor, not a price guarantee",
    body: "Redemption and buyback defend NAV per token. If the stock falls, NAV falls with it.",
  },
  {
    title: "Synthetic stocks on testnet",
    body: "Every venue on Base Sepolia, Robinhood Chain testnet and Solana devnet is a Solidon synthetic token priced by a mock oracle. Nothing here has value.",
  },
  {
    title: "Relayer-reported cash",
    body: "The MPC proves cash arrivals on Base. On Robinhood Chain and Solana a relayer reports them; swaps are booked at their minimum output.",
  },
  {
    title: "Not for US persons",
    body: "Tokenized stocks (Stock Tokens) are not offered to US persons.",
  },
];

export const TRADEMARK_NOTE =
  "Company and network logos are trademarks of their owners; shown to identify the assets. Not affiliated.";

/** The footer: links, the four risk statements and the trademark note. `compact` for the app. */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const site = SITE_URL || "/";
  return (
    <footer className="border-t border-line bg-card">
      <div className={compact ? "wrap py-8" : "wrap py-12 sm:py-14"}>
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <div className="max-w-xs">
            <Link href={site} aria-label="Solidon home" className="inline-flex">
              <Logo />
            </Link>
            <p className="mt-3 text-sm text-soft">
              Memes with a balance sheet. Built on NEAR for the NEAR Hackathon 2026.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3">
            <Link href={appUrl("/")} className="text-soft hover:text-ink">
              Markets
            </Link>
            <Link href={appUrl("/launch")} className="text-soft hover:text-ink">
              Launch a meme
            </Link>
            <Link href={appUrl("/dashboard")} className="text-soft hover:text-ink">
              Dashboard
            </Link>
            <Link href={`${site === "/" ? "" : site}/#how`} className="text-soft hover:text-ink">
              How it works
            </Link>
            <Link href={`${site === "/" ? "" : site}/#faq`} className="text-soft hover:text-ink">
              FAQ
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-soft hover:text-ink">
              GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
        </div>
        <ul className="mt-10 grid gap-x-8 gap-y-5 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {DISCLAIMERS.map((d) => (
            <li key={d.title}>
              <p className="text-sm font-medium">{d.title}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-soft">{d.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-soft">
          <p>{TRADEMARK_NOTE}</p>
          <p>No admin key: every parameter is locked at launch and readable with get_params.</p>
        </div>
      </div>
    </footer>
  );
}
