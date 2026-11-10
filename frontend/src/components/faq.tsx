"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";

const ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: "What is mNAV, in one breath?",
    a: (
      <>
        The meme&apos;s market price divided by what its treasury is worth per token (NAV). At 1.0× you
        pay exactly what the treasury holds. At 2.0× you pay double. The contract reads that one
        number and follows fixed rules, once an hour, triggered by anyone.
      </>
    ),
  },
  {
    q: "Is the floor a price guarantee?",
    a: (
      <>
        No. The floor defends NAV, not the price. Below 0.9× holders can burn tokens for NAV per
        token in USDC, and below 1.0× spare cash buys tokens back. But if the stock falls, NAV falls
        with it, and redemptions are paid from the cash buffer on NEAR.
      </>
    ),
  },
  {
    q: "Are these real stocks?",
    a: (
      <>
        Not on testnet. Testnets have no real stock tokens, so every venue on Base Sepolia,
        Robinhood Chain testnet and Solana devnet is a Solidon synthetic token in its own pool,
        priced by a mock oracle. Nothing here has value. The treasury flow is the real thing: the
        contract signs each swap through NEAR Chain Signatures.
      </>
    ),
  },
  {
    q: "Who holds the keys to the treasury?",
    a: (
      <>
        Nobody. Each meme derives its own addresses on Base, Robinhood Chain and Solana from the
        NEAR MPC network, and only the meme contract can ask for a signature. It signs two shapes
        per chain: an approval to a locked router and a swap from USDC into its stock. There is no
        admin key and no setter: read <code>get_params</code> on any meme.
      </>
    ),
  },
  {
    q: "What does “relayer-reported” mean?",
    a: (
      <>
        Cash arriving on Base is credited only after the MPC verifies the transfer log. The MPC
        cannot read Robinhood Chain or Solana yet, so a keeper reports arrivals there. Either way
        the ledger books the minimum output of every swap, so it never claims more stock than the
        chain shows.
      </>
    ),
  },
  {
    q: "Where does the 1% fee go?",
    a: (
      <>
        0.8% goes to the meme&apos;s treasury, which buys the stock. 0.2% goes to the creator. That is
        the whole business model: trading funds the balance sheet.
      </>
    ),
  },
  {
    q: "Who can use it?",
    a: (
      <>
        Anyone with a NEAR testnet wallet and free test USDC from the faucet button in the app. Tokenized
        stocks (Stock Tokens) are not offered to US persons.
      </>
    ),
  },
];

/** Single-open accordion, after the MotionSites "Rocket FAQ" prompt (height animated with grid rows). */
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <ul className="grid border-t border-line">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <li
            key={item.q}
            className={cn(
              "border-b border-line",
            )}
          >
            <h3>
              <button
                type="button"
                id={`${base}-q${i}`}
                aria-expanded={isOpen}
                aria-controls={`${base}-a${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left text-[1.0625rem] transition-colors hover:text-ink-2"
              >
                {item.q}
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-300",
                    isOpen ? "rotate-180 bg-blue text-white" : "bg-page-deep text-ink",
                  )}
                  aria-hidden
                >
                  <ChevronDown className="size-4" strokeWidth={2} />
                </span>
              </button>
            </h3>
            <div
              id={`${base}-a${i}`}
              role="region"
              aria-labelledby={`${base}-q${i}`}
              className="faq-panel"
              data-open={isOpen}
              inert={!isOpen}
            >
              <div>
                <p className="max-w-[65ch] pb-6 text-[0.9375rem] text-soft">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
