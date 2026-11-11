// Where the landing site and the app live. One Next.js build serves both:
//   landing  NEXT_PUBLIC_SITE_URL   e.g. https://solidon.xyz          (routes in app/(landing))
//   app      NEXT_PUBLIC_APP_URL    e.g. https://app.solidon.xyz      (routes in app/(app)/app)
// Locally the app also answers at /app and at http://app.localhost:3000 (see src/proxy.ts).

/** "/app" (single host) or an absolute URL such as "https://app.solidon.xyz". No trailing slash. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "/app").replace(/\/+$/, "") || "/app";

/** The landing site, used for links back from the app. "/" on a single host. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

/** The meme featured on the landing: Spydia ($SPYDIA), whose treasury holds NVDA. */
export const SHOWCASE_MEME = "spydia.solidon.testnet";

/** Full-size meme art served from public/memes (the on-chain icon is only 64 px). */
export const MEME_ART: Record<string, { src: string; alt: string }> = {
  [SHOWCASE_MEME]: {
    src: "/memes/spydia.webp",
    alt: "A smitten capybara in a leather jacket on a GPU throne reaches for a honey pot while a spy watches and NVDA crashes. Caption: The more you buy, the more they spy.",
  },
};

/** Absolute app URL for a path inside the app ("/launch" -> "https://app.x.y/launch" or "/app/launch"). */
export function appUrl(path = "/"): string {
  const p = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${APP_URL}${p}` || "/";
}

/** True when an app hostname is served at its root (app.<domain>), so app paths need no /app prefix. */
export function isAppHost(hostname: string): boolean {
  return hostname.startsWith("app.");
}
