// The keeper's indexer (backend): price / NAV history and NEP-297 events per meme and per account.
// Base URL NEXT_PUBLIC_INDEXER_URL (default http://localhost:8788), CORS open, read from the browser.
// Every caller must cope with it being down: charts then show nothing and the activity tables
// fall back to NearBlocks. Points are never interpolated or invented.

import type { MemeEvent } from "./events";

export const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:8788").replace(/\/+$/, "");

export type HistoryPoint = {
  /** Unix seconds. */
  t: number;
  price: number | null;
  twap: number | null;
  nav: number | null;
  mnav: number | null;
  stock_price: number | null;
  treasury_value: number | null;
  circulating: number | null;
  chains?: Record<string, number | null>;
};

export type IndexerEvent = {
  block_height: number;
  timestamp: number;
  tx_hash: string;
  receipt_id?: string;
  signer?: string;
  predecessor?: string;
  receiver?: string;
  event: string;
  standard?: string;
  data: unknown;
};

export type IndexerHealth = { ok: boolean; last_block?: number; memes?: number; lag_s?: number };

async function get<T>(path: string, timeoutMs = 5_000): Promise<T> {
  const res = await fetch(`${INDEXER_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`The indexer answered HTTP ${res.status}`);
  return (await res.json()) as T;
}

let health: { at: number; p: Promise<IndexerHealth | null> } | null = null;

/** The indexer's /health, shared for 30 s; null when it is unreachable or not ok. */
export function indexerHealth(): Promise<IndexerHealth | null> {
  if (!health || Date.now() - health.at > 30_000) {
    health = {
      at: Date.now(),
      p: get<IndexerHealth>("/health", 3_000)
        .then((h) => (h?.ok ? h : null))
        .catch(() => null),
    };
  }
  return health.p;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Normalises one row; timestamps in ms or ns are brought back to seconds. */
function point(r: Record<string, unknown>): HistoryPoint | null {
  let t = num(r.t);
  if (t === null) return null;
  if (t > 1e15) t = Math.floor(t / 1e9);
  else if (t > 1e12) t = Math.floor(t / 1e3);
  return {
    t,
    price: num(r.price),
    twap: num(r.twap),
    nav: num(r.nav),
    mnav: num(r.mnav),
    stock_price: num(r.stock_price),
    treasury_value: num(r.treasury_value),
    circulating: num(r.circulating),
    chains: (r.chains as Record<string, number | null>) ?? undefined,
  };
}

/** History of one meme, oldest first; null when the indexer is down. */
export async function fetchHistory(meme: string, opts: { since?: number; limit?: number } = {}): Promise<HistoryPoint[] | null> {
  if (!(await indexerHealth())) return null;
  const q = new URLSearchParams();
  if (opts.since) q.set("since", String(Math.floor(opts.since)));
  if (opts.limit) q.set("limit", String(opts.limit));
  try {
    const rows = await get<unknown>(`/v1/memes/${encodeURIComponent(meme)}/history${q.size ? `?${q}` : ""}`);
    const list = Array.isArray(rows) ? rows : ((rows as { history?: unknown[] })?.history ?? []);
    return list
      .map((r) => point(r as Record<string, unknown>))
      .filter((p): p is HistoryPoint => !!p)
      .sort((a, b) => a.t - b.t);
  } catch {
    return null;
  }
}

function toSeconds(ts: number): number {
  if (ts > 1e15) return Math.floor(ts / 1e9);
  if (ts > 1e12) return Math.floor(ts / 1e3);
  return Math.floor(ts);
}

/** Indexer events in the shape the event tables use: one entry per NEP-297 data item. */
export function toMemeEvents(rows: IndexerEvent[]): (MemeEvent & { contract?: string })[] {
  const out: (MemeEvent & { contract?: string })[] = [];
  for (const r of rows) {
    const items = Array.isArray(r.data) ? r.data : [r.data];
    for (const d of items) {
      out.push({
        standard: r.standard ?? "",
        event: r.event,
        data: (d && typeof d === "object" ? d : {}) as Record<string, unknown>,
        txHash: r.tx_hash,
        time: toSeconds(r.timestamp ?? 0),
        contract: r.receiver,
      });
    }
  }
  return out;
}

async function events(path: string): Promise<(MemeEvent & { contract?: string })[]> {
  if (!(await indexerHealth())) throw new Error("The indexer is unreachable");
  const rows = await get<unknown>(path);
  const list = Array.isArray(rows) ? rows : ((rows as { events?: unknown[] })?.events ?? []);
  return toMemeEvents(list as IndexerEvent[]);
}

/** A meme's events, newest first. Throws when the indexer is down (callers fall back). */
export const fetchIndexedMemeEvents = (meme: string, limit = 50) =>
  events(`/v1/memes/${encodeURIComponent(meme)}/events?limit=${limit}`);

/** Events that involve an account, newest first. Throws when the indexer is down. */
export const fetchIndexedAccountActivity = (account: string, limit = 50) =>
  events(`/v1/accounts/${encodeURIComponent(account)}/activity?limit=${limit}`);

export type Holder = {
  account: string;
  /** Raw units. */
  balance: string;
  /** Of the total supply, 0 to 1; null when the supply is unknown. */
  share: number | null;
};
export type MemeHolders = {
  meme: string;
  /** Biggest first, the pool excluded. */
  holders: Holder[];
  /** The meme contract's own reserve in its pool, raw units. */
  pool_reserve: string | null;
  total_supply: string | null;
  updated_at: number;
};

/** Top holders of a meme (live balances, cached 60 s by the indexer); null when it is down. */
export async function fetchHolders(meme: string, limit = 20): Promise<MemeHolders | null> {
  if (!(await indexerHealth())) return null;
  try {
    const r = await get<MemeHolders>(`/v1/memes/${encodeURIComponent(meme)}/holders?limit=${limit}`, 20_000);
    return Array.isArray(r?.holders) ? r : null;
  } catch {
    return null;
  }
}

/**
 * When the meme's current issuance epoch started, replayed from its rebalance events: the
 * contract (`mnav.rs` evaluate) starts a new epoch at the first rebalance at least `epochSecs`
 * after the previous start, and does not expose `epoch_start` itself. Trusted only when the
 * replay agrees with the contract: the tokens issued since that start must equal
 * `epochIssued`. Null when the indexer is down, the history is cut or the sums differ.
 */
export async function fetchEpochStart(meme: string, epochSecs: number, epochIssued: bigint): Promise<number | null> {
  if (!(epochSecs > 0) || !(await indexerHealth())) return null;
  try {
    const r = await get<{ events?: IndexerEvent[]; more?: boolean }>(`/v1/memes/${encodeURIComponent(meme)}/events?limit=500`, 10_000);
    if (!Array.isArray(r?.events) || r.more) return null;
    const rebalances = toMemeEvents(r.events)
      .filter((e) => e.event === "rebalance")
      .sort((a, b) => a.time - b.time);
    let start: number | null = null;
    let issued = 0n;
    for (const e of rebalances) {
      if (start === null || e.time >= start + epochSecs) {
        start = e.time;
        issued = 0n;
      }
      const out = e.data.outcome as { issued?: { meme?: string } } | string | undefined;
      if (typeof out === "object" && out?.issued?.meme) issued += BigInt(out.issued.meme);
    }
    return start !== null && issued === epochIssued ? start : null;
  } catch {
    return null;
  }
}
