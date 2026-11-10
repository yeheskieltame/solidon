import { SiteFooter } from "@/components/disclaimers";
import { LandingHeader } from "@/components/landing/landing-header";

/** The marketing site at <domain>: its own header with one action, Open app. No wallet here. */
export default function LandingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <LandingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
