// The meme's event log: NEP-297 `EVENT_JSON:` logs emitted by the meme contract,
// read from the NearBlocks v3 API (receipts -> transaction receipt trees).

import { NEARBLOCKS_API } from "./config";
import { fetchIndexedMemeEvents } from "./indexer";

export type MemeEvent = {
  standard: string;
  event: string;
  data: Record<string, unknown>;
  txHash: string;
  /** Unix seconds. */
  time: number;
};

type ReceiptNode = {
  outcome?: { executor_account_id?: string; logs?: string[] };
  block?: { block_timestamp?: string };
  receipts?: ReceiptNode[];
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${NEARBLOCKS_API}${path}`, { cache: "no-store" });
  if (res.status === 429) throw new Error("NearBlocks rate limit reached, try again in a minute");
  if (!res.ok) throw new Error(`NearBlocks answered HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function parseEventLog(log: string): { standard: string; event: string; data: unknown[] } | null {
  if (!log.startsWith("EVENT_JSON:")) return null;
  try {
    const j = JSON.parse(log.slice("EVENT_JSON:".length));
    if (typeof j?.event !== "string") return null;
    return { standard: String(j.standard), event: j.event, data: Array.isArray(j.data) ? j.data : [j.data] };
  } catch {
    return null;
  }
}

function collect(node: ReceiptNode, account: string, txHash: string, out: MemeEvent[]) {
  if (node.outcome?.executor_account_id === account) {
    const time = Math.floor(Number(node.block?.block_timestamp ?? 0) / 1e9);
    for (const log of node.outcome.logs ?? []) {
      const e = parseEventLog(log);
      if (!e) continue;
      for (const d of e.data) {
        out.push({
          standard: e.standard,
          event: e.event,
          data: (d ?? {}) as Record<string, unknown>,
          txHash,
          time,
        });
      }
    }
  }
  for (const child of node.receipts ?? []) collect(child, account, txHash, out);
}

/** Events of the latest `maxTxs` transactions that touched `account`, newest first. */
export async function fetchMemeEvents(account: string, maxTxs = 10): Promise<MemeEvent[]> {
  const list = await get<{ data?: { transaction_hash?: string }[] }>(
    `/v3/accounts/${encodeURIComponent(account)}/receipts?limit=25`,
  );
  const hashes = [
    ...new Set((list.data ?? []).map((r) => r.transaction_hash).filter(Boolean) as string[]),
  ].slice(0, maxTxs);
  const out: MemeEvent[] = [];
  // Sequential: the public API is rate limited.
  for (const h of hashes) {
    try {
      const tx = await get<{ data?: ReceiptNode }>(`/v3/txns/${h}/receipts`);
      if (tx.data) collect(tx.data, account, h, out);
    } catch (e) {
      if (out.length === 0) throw e;
      break;
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

export type EventSource = "indexer" | "nearblocks";
export type EventFeed = { events: MemeEvent[]; source: EventSource };

/**
 * A meme's events from the keeper's indexer when it answers with any, else from NearBlocks
 * (the latest transactions only). Newest first.
 */
export async function loadMemeEvents(account: string): Promise<EventFeed> {
  try {
    const events = await fetchIndexedMemeEvents(account, 50);
    if (events.length > 0) return { events: events.sort((a, b) => b.time - a.time), source: "indexer" };
  } catch {
    /* indexer down: fall back */
  }
  return { events: await fetchMemeEvents(account), source: "nearblocks" };
}
