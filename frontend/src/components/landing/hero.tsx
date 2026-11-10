"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { ChainLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL } from "@/lib/site";
import { TreasuryShowcase } from "./treasury-showcase";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Hero after the MotionSites "Ledgely" showcase, brought to a light theme: the headline lines
 * rise out of their masks, then the product frame rises into two chain-coloured glows over a
 * halftone dot field.
 */
export function Hero() {
  const reduce = useReducedMotion();
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { y: "105%" },
          animate: { y: "0%" },
          transition: { duration: 0.9, ease: EASE, delay: 0.08 + i * 0.09 },
        };
  const fade = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease: EASE, delay } };

  return (
    <section id="product" aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24">
      <div className="halftone absolute inset-x-0 top-[38%] -z-10 h-[70%]" aria-hidden />
      <div className="glow -z-10 top-[44%] left-[8%] h-80 w-[38%] bg-[#6f86ff]" aria-hidden />
      <div className="glow -z-10 top-[52%] right-[6%] h-80 w-[36%] bg-[#8ef0c6]" aria-hidden />
      <div className="glow -z-10 top-[40%] right-[30%] h-56 w-[24%] bg-[#ffd76a] opacity-40" aria-hidden />

      <div className="wrap flex flex-col items-center text-center">
        <motion.p {...fade(0)} className="pill gap-2 !bg-card py-1 pr-3 pl-1.5 shadow-[var(--shadow-xs)] ring-1 ring-line">
          <span className="flex items-center">
            {["base", "robinhood", "solana"].map((c, i) => (
              <ChainLogo key={c} chain={c} size={18} decorative className={i > 0 ? "-ml-1 outline-2 outline-card" : "outline-2 outline-card"} />
            ))}
          </span>
          Real stock treasuries on Base, Robinhood Chain and Solana
        </motion.p>

        <h1 id="hero-title" className="type-display mt-6 max-w-[14ch]">
          {["Memes with a", "balance sheet."].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.06em]">
              <motion.span className="block" {...rise(i)}>
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p {...fade(0.3)} className="lede mt-6 max-w-[40rem]">
          Every meme on Solidon is a small treasury company. Trading fees buy a tokenized stock like
          NVDA on three chains, signed by the meme&apos;s own contract, and its capital rules are
          locked in code.
        </motion.p>

        <motion.div {...fade(0.4)} className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={APP_URL} className={buttonVariants({ size: "lg" })}>
            Open app
          </Link>
          <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
            How it works
          </a>
        </motion.div>
      </div>

      <motion.div
        className="wrap mt-14 sm:mt-16"
        {...(reduce
          ? {}
          : {
              initial: { opacity: 0, y: 48, scale: 0.98 },
              animate: { opacity: 1, y: 0, scale: 1 },
              transition: { duration: 1.1, ease: EASE, delay: 0.45 },
            })}
      >
        <div className="showcase-frame mx-auto max-w-5xl">
          <TreasuryShowcase />
        </div>
      </motion.div>
    </section>
  );
}
