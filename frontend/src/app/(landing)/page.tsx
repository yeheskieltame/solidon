import Link from "next/link";
import { Faq } from "@/components/faq";
import { BuiltOn } from "@/components/landing/built-on";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveStats } from "@/components/landing/live-stats";
import { ProofSection } from "@/components/landing/proof-section";
import { StockMarquee } from "@/components/landing/stock-marquee";
import { LogoMark } from "@/components/logo";
import { RulesPlayground } from "@/components/rules-playground";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL, GITHUB_URL, appUrl } from "@/lib/site";

export default function Landing() {
  return (
    <>
      <Hero />

      <section aria-labelledby="stocks-title" className="border-y border-line bg-card/60 py-10 sm:py-12">
        <div className="wrap mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="stocks-title" className="text-sm font-medium">
            Pick the stock your meme believes in
          </h2>
          <p className="text-sm text-soft">Eight listed, each tradable on all three treasury chains</p>
        </div>
        <StockMarquee />
      </section>

      <HowItWorks />

      <section id="rules" aria-labelledby="rules-title" className="scroll-mt-16 pb-20 sm:pb-28">
        <div className="wrap">
          <div className="grid gap-4 lg:grid-cols-[1fr_26rem] lg:items-end">
            <h2 id="rules-title" className="type-h2 max-w-[15ch]">
              One number runs the whole company.
            </h2>
            <p className="lede">
              mNAV compares the meme&apos;s price with what its treasury holds per token. The
              thresholds are locked in every meme, and the price used is a 30-minute average.
            </p>
          </div>
          <div className="mt-10">
            <RulesPlayground />
          </div>
          <p className="mt-4 max-w-[72ch] text-sm text-soft">
            The floor defends NAV, not the price: if the stock falls, NAV falls with it. Every action
            pauses while the oracle price is older than 15 minutes; trading continues.
          </p>
        </div>
      </section>

      <ProofSection />

      <BuiltOn />

      <LiveStats />

      <section id="faq" aria-labelledby="faq-title" className="wrap grid scroll-mt-16 gap-10 pb-20 sm:pb-28 lg:grid-cols-[20rem_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="faq-title" className="type-h2">
            Fair questions.
          </h2>
          <p className="lede mt-4">The short, honest answers. The long ones live in the spec.</p>
          <a href={`${GITHUB_URL}/blob/main/docs/SPEC.md`} target="_blank" rel="noreferrer" className="link mt-4 inline-block text-sm">
            Read the spec on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        <Faq />
      </section>

      <section aria-labelledby="cta-title" className="wrap pb-20 sm:pb-28">
        <div className="relative isolate overflow-hidden rounded-[28px] border border-line bg-card px-6 py-14 text-center shadow-[var(--shadow-md)] sm:py-20">
          <div className="halftone absolute inset-0 -z-10 opacity-70" aria-hidden />
          <div className="glow -z-10 -bottom-24 left-[10%] h-56 w-[40%] bg-[#6f86ff] opacity-35" aria-hidden />
          <div className="glow -z-10 -bottom-24 right-[10%] h-56 w-[40%] bg-[#ffd76a] opacity-45" aria-hidden />
          <LogoMark className="mx-auto size-12 transition-transform duration-500 ease-[var(--ease-spring)] hover:-rotate-12 hover:scale-110" />
          <h2 id="cta-title" className="type-h2 mx-auto mt-6 max-w-[18ch]">
            Give your meme a balance sheet.
          </h2>
          <p className="lede mx-auto mt-4 max-w-[34rem]">
            Launch takes three transactions. After that, trading fills the treasury and the rules
            run on their own.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={APP_URL} className={buttonVariants({ size: "lg" })}>
              Open app
            </Link>
            <Link href={appUrl("/launch")} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Launch a meme
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
