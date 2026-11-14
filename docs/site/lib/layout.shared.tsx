import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import { appUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full" />
          <span className="font-brand text-[1.1rem] font-semibold tracking-tight">solidon</span>
          <span className="rounded-full border px-1.5 py-px text-[0.68rem] font-medium text-fd-muted-foreground">docs</span>
        </span>
      ),
    },
    links: [
      { text: 'API status', url: 'https://api.solidon.xyz/health', external: true },
      { text: 'solidon.xyz', url: 'https://solidon.xyz', external: true },
      {
        type: 'custom',
        on: 'nav',
        children: (
          <a
            href={appUrl}
            className="inline-flex items-center gap-1.5 rounded-full bg-fd-primary px-4 py-1.5 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90"
          >
            Open the app <span aria-hidden>›</span>
          </a>
        ),
      },
    ],
  };
}
