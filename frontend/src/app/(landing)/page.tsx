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
import { APP_URL, appUrl } from "@/lib/site";

export default function Landing() {
  return (
    <>
      <Hero />

      <section aria-labelledby="stocks-title" className="py-10 sm:py-14">
        <div className="wrap mb-8 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="stocks-title" className="text-[0.9375rem] text-ink-2">
            Pick the stock your meme believes in
          </h2>
          <p className="text-sm text-soft">Eight listed, each on all three chains</p>
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
              mNAV is the meme&apos;s price over what its treasury holds per token. The thresholds are
              locked in every meme.
            </p>
          </div>
          <div className="mt-10">
            <RulesPlayground />
          </div>
          <p className="mt-5 max-w-[72ch] text-sm text-soft">
            The floor defends NAV, not the price: if the stock falls, NAV falls with it.
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
          <p className="lede mt-4">The short answers. Every risk in full is on one page.</p>
          <Link href="/risks" className="link mt-4 inline-block text-sm">
            Read the risks
          </Link>
        </div>
        <Faq />
      </section>

      <section aria-labelledby="cta-title" className="wrap pb-20 sm:pb-28">
        <div className="border-t border-line px-2 pt-20 text-center sm:pt-28">
          <LogoMark className="mx-auto size-12 transition-transform duration-500 ease-[var(--ease-spring)] hover:-rotate-12 hover:scale-110" />
          <h2 id="cta-title" className="type-h2 mx-auto mt-6 max-w-[18ch]">
            Give your meme a balance sheet.
          </h2>
          <p className="lede mx-auto mt-4 max-w-[34rem]">
            Three transactions to launch. After that, the rules run on their own.
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
