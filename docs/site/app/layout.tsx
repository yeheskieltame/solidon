import { RootProvider } from 'fumadocs-ui/provider/next';
import { Banner } from 'fumadocs-ui/components/banner';
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
import { siteUrl } from '@/lib/shared';
import './global.css';

const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'] });
const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Solidon Docs', template: '%s | Solidon Docs' },
  description:
    'Documentation for Solidon, a memecoin launchpad on NEAR where every meme is a treasury company holding tokenized stock on Base, Robinhood Chain and Solana through Chain Signatures.',
  icons: { icon: '/logo.png' },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} ${bricolage.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <Banner id="testnet-2026" className="bg-[#3a6ff7] text-[0.85rem] font-medium text-white">
          Solidon runs on NEAR testnet, Base Sepolia, Robinhood Chain testnet and Solana devnet. Test USDC and synthetic stock tokens have no value.
        </Banner>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
