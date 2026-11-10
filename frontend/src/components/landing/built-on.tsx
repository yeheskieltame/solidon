import { LogoTile } from "@/components/brand-logo";
import { Reveal, RevealItem } from "@/components/reveal";
import { CHAIN_LOGOS, PLATFORM_LOGOS, type BrandLogo } from "@/lib/brands";

/** What each piece of infrastructure does for a meme, in the order money meets it. */
const STACK: { logo: BrandLogo; name: string; role: string }[] = [
  { logo: CHAIN_LOGOS.near, name: "NEAR", role: "Meme contracts, pools and ledgers" },
  { logo: PLATFORM_LOGOS.chainSignatures, name: "NEAR Chain Signatures", role: "Signs each treasury swap" },
  { logo: PLATFORM_LOGOS.intents, name: "NEAR Intents", role: "Moves cash between chains (mainnet)" },
  { logo: PLATFORM_LOGOS.usdc, name: "Circle USDC", role: "Fees, cash buffer, settlement" },
  { logo: CHAIN_LOGOS.base, name: "Base", role: "Treasury chain" },
  { logo: CHAIN_LOGOS.robinhood, name: "Robinhood Chain", role: "Treasury chain" },
  { logo: CHAIN_LOGOS.solana, name: "Solana", role: "Treasury chain" },
  { logo: PLATFORM_LOGOS.uniswap, name: "Uniswap", role: "Stock swaps on Base and Robinhood" },
  { logo: PLATFORM_LOGOS.raydium, name: "Raydium", role: "Stock swaps on Solana" },
  { logo: PLATFORM_LOGOS.chainlink, name: "Chainlink", role: "Mainnet price source candidate" },
];

export function BuiltOn() {
  return (
    <section aria-labelledby="built-title" className="wrap py-20 sm:py-24">
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem] lg:items-end">
        <h2 id="built-title" className="type-h2 max-w-[18ch]">
          Built on rails you already trust.
        </h2>
        <p className="lede">No bridge of our own, no custody.</p>
      </div>
      <Reveal className="mt-12 grid grid-cols-1 gap-x-12 sm:grid-cols-2 lg:grid-cols-3" stagger={0.03}>
        {STACK.map((s) => (
          <RevealItem key={s.name} className="group flex items-center gap-4 border-b border-line py-4">
            <LogoTile logo={s.logo} size={36} decorative className="transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110" />
            <div className="min-w-0">
              <p className="text-[0.9375rem]">{s.name}</p>
              <p className="text-[0.8125rem] text-soft">{s.role}</p>
            </div>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}
