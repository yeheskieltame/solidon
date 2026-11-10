// Where the landing site and the app live. One Next.js build serves both:
//   landing  NEXT_PUBLIC_SITE_URL   e.g. https://solidon.xyz          (routes in app/(landing))
//   app      NEXT_PUBLIC_APP_URL    e.g. https://app.solidon.xyz      (routes in app/(app)/app)
// Locally the app also answers at /app and at http://app.localhost:3000 (see src/proxy.ts).

/** "/app" (single host) or an absolute URL such as "https://app.solidon.xyz". No trailing slash. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "/app").replace(/\/+$/, "") || "/app";

/** The landing site, used for links back from the app. "/" on a single host. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

export const GITHUB_URL = "https://github.com/yeheskieltame/solidon";

/** The live end-to-end meme from docs/DEPLOYMENTS.md: NVDA on Base, Robinhood Chain and Solana. */
export const SHOWCASE_MEME = "e2etest.solidon.testnet";

/** Absolute app URL for a path inside the app ("/launch" -> "https://app.x.y/launch" or "/app/launch"). */
export function appUrl(path = "/"): string {
  const p = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${APP_URL}${p}` || "/";
}

/** True when an app hostname is served at its root (app.<domain>), so app paths need no /app prefix. */
export function isAppHost(hostname: string): boolean {
  return hostname.startsWith("app.");
}
