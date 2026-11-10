import { ChainLogo, LogoTile, StockLogo } from "@/components/brand-logo";
import { Reveal, RevealItem } from "@/components/reveal";
import { CHAIN_LOGOS, PLATFORM_LOGOS } from "@/lib/brands";

const STEPS = [
  {
    title: "Launch a meme",
    body: "Pick a name, a ticker and the stock it believes in. The factory deploys it as its own contract with every rule locked: no owner, no setter.",
  },
  {
    title: "People trade it",
    body: "Each buy and sell pays a 1% fee: 0.8% to the meme's treasury, 0.2% to its creator. Hype fills the balance sheet.",
  },
  {
    title: "The treasury buys real stock",
    body: "The contract sends USDC to its own addresses on Base, Robinhood Chain and Solana and swaps it into the stock. NEAR Chain Signatures signs every swap; nobody holds a key.",
  },
  {
    title: "mNAV runs the rules",
    body: "Once an hour anyone can call rebalance. It compares price with NAV per token and issues, buys back or opens redemption, by fixed thresholds.",
  },
];

const VENUES = [
  { chain: "base", net: "Base Sepolia", venue: PLATFORM_LOGOS.uniswap, venueName: "Uniswap v3" },
  { chain: "robinhood", net: "Robinhood Chain", venue: PLATFORM_LOGOS.uniswap, venueName: "Uniswap v3" },
  { chain: "solana", net: "Solana devnet", venue: PLATFORM_LOGOS.raydium, venueName: "Raydium CLMM" },
];

/** The four steps beside a diagram of where the money goes. */
export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div>
          <h2 id="how-title" className="type-h2 max-w-[16ch]">
            From a joke to a treasury company in four steps.
          </h2>
          <Reveal className="mt-10 grid gap-1" stagger={0.08}>
            {STEPS.map((s, i) => (
              <RevealItem key={s.title}>
                <div className="group grid grid-cols-[2.25rem_1fr] gap-4 rounded-2xl p-3 transition-colors hover:bg-card">
                  <span
                    className="flex size-9 items-center justify-center rounded-full border border-line bg-card text-sm font-semibold tabular-nums shadow-[var(--shadow-xs)] transition-[background-color,color,transform] duration-300 group-hover:scale-110 group-hover:bg-ink group-hover:text-white"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="type-h3">
                      <span className="sr-only">Step {i + 1}: </span>
                      {s.title}
                    </h3>
                    <p className="mt-1 text-[0.9375rem] text-soft">{s.body}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </Reveal>
        </div>

        <Reveal className="lg:pt-4" stagger={0.12}>
          <figure className="card relative overflow-hidden p-5 sm:p-7" aria-labelledby="flow-caption">
            <div className="halftone absolute inset-0 opacity-60" aria-hidden />
            <div className="relative">
              <RevealItem>
                <div className="mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-[var(--shadow-sm)]">
                  <LogoTile logo={CHAIN_LOGOS.near} size={40} decorative />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Meme contract on NEAR</p>
                    <p className="text-xs text-soft">Pool, ledger, mNAV rules. 1% fee in USDC</p>
                  </div>
                </div>
              </RevealItem>
              <Flow />
              <RevealItem>
                <div className="mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-ink bg-ink p-3 text-white shadow-[var(--shadow-md)]">
                  <LogoTile logo={PLATFORM_LOGOS.chainSignatures} size={40} decorative className="!ring-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">NEAR Chain Signatures</p>
                    <p className="text-xs text-white/70">The MPC network signs for the meme&apos;s own addresses</p>
                  </div>
                </div>
              </RevealItem>
              <Flow branches />
              <RevealItem>
                <ul className="grid grid-cols-3 gap-2 sm:gap-3">
                  {VENUES.map((v) => (
                    <li key={v.chain} className="rounded-2xl border border-line bg-card p-2.5 text-center shadow-[var(--shadow-sm)] sm:p-3.5">
                      <ChainLogo chain={v.chain} size={36} decorative className="mx-auto" />
                      <p className="mt-2 text-[0.8125rem] leading-tight font-medium">{v.net}</p>
                      <p className="mt-2 flex items-center justify-center gap-1 text-[0.6875rem] text-soft sm:text-xs">
                        <LogoTile logo={v.venue} size={16} decorative />
                        <span className="max-sm:sr-only">{v.venueName}</span>
                      </p>
                      <p className="mt-2 flex items-center justify-center gap-1 border-t border-line pt-2 text-xs font-medium">
                        <StockLogo ticker="NVDA" size={16} decorative />
                        NVDA
                      </p>
                    </li>
                  ))}
                </ul>
              </RevealItem>
            </div>
            <figcaption id="flow-caption" className="relative mt-5 text-center text-[0.8125rem] text-soft">
              Fees become USDC cash, cash becomes stock on three chains. The ledger books the minimum
              output of every swap, so it never claims more than the chain holds.
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

/** Dashed connectors whose dashes travel downward: the money moving. */
function Flow({ branches = false }: { branches?: boolean }) {
  return (
    <svg viewBox="0 0 300 44" className="mx-auto block h-11 w-full max-w-md" aria-hidden preserveAspectRatio="none">
      {branches ? (
        <>
          <path d="M150 0 V14 Q150 22 142 22 H58 Q50 22 50 30 V44" className="flow-line" />
          <path d="M150 0 V44" className="flow-line" />
          <path d="M150 0 V14 Q150 22 158 22 H242 Q250 22 250 30 V44" className="flow-line" />
        </>
      ) : (
        <path d="M150 0 V44" className="flow-line" />
      )}
    </svg>
  );
}
