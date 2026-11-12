// Read-only HTTP API over the indexer's store (node:http, JSON, CORS *). `route` is pure:
// (service, method, url) -> { status, body }, so every route is unit-tested without a socket.
// The holders route needs NEAR views, so it alone returns a Promise of { status, body }.
//   GET /health
//   GET /v1/memes
//   GET /v1/memes/:id/history?since=<unix s>&limit=<n>   ascending, thinned evenly to <= limit (max 2000)
//   GET /v1/memes/:id/events?limit=<n>&before=<block>     newest first
//   GET /v1/memes/:id/holders?limit=<n>                   biggest first (live views, cached 60 s)
//   GET /v1/accounts/:id/activity?limit=<n>               newest first, across all memes
import http from "node:http";
import { involves } from "./events.js";

const ACCOUNT = /^[a-z0-9._-]{2,64}$/;
const MAX_LIMIT = 500;
const MAX_HISTORY = 2000; // charts want the whole range; longer histories are thinned evenly

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function intParam(q, name, { dflt = null, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const v = q.get(name);
  if (v === null || v === "") return dflt;
  if (!/^\d+$/.test(v)) throw new HttpError(400, `${name} must be a non-negative integer`);
  const n = Number(v);
  if (n < min || n > max) throw new HttpError(400, `${name} must be between ${min} and ${max}`);
  return n;
}

/** At most `n` points spread evenly over `points`, always keeping the first and the newest. */
export function thin(points, n) {
  if (points.length <= n) return points;
  if (n === 1) return [points[points.length - 1]];
  return Array.from({ length: n }, (_, i) => points[Math.round((i * (points.length - 1)) / (n - 1))]);
}

const limitOf = (q, dflt) => intParam(q, "limit", { dflt, min: 1, max: MAX_LIMIT });

function memeOf(service, id) {
  if (!ACCOUNT.test(id)) throw new HttpError(400, "invalid account id");
  if (!service.memes().includes(id)) throw new HttpError(404, `unknown meme ${id}`);
  return id;
}

/** Events of every tracked account (the factory and every meme), newest first. */
function allEvents(store) {
  const out = [];
  for (const list of store.events.values()) out.push(...list);
  return out.sort((a, b) => b.block_height - a.block_height || b.log_index - a.log_index);
}

export function route(service, method, rawUrl) {
  try {
    if (method === "OPTIONS") return { status: 204, body: null };
    if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "read-only API: GET only");
    const url = new URL(rawUrl, "http://x");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const q = url.searchParams;
    const { store } = service;

    if (parts.length === 1 && parts[0] === "health") return { status: 200, body: service.health() };

    if (parts[0] === "v1" && parts[1] === "memes") {
      if (parts.length === 2) {
        return {
          status: 200,
          body: {
            memes: service.memes().map((id) => ({
              id,
              ...(service.meta.get(id) ?? {}),
              latest: store.history.get(id)?.at(-1) ?? null,
              events: store.events.get(id)?.length ?? 0,
            })),
          },
        };
      }
      const id = parts.length === 4 ? memeOf(service, parts[2]) : null;
      if (id && parts[3] === "history") {
        const since = intParam(q, "since", { dflt: 0 });
        const limit = intParam(q, "limit", { dflt: MAX_HISTORY, min: 1, max: MAX_HISTORY });
        const points = (store.history.get(id) ?? []).filter((s) => s.t >= since);
        return { status: 200, body: { meme: id, history: thin(points, limit), thinned: points.length > limit } };
      }
      if (id && parts[3] === "events") {
        const before = intParam(q, "before");
        const limit = limitOf(q, 50);
        const list = (store.events.get(id) ?? []).filter((e) => before === null || e.block_height < before);
        return { status: 200, body: { meme: id, events: list.slice(0, limit), more: list.length > limit } };
      }
      if (id && parts[3] === "holders") {
        const limit = limitOf(q, 50);
        return service.holders(id, limit).then(
          (body) => ({ status: 200, body }),
          (e) => {
            service.onHoldersError?.(id, e);
            return { status: 502, body: { error: "NEAR RPC unavailable, try again" } };
          },
        );
      }
    }

    if (parts[0] === "v1" && parts[1] === "accounts" && parts.length === 4 && parts[3] === "activity") {
      const account = parts[2];
      if (!ACCOUNT.test(account)) throw new HttpError(400, "invalid account id");
      const limit = limitOf(q, 50);
      const before = intParam(q, "before");
      const list = allEvents(store).filter(
        (e) => involves(e, account) && (before === null || e.block_height < before),
      );
      return { status: 200, body: { account, events: list.slice(0, limit), more: list.length > limit } };
    }

    throw new HttpError(404, "no such route");
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    if (e instanceof URIError) return { status: 400, body: { error: "bad URL encoding" } };
    return { status: 500, body: { error: "internal error" } };
  }
}

export function serve(service, port, onError = () => {}) {
  const server = http.createServer(async (req, res) => {
    const { status, body } = await route(service, req.method, req.url);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    });
    res.end(body === null || req.method === "HEAD" ? undefined : JSON.stringify(body));
  });
  server.on("error", onError);
  server.listen(port);
  return server;
}
