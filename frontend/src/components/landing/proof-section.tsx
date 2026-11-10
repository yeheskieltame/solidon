import { ArrowUpRight, BadgeCheck, Radio } from "lucide-react";
import Link from "next/link";
import { ChainLogo, StockLogo } from "@/components/brand-logo";
import { Reveal, RevealItem } from "@/components/reveal";
import { buttonVariants } from "@/components/ui/button";
import { SHOWCASE_MEME, appUrl } from "@/lib/site";

/** Ledger vs on-chain after the end-to-end run in docs/DEPLOYMENTS.md (NVDA units), with one MPC-signed swap per chain. */
const CHAINS: {
  key: string;
  name: string;
  ledger: number;
  onchain: number;
  proof: "mpc" | "relayer";
  tx: string;
  txLabel: string;
}[] = [
  {
    key: "base",
    name: "Base Sepolia",
    ledger: 0.02965417,
    onchain: 0.03032966,
    proof: "mpc",
    tx: "https://sepolia.basescan.org/tx/0x77870bf3db1c60b097e23e259f7d502ccd4fb30ce4ea46775af8085319bab8ab",
    txLabel: "Uniswap 0x7787…b8ab",
  },
  {
    key: "robinhood",
    name: "Robinhood Chain testnet",
    ledger: 0.0106076,
    onchain: 0.0108221,
    proof: "relayer",
    tx: "https://explorer.testnet.chain.robinhood.com/tx/0x954e48bc42473ab47af750d15066ee57baff9e8d23de1fefff0d37deba1fe8c4",
    txLabel: "Uniswap 0x954e…e8c4",
  },
  {
    key: "solana",
    name: "Solana devnet",
    ledger: 0.02770371,
    onchain: 0.02831835,
    proof: "relayer",
    tx: "https://explorer.solana.com/tx/65dxp65EdGL1SoEqES9FXrvNwDWU6XacFAxgVEEXGnWp8oG15fPikkJwTbnxpcRNZtSA7CrYkGH2zvC8zDo5wukH?cluster=devnet",
    txLabel: "Raydium 65dx…wukH",
  },
];

const POINTS = [
  {
    title: "Signed by the contract",
    body: "Each meme derives its own addresses through NEAR Chain Signatures and can sign only two shapes: an approval to a locked router and a swap into its stock.",
  },
  {
    title: "Ledger never overstates",
    body: "The contract books the minimum output it signed for. The chain holds a little more, never less.",
  },
  {
    title: "Honest about trust",
    body: "Cash arriving on Base is MPC-proven. Robinhood Chain and Solana are relayer-reported until the MPC can read them.",
  },
];

/** "Proof, not promises": the test meme's ledger against each chain, as one table. */
export function ProofSection() {
  return (
    <section id="proof" aria-labelledby="proof-title" className="scroll-mt-16">
      <div className="wrap py-20 sm:py-28">
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_26rem]">
          <h2 id="proof-title" className="type-h2 max-w-[14ch]">
            Proof, not promises.
          </h2>
          <p className="lede">The test meme {SHOWCASE_MEME} holds NVDA on all three chains. Every swap links to an explorer.</p>
        </div>

        <Reveal className="panel mt-12 overflow-x-auto">
          <table className="table min-w-[44rem]">
            <caption className="sr-only">Ledger against on-chain NVDA per chain</caption>
            <thead>
              <tr>
                <th scope="col">Chain</th>
                <th scope="col">Proof</th>
                <th scope="col" className="num">
                  Ledger
                </th>
                <th scope="col" className="num">
                  On-chain
                </th>
                <th scope="col" className="num">
                  MPC-signed swap
                </th>
              </tr>
            </thead>
            <tbody>
              {CHAINS.map((c) => (
                <tr key={c.key} data-hover="true">
                  <td>
                    <span className="flex items-center gap-3">
                      <ChainLogo chain={c.key} size={26} decorative />
                      {c.name}
                    </span>
                  </td>
                  <td>
                    <span className={c.proof === "mpc" ? "pill pill-green" : "pill pill-orange"}>
                      {c.proof === "mpc" ? <BadgeCheck aria-hidden /> : <Radio aria-hidden />}
                      {c.proof === "mpc" ? "MPC-proven" : "Relayer-reported"}
                    </span>
                  </td>
                  <td className="num">
                    <span className="inline-flex items-center gap-1.5">
                      {c.ledger.toFixed(8)}
                      <StockLogo ticker="NVDA" size={16} decorative />
                    </span>
                  </td>
                  <td className="num">
                    <span className="inline-flex items-center gap-1.5 text-green-ink">
                      {c.onchain.toFixed(8)}
                      <BadgeCheck className="size-4" aria-label="covers the ledger" />
                    </span>
                  </td>
                  <td className="num">
                    <a href={c.tx} target="_blank" rel="noreferrer" className="num-link inline-flex items-center gap-1 text-sm">
                      {c.txLabel}
                      <ArrowUpRight className="size-3.5" aria-hidden />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>

        <Reveal className="mt-14 grid gap-8 sm:grid-cols-3" stagger={0.08}>
          {POINTS.map((p) => (
            <RevealItem key={p.title}>
              <h3 className="text-[1.0625rem]">{p.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-soft">{p.body}</p>
            </RevealItem>
          ))}
        </Reveal>

        <Link href={appUrl(`/meme/${SHOWCASE_MEME}`)} className={buttonVariants({ variant: "outline", className: "mt-12" })}>
          Read the balances live
        </Link>
      </div>
    </section>
  );
}
