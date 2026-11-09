import type { Metadata } from "next";
import { Suspense } from "react";
import { MemePage } from "@/components/meme-page";

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
    <Suspense fallback={<p className="pt-12 text-graphite">Loading the meme…</p>}>
      <Meme params={params} />
    </Suspense>
  );
}
