import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import "./globals.css";

/** Only the wordmark uses Bricolage; everything else is Geist. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: { default: "Solidon: memes with a balance sheet", template: "%s | Solidon" },
  description:
    "A memecoin launchpad on NEAR where every meme is a treasury company holding a tokenized stock on Base, Robinhood Chain and Solana through Chain Signatures, with mNAV capital rules locked in code.",
};

export const viewport: Viewport = { themeColor: "#0e0e10" };

/** The root shell only: fonts and the skip link. The landing and the app bring their own chrome. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-blue px-4 py-2 font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
