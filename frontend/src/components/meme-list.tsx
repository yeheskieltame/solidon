"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { MemeCard, MemeCardSkeleton } from "./meme-card";
import { Notice } from "./notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { FACTORY } from "@/lib/config";
import { factory } from "@/lib/near";
import { useAsync } from "@/lib/use-async";

export function MemeList() {
  const memes = useAsync(() => factory.memes(), []);
  const count = memes.data?.length ?? 0;

  return (
    <section id="memes" aria-labelledby="memes-title" className="wrap pt-20 sm:pt-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="memes-title" className="type-h2">
            Live memes
          </h2>
          <p className="lede mt-3" aria-live="polite">
            {memes.data
              ? `${count} ${count === 1 ? "meme" : "memes"} on the factory ${FACTORY}, read straight from NEAR.`
              : "Reading the factory on NEAR…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={memes.reload} disabled={memes.loading}>
          <RefreshCw className={cn("size-4", memes.loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>

      <div className="mt-8">
        {memes.loading && !memes.data ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <MemeCardSkeleton key={i} />
            ))}
          </div>
        ) : memes.error ? (
          <Notice
            tone="error"
            sticker="rover"
            title="The factory did not answer"
            action={
              <Button variant="outline" onClick={memes.reload}>
                Try again
              </Button>
            }
          >
            {memes.error}. Check your connection, or NEXT_PUBLIC_FACTORY ({FACTORY}).
          </Notice>
        ) : count === 0 ? (
          <Notice
            sticker="saturn"
            title="No memes yet. Yours could be first."
            action={
              <Link href="/launch" className={buttonVariants()}>
                Launch the first meme
              </Link>
            }
          >
            It takes a name, a ticker and a stock to believe in.
          </Notice>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {memes.data?.map((m) => <MemeCard key={m} account={m} />)}
            <Link
              href="/launch"
              className="card-lift flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line-strong p-6 text-center"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl border-2 border-ink bg-green font-heading text-3xl font-black shadow-[0_4px_0_var(--ink)]" aria-hidden>
                +
              </span>
              <span className="type-h3">Launch your own</span>
              <span className="text-sm font-semibold text-soft">Three steps, one tiny treasury company.</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
