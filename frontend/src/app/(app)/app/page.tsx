import type { Metadata } from "next";
import { Markets } from "@/components/app/markets";

export const metadata: Metadata = { title: "Markets" };

export default function MarketsPage() {
  return <Markets />;
}
