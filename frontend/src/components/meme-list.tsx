"use client";

import Link from "next/link";
import { MemeCard } from "./meme-card";
import { Notice } from "./notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FACTORY } from "@/lib/config";
import { factory } from "@/lib/near";
import { useAsync } from "@/lib/use-async";

export function MemeList() {
  const memes = useAsync(() => factory.memes(), []);

  return (
    <section aria-labelledby="memes-heading" className="mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
        <h2 id="memes-heading" className="type-wide text-3xl">
          Launched memes
          {memes.data && (
            <span className="ml-3 align-middle text-base font-normal text-graphite">
              {memes.data.length} on {FACTORY}
            </span>
          )}
        </h2>
        <Button variant="outline" onClick={memes.reload} disabled={memes.loading}>
          {memes.loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="mt-6">
        {memes.loading && !memes.data ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72 rounded-none" />
            ))}
          </div>
        ) : memes.error ? (
          <Notice
            tone="error"
            title={`Could not read the factory at ${FACTORY}`}
            action={
              <Button variant="outline" className="text-ink" onClick={memes.reload}>
                Try again
              </Button>
            }
          >
            {memes.error}. Check NEXT_PUBLIC_FACTORY and your connection.
          </Notice>
        ) : memes.data && memes.data.length === 0 ? (
          <Notice
            title="No memes launched yet"
            action={
              <Link href="/launch" className={buttonVariants()}>
                Launch the first meme
              </Link>
            }
          >
            The factory {FACTORY} has no memes. Launching one takes a name, a ticker and a thesis
            stock.
          </Notice>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {memes.data?.map((m) => <MemeCard key={m} account={m} />)}
          </div>
        )}
      </div>
    </section>
  );
}
