import { ArrowUpRight, BadgeCheck, Radio } from "lucide-react";
import Link from "next/link";
import { ChainLogo, StockLogo } from "@/components/brand-logo";
import { Reveal, RevealItem } from "@/components/reveal";
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
    txLabel: "Uniswap swap 0x7787…b8ab",
  },
  {
    key: "robinhood",
    name: "Robinhood Chain testnet",
    ledger: 0.0106076,
    onchain: 0.0108221,
    proof: "relayer",
    tx: "https://explorer.testnet.chain.robinhood.com/tx/0x954e48bc42473ab47af750d15066ee57baff9e8d23de1fefff0d37deba1fe8c4",
    txLabel: "Uniswap swap 0x954e…e8c4",
  },
  {
    key: "solana",
    name: "Solana devnet",
    ledger: 0.02770371,
    onchain: 0.02831835,
    proof: "relayer",
    tx: "https://explorer.solana.com/tx/65dxp65EdGL1SoEqES9FXrvNwDWU6XacFAxgVEEXGnWp8oG15fPikkJwTbnxpcRNZtSA7CrYkGH2zvC8zDo5wukH?cluster=devnet",
    txLabel: "Raydium swap 65dx…wukH",
  },
];

const POINTS = [
  {
    title: "Signed by the contract",
    body: "Each meme derives its own addresses through NEAR Chain Signatures. Only its contract can request a signature, and only for two shapes: an approval to a locked router and a swap into its stock.",
  },
  {
    title: "Ledger never overstates",
    body: "The contract books the minimum output it signed for. The chain usually holds a little more, never less, so NAV is the cautious number.",
  },
  {
    title: "Honest about trust",
    body: "Cash arriving on Base is MPC-proven: the network verifies the transfer log. Robinhood Chain and Solana are relayer-reported until the MPC can read them.",
  },
];

/** "Proof, not promises": the one dark band on the page. */
export function ProofSection() {
  return (
    <section id="proof" aria-labelledby="proof-title" className="on-ink scroll-mt-16">
      <div className="wrap py-20 sm:py-28">
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_26rem]">
          <h2 id="proof-title" className="type-h2 max-w-[14ch]">
            Proof, not promises.
          </h2>
          <p className="text-[1.0625rem] text-white/70">
            Real balances from the test meme {SHOWCASE_MEME}, which holds NVDA on all three chains.
            Every number links to a block explorer.
          </p>
        </div>

        <Reveal className="mt-12 grid gap-4 lg:grid-cols-3" stagger={0.1}>
          {CHAINS.map((c) => {
            const max = Math.max(c.ledger, c.onchain);
            return (
              <RevealItem key={c.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-3">
                    <ChainLogo chain={c.key} size={36} decorative className="!ring-white/10" />
                    <span className="font-medium">{c.name}</span>
                  </p>
                  <span className={c.proof === "mpc" ? "pill pill-green" : "pill pill-orange"}>
                    {c.proof === "mpc" ? <BadgeCheck aria-hidden /> : <Radio aria-hidden />}
                    {c.proof === "mpc" ? "MPC-proven" : "Relayer-reported"}
                  </span>
                </div>
                <dl className="mt-6 grid gap-3 text-sm">
                  {(
                    [
                      ["Ledger", c.ledger, "#8ea2ff"],
                      ["On-chain", c.onchain, "#3ddc97"],
                    ] as const
                  ).map(([k, v, color]) => (
                    <div key={k}>
                      <div className="flex justify-between gap-2">
                        <dt className="text-white/65">{k}</dt>
                        <dd className="flex items-center gap-1.5 font-medium tabular-nums">
                          {v.toFixed(8)}
                          <StockLogo ticker="NVDA" size={14} decorative />
                        </dd>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
                        <div className="bar-fill" style={{ width: `${(v / max) * 100}%`, background: color }} />
                      </div>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 flex items-center gap-1.5 text-sm text-[#3ddc97]">
                  <BadgeCheck className="size-4" aria-hidden />
                  The chain holds more than the ledger claims
                </p>
                <a
                  href={c.tx}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-4 text-sm text-white/75 transition-colors hover:text-white"
                >
                  <span>MPC-signed {c.txLabel}</span>
                  <ArrowUpRight className="size-4 shrink-0" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </RevealItem>
            );
          })}
        </Reveal>

        <Reveal className="mt-14 grid gap-8 border-t border-white/10 pt-10 sm:grid-cols-3" stagger={0.08}>
          {POINTS.map((p) => (
            <RevealItem key={p.title}>
              <h3 className="font-medium">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{p.body}</p>
            </RevealItem>
          ))}
        </Reveal>

        <Link
          href={appUrl(`/meme/${SHOWCASE_MEME}`)}
          className="btn btn-white mt-12 !border-transparent"
        >
          Read the balances live
        </Link>
      </div>
    </section>
  );
}
