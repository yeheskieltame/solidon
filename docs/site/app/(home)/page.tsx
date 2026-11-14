import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { appUrl } from '@/lib/shared';

const SECTIONS = [
  {
    label: 'Start',
    links: [
      { href: '/docs', title: 'Introduction', body: 'The problem, and what a meme with a balance sheet is.' },
      { href: '/docs/quickstart', title: 'Quickstart', body: 'Demo wallet, a buy, the treasury on three chains, in five minutes.' },
      { href: '/docs/faq', title: 'FAQ', body: 'Keys, testnets, reverted swaps, what happens when the stock falls.' },
    ],
  },
  {
    label: 'Concepts',
    links: [
      { href: '/docs/concepts/how-it-works', title: 'How it works', body: 'From a trade on NEAR to stock bought on Base, Robinhood Chain and Solana.' },
      { href: '/docs/concepts/mnav', title: 'mNAV rules', body: 'Issue above 2×, buy back below 1×, redeem below 0.9×. Locked in code.' },
      { href: '/docs/concepts/treasuries', title: 'Chain Signatures treasuries', body: 'One NEAR contract signs every swap on three chains. No admin key.' },
    ],
  },
  {
    label: 'Build',
    links: [
      { href: '/docs/reference/contracts', title: 'Contracts', body: 'Factory and meme methods, messages and events.' },
      { href: '/docs/reference/api', title: 'Read API', body: 'History, events, holders and activity from api.solidon.xyz.' },
      { href: '/docs/reference/deployments', title: 'Deployments', body: 'Every live account, treasury address and stock token, with explorers.' },
    ],
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate overflow-hidden border-b bg-[#05060b] text-white">
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-80"
          style={{ backgroundImage: 'url(/hero.jpg)', maskImage: 'linear-gradient(90deg, transparent 0%, #000 55%)' }}
          aria-hidden
        />
        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
          <p className="flex items-center gap-2.5 text-sm font-medium uppercase tracking-[0.18em] text-white/60">
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
            Solidon documentation
          </p>
          <h1 className="mt-6 max-w-3xl font-brand text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
            Memes with a <span className="text-[#f2c14e]">balance sheet.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            Every meme on Solidon is a small treasury company. Its trading fees buy a tokenized stock, held on Base,
            Robinhood Chain and Solana and signed by one NEAR contract through Chain Signatures.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/docs/quickstart"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#0e0e10] transition hover:bg-white/90"
            >
              Quickstart <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Read the docs
            </Link>
            <a
              href={appUrl}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white/80 transition hover:text-white"
            >
              Open the app <ArrowUpRight className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-x-12 gap-y-14 px-6 py-16 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <div key={s.label}>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-fd-muted-foreground">{s.label}</p>
            <ul className="mt-4 divide-y border-y">
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="group block py-4">
                    <span className="flex items-center justify-between font-medium">
                      {l.title}
                      <ArrowRight className="size-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                    <span className="mt-1 block text-sm text-fd-muted-foreground">{l.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <p className="border-t pt-6 text-sm text-fd-muted-foreground">
          Runs on NEAR testnet, Base Sepolia, Robinhood Chain testnet and Solana devnet. Stock tokens are synthetic and
          priced from Chainlink feeds. For machines: <a className="underline" href="/llms.txt">llms.txt</a> ·{' '}
          <a className="underline" href="/llms-full.txt">llms-full.txt</a> · every page is also served as Markdown.
        </p>
      </section>
    </main>
  );
}
