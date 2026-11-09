import type { Metadata } from "next";
import { Suspense } from "react";
import { LaunchFlow } from "@/components/launch-flow";

export const metadata: Metadata = { title: "Launch a meme" };

export default function LaunchPage() {
  return (
    <div className="pt-12">
      <h1 className="type-display text-[clamp(2.5rem,7vw,4.5rem)]">Launch a meme</h1>
      <p className="mt-4 max-w-[38rem] text-lg text-graphite">
        Three steps: create the token, seed its pool with USDC, then open its treasury. After that,
        trading fees fund the treasury and the mNAV rules run on their own.
      </p>
      <div className="mt-10">
        <Suspense fallback={<p className="text-graphite">Loading the launch form…</p>}>
          <LaunchFlow />
        </Suspense>
      </div>
    </div>
  );
}
