import type { Metadata, Viewport } from "next";
import { Epilogue, Nunito } from "next/font/google";
import { SiteFooter } from "@/components/disclaimers";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toast";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

const epilogue = Epilogue({
  variable: "--font-epilogue",
  subsets: ["latin"],
  weight: ["800", "900"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Solidon: memes with a balance sheet", template: "%s | Solidon" },
  description:
    "A memecoin launchpad on NEAR where every meme is a treasury company holding a tokenized stock on Base, Robinhood Chain and Solana through Chain Signatures, with mNAV capital rules locked in code.",
};

export const viewport: Viewport = { themeColor: "#f0eefa" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${epilogue.variable} ${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-xl bg-ink px-4 py-2 font-extrabold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <WalletProvider>
          <ToastProvider>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
