import type { Metadata } from "next";
import { Suspense } from "react";
import { LaunchFlow } from "@/components/launch-flow";
import { Sticker } from "@/components/sticker";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Launch a meme" };

export default function LaunchPage() {
  return (
    <div className="wrap pt-10 pb-20 sm:pt-14">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="type-display !text-[clamp(2.4rem,6.5vw,4.5rem)]">Launch a meme</h1>
          <p className="lede mt-4 max-w-[36rem]">
            Three steps, a few minutes. After that, trading fees fund the treasury and the rules run
            on their own.
          </p>
        </div>
        <Sticker name="rocket" eager className="hidden w-40 shrink-0 rotate-6 md:block lg:w-48" />
      </div>
      <div className="mt-8 sm:mt-10">
        <Suspense
          fallback={
            <div className="grid gap-5" aria-busy aria-label="Loading the launch form">
              <Skeleton className="h-16" />
              <Skeleton className="h-96 rounded-3xl" />
            </div>
          }
        >
          <LaunchFlow />
        </Suspense>
      </div>
    </div>
  );
}
