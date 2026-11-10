import type { Metadata } from "next";
import { Suspense } from "react";
import { LaunchFlow } from "@/components/launch-flow";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Launch a meme" };

export default function LaunchPage() {
  return (
    <div className="wrap pt-8 pb-16 sm:pt-10">
      <h1 className="type-h1">Launch a meme</h1>
      <p className="mt-1.5 max-w-[40rem] text-soft">
        Three transactions, a few minutes. After that, trading fees fund the treasury and the rules
        run on their own.
      </p>
      <div className="mt-8">
        <Suspense
          fallback={
            <div className="grid gap-5" aria-busy aria-label="Loading the launch form">
              <Skeleton className="h-14" />
              <Skeleton className="h-96 rounded-2xl" />
            </div>
          }
        >
          <LaunchFlow />
        </Suspense>
      </div>
    </div>
  );
}
