"use client";

// Links inside the app. On app.<domain> the app lives at the root ("/launch"); on a single
// host it lives under "/app" ("/app/launch"). The server always renders the "/app" form
// (the proxy accepts both on the app host), and the browser switches to the short form
// after hydration.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ComponentProps } from "react";
import { isAppHost } from "./site";

const subscribe = () => () => undefined;

/** "" on app.<domain>, "/app" everywhere else. */
export function useAppBase(): string {
  return useSyncExternalStore(
    subscribe,
    () => (isAppHost(window.location.hostname) ? "" : "/app"),
    () => "/app",
  );
}

export function useAppHref(): (path: string) => string {
  const base = useAppBase();
  return (path: string) => {
    const p = path === "/" ? "" : path;
    return `${base}${p}` || "/";
  };
}

/** The current app route without the base, e.g. "/", "/launch", "/meme/x". */
export function useAppPath(): string {
  const pathname = usePathname() || "/";
  const stripped = pathname.replace(/^\/app(?=\/|$)/, "");
  return stripped || "/";
}

/** next/link for an app path ("/launch", "/meme/x.testnet"). */
export function AppLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const to = useAppHref();
  return <Link href={to(href)} {...props} />;
}
