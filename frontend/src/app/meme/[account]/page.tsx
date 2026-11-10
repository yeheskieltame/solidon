import type { Metadata } from "next";
import { Suspense } from "react";
import { MemePage } from "@/components/meme-page";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata({ params }: PageProps<"/meme/[account]">): Promise<Metadata> {
  const { account } = await params;
  return { title: decodeURIComponent(account) };
}

async function Meme({ params }: { params: PageProps<"/meme/[account]">["params"] }) {
  const { account } = await params;
  return <MemePage account={decodeURIComponent(account).toLowerCase()} />;
}

export default function Page({ params }: PageProps<"/meme/[account]">) {
  return (
    <Suspense
      fallback={
        <div className="wrap grid gap-6 pt-8 pb-20" aria-busy aria-label="Loading the meme">
          <Skeleton className="h-24 w-2/3 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      }
    >
      <Meme params={params} />
    </Suspense>
  );
}
