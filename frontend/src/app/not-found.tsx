import type { Metadata } from "next";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL, SITE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="relative isolate flex flex-1 flex-col">
      <div className="wrap flex h-[var(--header-h)] items-center">
        <Link href={SITE_URL || "/"} aria-label="Solidon home">
          <Logo />
        </Link>
      </div>
      <div className="wrap flex flex-1 flex-col items-center justify-center py-20 text-center">
        <LogoMark className="size-14 -rotate-12" />
        <p className="mt-6 text-sm text-soft">Error 404</p>
        <h1 className="type-h2 mt-2 max-w-[16ch]">This page is not on the balance sheet.</h1>
        <p className="lede mt-4 max-w-[30rem]">
          The link is wrong or the page moved. The memes and their treasuries are where you left them.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={APP_URL} className={buttonVariants({ size: "lg" })}>
            Open app
          </Link>
          <Link href={SITE_URL || "/"} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to the home page
          </Link>
        </div>
      </div>
    </main>
  );
}
