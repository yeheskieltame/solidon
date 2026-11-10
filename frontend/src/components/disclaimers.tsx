import Link from "next/link";
import { Logo } from "./logo";

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

/** The site footer: compact, always-present disclaimers on the dark band. */
export function SiteFooter() {
  return (
    <footer className="on-ink">
      <div className="wrap py-10">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <Logo className="text-white" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-extrabold">
            <Link href="/#memes" className="hover:text-golden">
              Live memes
            </Link>
            <Link href="/launch" className="hover:text-golden">
              Launch a meme
            </Link>
            <Link href="/#how" className="hover:text-golden">
              How it works
            </Link>
            <a href="https://github.com/yeheskieltame/solidon" target="_blank" rel="noreferrer" className="hover:text-golden">
              GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
        </div>
        <ul className="mt-8 grid gap-x-8 gap-y-5 border-t-2 border-white/15 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {DISCLAIMERS.map((d) => (
            <li key={d.title}>
              <p className="text-sm font-extrabold">{d.title}</p>
              <p className="mt-1 text-sm text-white/70">{d.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-white/60">
          Solidon: memes with a balance sheet. Built for NEAR Hackathon 2026. No admin key: every
          parameter is locked at launch and readable with get_params.
        </p>
      </div>
    </footer>
  );
}
