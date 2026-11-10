import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { SiteFooter } from "@/components/disclaimers";
import { ToastProvider } from "@/components/toast";
import { WalletProvider } from "@/lib/wallet";

export const metadata: Metadata = {
  title: { default: "Solidon app", template: "%s | Solidon app" },
};

/**
 * The app at app.<domain> (and /app on a single host): Markets, Launch, Dashboard and the
 * meme pages, with the wallet and the toasts. See src/proxy.ts for the host rewrite.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <WalletProvider>
      <ToastProvider>
        <AppHeader />
        <main id="main" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <div className="pb-16 md:pb-0">
          <SiteFooter compact />
        </div>
      </ToastProvider>
    </WalletProvider>
  );
}
