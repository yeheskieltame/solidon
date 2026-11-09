import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Disclaimers } from "@/components/disclaimers";
import { SiteHeader } from "@/components/site-header";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: { default: "Solidon: memes with a balance sheet", template: "%s | Solidon" },
  description:
    "A memecoin launchpad on NEAR where every meme is a treasury company holding a tokenized stock on Base, Robinhood Chain and Solana through Chain Signatures, with mNAV capital rules locked in code.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <WalletProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">{children}</main>
          <Disclaimers />
        </WalletProvider>
      </body>
    </html>
  );
}
