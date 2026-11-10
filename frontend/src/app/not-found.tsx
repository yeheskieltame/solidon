import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="wrap grid items-center gap-8 py-14 md:grid-cols-2 md:py-20">
      <div>
        <p className="type-num text-7xl text-lilac sm:text-8xl" aria-hidden>
          404
        </p>
        <h1 className="type-h2 mt-3">This page drifted out of orbit.</h1>
        <p className="lede mt-4 max-w-[30rem]">
          The link is wrong or the page moved. The memes and their balance sheets are still where
          you left them.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            Back to the launchpad
          </Link>
          <Link href="/launch" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Launch a meme
          </Link>
        </div>
      </div>
      <div className="aspect-[4/3] overflow-hidden rounded-[32px] border-2 border-ink shadow-[0_6px_0_var(--ink)]">
        <Mascot mode="loop" />
      </div>
    </div>
  );
}
