/** A screenshot in a quiet browser frame, with the page address and a caption. */
export function Screenshot({ src, alt, url, caption }: { src: string; alt: string; url?: string; caption?: string }) {
  return (
    <figure className="not-prose my-8">
      <div className="overflow-hidden rounded-xl border bg-fd-card shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)]">
        <div className="flex items-center gap-3 border-b bg-fd-muted/60 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-fd-foreground/15" />
            <span className="size-2.5 rounded-full bg-fd-foreground/15" />
            <span className="size-2.5 rounded-full bg-fd-foreground/15" />
          </span>
          {url && <span className="truncate rounded-md bg-fd-background px-2.5 py-0.5 font-mono text-xs text-fd-muted-foreground">{url}</span>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="block w-full" />
      </div>
      {caption && <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

/** The 2:16 demo video, served from this site. */
export function DemoVideo({ caption }: { caption?: string }) {
  return (
    <figure className="not-prose my-8">
      <video
        src="/demo.mp4"
        poster="/demo-poster.jpg"
        controls
        preload="none"
        playsInline
        className="w-full overflow-hidden rounded-xl border bg-black shadow-[0_18px_50px_-24px_rgba(15,23,42,0.45)]"
      />
      {caption && <figcaption className="mt-3 text-center text-sm text-fd-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
