import Link from "next/link";
import { BadgeCheck, Radio } from "lucide-react";
import type { CSSProperties } from "react";
import { Faq } from "@/components/faq";
import { MascotCta } from "@/components/mascot-cta";
import { MemeList } from "@/components/meme-list";
import { RulesPlayground } from "@/components/rules-playground";
import { Sticker, type StickerName } from "@/components/sticker";
import { StickerHorizon } from "@/components/sticker-horizon";
import { TickerTape } from "@/components/ticker-tape";
import { buttonVariants } from "@/components/ui/button";

const STEPS: {
  title: string;
  body: string;
  more: string;
  sticker: StickerName;
  tint: string;
  tilt: string;
}[] = [
  {
    title: "Launch a meme",
    body: "Pick a name, a ticker and the stock it believes in.",
    more: "The factory deploys it as its own contract with every rule locked. No owner, no setter.",
    sticker: "rocket",
    tint: "var(--golden-wash)",
    tilt: "-5deg",
  },
  {
    title: "People trade it",
    body: "Every buy and sell pays a 1% fee into the meme's treasury.",
    more: "0.8% goes to the treasury, 0.2% to the creator. Hype literally fills the balance sheet.",
    sticker: "control",
    tint: "var(--blue-wash)",
    tilt: "4deg",
  },
  {
    title: "The treasury buys stock",
    body: "The contract swaps USDC into its stock on Base, Robinhood Chain and Solana.",
    more: "It signs each swap itself through NEAR Chain Signatures. Nobody holds a key.",
    sticker: "lander",
    tint: "var(--green-wash)",
    tilt: "-3deg",
  },
  {
    title: "The rules drive themselves",
    body: "Once an hour anyone can poke the contract. It reads one number, mNAV, and acts.",
    more: "Too hot: issue and buy more stock. Too cold: buy back, or let holders redeem at NAV.",
    sticker: "rover",
    tint: "var(--lilac-wash)",
    tilt: "5deg",
  },
];

/** Ledger vs on-chain after the end-to-end run in docs/DEPLOYMENTS.md (NVDA units). */
const PROOF_CHAINS: {
  name: string;
  net: string;
  ledger: number;
  onchain: number;
  proof: "mpc" | "relayer";
  swatch: string;
}[] = [
  { name: "Base", net: "Sepolia", ledger: 0.02965417, onchain: 0.03032966, proof: "mpc", swatch: "var(--chain-base)" },
  {
    name: "Robinhood Chain",
    net: "testnet",
    ledger: 0.0106076,
    onchain: 0.0108221,
    proof: "relayer",
    swatch: "var(--chain-hood)",
  },
  {
    name: "Solana",
    net: "devnet",
    ledger: 0.02770371,
    onchain: 0.02831835,
    proof: "relayer",
    swatch: "linear-gradient(135deg, var(--chain-sol-a), var(--chain-sol-b))",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero: value prop above, draggable sticker horizon below. */}
      <section className="stage bg-[radial-gradient(110%_70%_at_50%_0%,#fbfaff_0%,var(--page)_62%)]" aria-labelledby="hero-title">
        <div className="wrap pointer-events-none relative z-[2] flex flex-1 flex-col items-center justify-center pt-8 pb-4 text-center sm:pt-10">
          <h1 id="hero-title" className="type-display rise max-w-[16ch]" style={{ "--i": 0 } as CSSProperties}>
            Memes with a balance sheet.
          </h1>
          <p className="lede rise mt-5 max-w-[44rem]" style={{ "--i": 1 } as CSSProperties}>
            Every meme on Solidon is a tiny treasury company. It holds a tokenized stock like NVDA
            or TSLA on three chains, and its money rules are locked in code.
          </p>
          <div className="rise pointer-events-auto mt-7 flex flex-wrap justify-center gap-3" style={{ "--i": 2 } as CSSProperties}>
            <Link href="/launch" className={buttonVariants({ size: "lg" })}>
              Launch a meme
            </Link>
            <a href="#memes" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See live memes
            </a>
          </div>
          <p className="rise mt-5 hidden text-sm font-bold text-soft sm:block" style={{ "--i": 3 } as CSSProperties}>
            Psst: the stickers are draggable.
          </p>
        </div>
        <div className="stage-room" />
        <StickerHorizon />
      </section>

      <TickerTape />

      {/* How it works: a real sequence, so the steps are numbered. */}
      <section id="how" aria-labelledby="how-title" className="wrap pt-20 sm:pt-28">
        <h2 id="how-title" className="type-h2 max-w-[18ch]">
          From joke to treasury company in four moves.
        </h2>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step-card" style={{ "--tint": s.tint, "--tilt": s.tilt } as CSSProperties}>
              <Sticker name={s.sticker} className="step-art !h-44 !w-auto max-w-[90%] object-contain" />
              <div className="step-body">
                <span className="flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-white font-heading text-lg font-black" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="type-h3 mt-3">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-1.5 text-[0.9375rem] font-semibold text-soft">{s.body}</p>
                <div className="step-more">
                  <p className="mt-3 rounded-xl border-2 border-ink bg-white p-3 text-sm font-bold">{s.more}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* The rules, playable. */}
      <section aria-labelledby="rules-title" className="wrap pt-20 sm:pt-28">
        <div className="grid items-end gap-4 lg:grid-cols-[1fr_24rem]">
          <h2 id="rules-title" className="type-h2 max-w-[17ch]">
            One number runs the whole company.
          </h2>
          <p className="lede">
            Drag the price and watch which rule wakes up. The thresholds are the real ones, locked
            in every meme.
          </p>
        </div>
        <div className="mt-8">
          <RulesPlayground />
        </div>
        <p className="mt-4 max-w-[70ch] text-sm font-semibold text-soft">
          The floor defends NAV, not the price: if the stock falls, NAV falls with it. The price
          used is a 30-minute average, and every action pauses when the oracle is older than 15
          minutes.
        </p>
      </section>

      <MemeList />

      {/* Proof, not promises. */}
      <section aria-labelledby="proof-title" className="on-ink mt-20 sm:mt-28">
        <div className="wrap py-16 sm:py-24">
          <div className="grid items-end gap-4 lg:grid-cols-[1fr_26rem]">
            <h2 id="proof-title" className="type-h2">
              Proof, not promises.
            </h2>
            <p className="text-lg font-semibold text-white/75">
              Each meme owns addresses on three chains that only its contract can sign for. The
              ledger it keeps is always the cautious number, and you can check the chain yourself.
            </p>
          </div>
          <ul className="mt-10 grid gap-5 lg:grid-cols-3">
            {PROOF_CHAINS.map((c) => {
              const max = Math.max(c.ledger, c.onchain);
              return (
                <li key={c.name} className="rounded-3xl bg-white p-5 text-ink">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2.5">
                      <span className="size-7 shrink-0 rounded-lg border-2 border-ink" style={{ background: c.swatch }} aria-hidden />
                      <span className="type-h3">{c.name}</span>
                      <span className="text-sm font-bold text-soft">{c.net}</span>
                    </p>
                  </div>
                  <span className={c.proof === "mpc" ? "pill pill-green mt-3" : "pill pill-orange mt-3"}>
                    {c.proof === "mpc" ? <BadgeCheck className="size-4" aria-hidden /> : <Radio className="size-4" aria-hidden />}
                    {c.proof === "mpc" ? "MPC-proven" : "Relayer-reported"}
                  </span>
                  <dl className="mt-4 grid gap-2.5 text-sm">
                    {(
                      [
                        ["Ledger", c.ledger, "var(--blue)"],
                        ["On-chain", c.onchain, "var(--green)"],
                      ] as const
                    ).map(([k, v, color]) => (
                      <div key={k}>
                        <div className="flex justify-between font-extrabold">
                          <dt>{k}</dt>
                          <dd>{v.toFixed(8)} NVDA</dd>
                        </div>
                        <div className="bar mt-1 !h-3.5" aria-hidden>
                          <div className="bar-fill" style={{ width: `${(v / max) * 100}%`, background: color }} />
                        </div>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-extrabold text-green-ink">
                    <BadgeCheck className="size-4" aria-hidden />
                    The chain holds a bit more than the ledger claims
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-sm font-semibold text-white/70">
            Real balances from the test meme{" "}
            <Link href="/meme/e2etest.solidon.testnet" className="font-extrabold text-golden underline underline-offset-4">
              e2etest.solidon.testnet
            </Link>
            , which holds NVDA on all three chains. Open it to read them live.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="wrap grid gap-10 py-20 sm:py-28 lg:grid-cols-[20rem_1fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="faq-title" className="type-h2">
            Fair questions.
          </h2>
          <p className="lede mt-4">The short, honest answers. The long ones live in the spec.</p>
          <Sticker name="saturn" className="mt-6 hidden w-56 rotate-3 lg:block" />
        </div>
        <Faq />
      </section>

      <MascotCta />
    </>
  );
}
