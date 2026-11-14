import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import { appUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={26} height={26} className="rounded-full" />
          <span className="font-brand text-[1.05rem] font-semibold tracking-tight">solidon</span>
          <span className="rounded-full border px-1.5 py-px text-[0.68rem] font-medium text-fd-muted-foreground">docs</span>
        </span>
      ),
    },
    links: [
      { text: 'Open the app', url: appUrl, external: true },
      { text: 'solidon.xyz', url: 'https://solidon.xyz', external: true },
    ],
  };
}
