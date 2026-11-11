import Link from "next/link";
import type { CSSProperties } from "react";
import { ChainLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL } from "@/lib/site";
import { TreasuryShowcase } from "./treasury-showcase";

const delay = (s: number) => ({ animationDelay: `${s}s` }) as CSSProperties;

/**
 * The hero: the headline lines rise out of their masks, then the live product frame rises
 * over one soft blue glow. One orchestrated entrance, in CSS so it never waits on JavaScript.
 */
export function Hero() {
  return (
    <section id="product" aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-14 pb-16 sm:pt-24 sm:pb-24">
      <video
        className="hero-video pointer-events-none absolute inset-x-0 top-0 -z-20 h-[46rem] w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/hero/hero-flow.jpg"
        aria-hidden
      >
        <source src="/hero/hero-flow.webm" type="video/webm" />
        <source src="/hero/hero-flow.mp4" type="video/mp4" />
      </video>
      <div className="glow -z-10 top-[48%] left-1/2 h-96 w-[60%] -translate-x-1/2 bg-blue opacity-[var(--glow-opacity)]" aria-hidden />

      <div className="wrap flex flex-col items-center text-center">
        <p className="enter-fade flex items-center gap-2.5 text-[0.9375rem] text-soft" style={delay(0)}>
          <span className="flex shrink-0 items-center">
            {["base", "robinhood", "solana"].map((c, i) => (
              <ChainLogo key={c} chain={c} size={20} decorative className={i > 0 ? "-ml-1.5 outline-2 outline-page" : "outline-2 outline-page"} />
            ))}
          </span>
          Stock treasuries on Base, Robinhood Chain and Solana
        </p>

        <h1 id="hero-title" className="type-display mt-7 max-w-[14ch]">
          {["Memes with a", "balance sheet."].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <span className="enter-rise block" style={delay(0.08 + i * 0.09)}>
                {line}
              </span>
            </span>
          ))}
        </h1>

        <p className="enter-fade lede mt-6 max-w-[36rem]" style={delay(0.3)}>
          Every meme is a small treasury company. Trading fees buy a tokenized stock on three chains,
          and its capital rules are locked in code.
        </p>

        <div className="enter-fade mt-9 flex flex-wrap justify-center gap-3" style={delay(0.4)}>
          <Link href={APP_URL} className={buttonVariants({ size: "lg" })}>
            Open app
          </Link>
          <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
            How it works
          </a>
        </div>
      </div>

      <div className="enter-frame wrap mt-16 sm:mt-20" style={delay(0.45)}>
        <div className="showcase-frame mx-auto max-w-5xl">
          <TreasuryShowcase />
        </div>
      </div>
    </section>
  );
}
