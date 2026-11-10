import type { Metadata } from "next";
import { Suspense } from "react";
import { Dashboard } from "@/components/app/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap grid gap-6 pt-10 pb-16" aria-busy aria-label="Loading the dashboard">
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
