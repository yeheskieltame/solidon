import Link from "next/link";
import { Logo } from "./logo";
import { GITHUB_URL, SITE_URL, appUrl } from "@/lib/site";

/** Risk statements from docs/SPEC.md "Trust assumptions & threat model", shown in full on /risks. */
export const DISCLAIMERS = [
  {
    title: "A NAV floor, not a price guarantee",
    body: "Redemption and buyback defend NAV per token. If the stock falls, NAV falls with it, and redemptions are paid only from the cash buffer on NEAR.",
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
    title: "Oracle and pauses",
    body: "Every mNAV action pauses while the oracle price is older than 15 minutes. Trading continues, so the pool price can move while the rules wait.",
  },
  {
    title: "Not for US persons",
    body: "Tokenized stocks (Stock Tokens) are not offered to US persons.",
  },
];

export const TRADEMARK_NOTE =
  "Company and network logos are trademarks of their owners, shown only to identify the assets. Solidon is not affiliated with them.";

/** One line of legal text; the full wording lives on /risks. */
export const LEGAL_LINE = "Testnet · synthetic stocks · not a price guarantee · not for US persons · logos are trademarks of their owners";

/** The risks page on the landing host (the app links back to it). */
export const RISKS_URL = `${SITE_URL}/risks`;

/** The minimal footer: brand, a few links, one legal line and a link to the full risks. */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const site = SITE_URL || "/";
  const links = [
    { href: appUrl("/"), label: "Markets" },
    { href: appUrl("/launch"), label: "Launch" },
    { href: `${SITE_URL}/#faq`, label: "FAQ" },
    { href: RISKS_URL, label: "Risks" },
  ];
  if (compact) {
    return (
      <footer className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-6 text-[0.8125rem] text-faint">
        <p>{LEGAL_LINE}</p>
        <Link href={RISKS_URL} className="text-soft hover:text-ink">
          Read the risks
        </Link>
      </footer>
    );
  }
  return (
    <footer className="wrap py-12">
      <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-6">
        <Link href={site} aria-label="Solidon home" className="inline-flex">
          <Logo />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-2 text-[0.9375rem]">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className="text-soft transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-soft transition-colors hover:text-ink">
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
      </div>
      <p className="mt-10 border-t border-line pt-6 text-[0.8125rem] text-faint">
        {LEGAL_LINE}.{" "}
        <Link href={RISKS_URL} className="text-soft underline-offset-4 hover:text-ink hover:underline">
          Risks
        </Link>
      </p>
    </footer>
  );
}
