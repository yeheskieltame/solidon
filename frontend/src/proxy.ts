// Host routing for one build that serves two sites (Next.js 16 "proxy", formerly middleware):
//
//   app.<domain>/...        -> rewritten to the /app tree   (app.<domain>/launch shows /app/launch)
//   <domain>/app/...        -> redirected to NEXT_PUBLIC_APP_URL when that is an absolute URL
//                              on another host; served as is when it is "/app" (local, one host)
//   <domain>/launch, /meme/<account>  -> redirected to the app (old deep links keep working)
//
// Locally: http://localhost:3000 is the landing, http://localhost:3000/app and
// http://app.localhost:3000 are the app (*.localhost resolves to 127.0.0.1 in browsers).

import { NextResponse, type NextRequest } from "next/server";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "/app").replace(/\/+$/, "") || "/app";

/** The app's own origin when NEXT_PUBLIC_APP_URL is absolute, else null. */
function appOrigin(): URL | null {
  try {
    return /^https?:\/\//.test(APP_URL) ? new URL(APP_URL) : null;
  } catch {
    return null;
  }
}

function hostOf(req: NextRequest): string {
  return (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0].trim();
}

/** Target for an app path ("/launch") seen on the landing host. */
function toApp(req: NextRequest, path: string): URL {
  const origin = appOrigin();
  const rest = path === "/" ? "" : path;
  if (origin && origin.host !== hostOf(req)) {
    const url = new URL(`${origin.pathname.replace(/\/$/, "")}${rest}` || "/", origin);
    url.search = req.nextUrl.search;
    return url;
  }
  const url = req.nextUrl.clone();
  url.pathname = `/app${rest}`;
  return url;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = hostOf(req);

  if (host.startsWith("app.")) {
    // Already an /app path (server-rendered links use it): serve it as is.
    if (pathname === "/app" || pathname.startsWith("/app/")) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = `/app${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const origin = appOrigin();
    if (origin && origin.host !== host) {
      return NextResponse.redirect(toApp(req, pathname.slice(4) || "/"), 308);
    }
    return NextResponse.next();
  }

  // Old deep links from before the landing/app split.
  if (pathname === "/launch" || pathname.startsWith("/meme/")) {
    return NextResponse.redirect(toApp(req, pathname), 308);
  }

  return NextResponse.next();
}

export const config = {
  // Pages only: skip Next internals and static files (logos, icons, fonts). Not every dot is a
  // file: meme accounts such as /meme/e2etest.solidon.testnet must still reach the proxy.
  matcher: ["/((?!_next/|api/|.*\\.(?:svg|png|jpe?g|webp|avif|gif|ico|txt|xml|webmanifest|mp4|woff2?|css|js|map)$).*)"],
};
