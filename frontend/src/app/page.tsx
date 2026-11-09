import Link from "next/link";
import { MemeList } from "@/components/meme-list";
import { MnavRuler } from "@/components/mnav-ruler";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

const RULES = [
  {
    when: "Below 0.9×",
    what: "Redemption opens",
    body: "Holders burn tokens and receive NAV per token in USDC from the cash buffer on NEAR.",
  },
  {
    when: "Below 1.0×",
    what: "Buyback and burn",
    body: "USDC cash above the 20% buffer buys tokens from the pool and burns them. Stock is never sold to fund it.",
  },
  {
    when: "1.0× to 2.0×",
    what: "No action",
    body: "The premium moves freely with hype and with the stock.",
  },
  {
    when: "Above 2.0×",
    what: "Accretive issuance",
    body: "New tokens are sold into the pool, at most 1% of supply a day and only above NAV, so every token ends up holding more stock.",
  },
];

export default function Home() {
  return (
    <>
      <section className="grid gap-12 pt-14 pb-4 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:pt-20">
        <div>
          <h1 className="type-display text-[clamp(3rem,9vw,6.5rem)]">
            Memes with a balance sheet.
          </h1>
          <p className="mt-8 max-w-[34rem] text-lg leading-relaxed">
            Launch a memecoin on NEAR that is also a treasury company. Every meme holds a
            tokenized stock on Base, Robinhood Chain and Solana through NEAR Chain Signatures, and
            its capital rules are locked in the contract. No admin key.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/launch" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
              Launch a meme
            </Link>
            <a
              href="#memes-heading"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
            >
              Browse memes
            </a>
          </div>
        </div>

        <div className="frame p-5 sm:p-6">
          <p className="type-wide text-lg">mNAV = pool price ÷ NAV per token</p>
          <p className="mt-2 text-sm text-graphite">
            NAV per token is the stock on every chain at the oracle price, plus USDC, divided by
            circulating supply. The contract acts on its mNAV once an hour, triggered by anyone.
          </p>
          <MnavRuler value={1.42} className="mt-6" label="Example mNAV" />
          <p className="mt-2 text-xs text-graphite">Example position at 1.42×.</p>
        </div>
      </section>

      <section aria-labelledby="rules-heading" className="mt-16">
        <h2 id="rules-heading" className="sr-only">
          Capital rules
        </h2>
        <ol className="grid border-t border-l border-ink sm:grid-cols-2 lg:grid-cols-4">
          {RULES.map((r) => (
            <li key={r.when} className="border-r border-b border-ink p-5">
              <p className="type-wide text-2xl">{r.when}</p>
              <p className="mt-3 font-semibold">{r.what}</p>
              <p className="mt-1 text-sm text-graphite">{r.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-graphite">
          The floor defends NAV, not the price: if the stock falls, NAV falls with it. Pool price
          for mNAV is a 30-minute TWAP; every action stops when the oracle is older than 15
          minutes.
        </p>
      </section>

      <MemeList />
    </>
  );
}
