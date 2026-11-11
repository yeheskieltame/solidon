// Pure event extraction from FastNear tx API transactions (`POST /v0/transactions`): every
// NEP-297 `EVENT_JSON:` log of a receipt executed by a tracked contract (the factory, every meme),
// plus the NEP-141 events of the USDC contract that move USDC to or from a meme. No I/O
// (test/indexer.test.js).

const PREFIX = "EVENT_JSON:";

/** `{ standard, version, event, data: [] }` of an `EVENT_JSON:` log, or null. */
export function parseEventLog(log) {
  if (typeof log !== "string" || !log.startsWith(PREFIX)) return null;
  try {
    const j = JSON.parse(log.slice(PREFIX.length));
    if (typeof j?.event !== "string" || typeof j?.standard !== "string") return null;
    return {
      standard: j.standard,
      version: j.version ?? null,
      event: j.event,
      data: Array.isArray(j.data) ? j.data : j.data === undefined ? [] : [j.data],
    };
  } catch {
    return null;
  }
}

/** Accounts an event names: who did it or whose balance it moved. */
const PARTY_FIELDS = ["account", "owner_id", "old_owner_id", "new_owner_id", "caller", "creator", "account_id"];

export function partiesOf(data) {
  const out = new Set();
  if (data && typeof data === "object") for (const f of PARTY_FIELDS) if (typeof data[f] === "string") out.add(data[f]);
  return out;
}

/** True when `account` signed, called, or is named in the event. */
export function involves(ev, account) {
  return ev.signer === account || ev.predecessor === account || partiesOf(ev.data).has(account);
}

/** Stable identity of one event record (a log can carry several `data` items). */
export const eventKey = (ev) => `${ev.receipt_id}:${ev.log_index}:${ev.data_index}`;

/**
 * True once every receipt the transaction spawned has an execution outcome in `tx.receipts`,
 * i.e. no log can still appear.
 */
export function txComplete(tx) {
  const executed = new Set((tx.receipts ?? []).map((r) => r.execution_outcome?.id));
  const wanted = [...(tx.execution_outcome?.outcome?.receipt_ids ?? [])];
  for (const r of tx.receipts ?? []) wanted.push(...(r.execution_outcome?.outcome?.receipt_ids ?? []));
  return wanted.every((id) => executed.has(id));
}

/**
 * Event records of one transaction, each with `account` = the file it belongs to:
 * - a receipt executed by a tracked contract: every event, under that contract;
 * - a receipt executed by `usdc`: its NEP-141 events, under each tracked meme they name.
 * Record: { account, block_height, timestamp, tx_hash, receipt_id, log_index, data_index,
 *           signer, predecessor, receiver, event, standard, version, data }.
 */
export function eventsFromTx(tx, { tracked, usdc = null }) {
  const out = [];
  const txHash = tx.transaction?.hash ?? tx.execution_outcome?.id;
  const signer = tx.transaction?.signer_id ?? null;
  for (const r of tx.receipts ?? []) {
    const eo = r.execution_outcome;
    const rc = r.receipt;
    const receiver = eo?.outcome?.executor_id ?? rc?.receiver_id;
    const logs = eo?.outcome?.logs ?? [];
    if (!logs.length) continue;
    const own = tracked.has(receiver);
    if (!own && receiver !== usdc) continue;
    const base = {
      block_height: Number(eo.block_height ?? rc?.block_height),
      timestamp: Math.floor(Number(eo.block_timestamp ?? rc?.block_timestamp ?? 0) / 1e9),
      tx_hash: txHash,
      receipt_id: eo.id ?? rc?.receipt_id,
      signer: rc?.receipt?.Action?.signer_id ?? signer,
      predecessor: rc?.predecessor_id ?? null,
      receiver,
    };
    logs.forEach((line, logIndex) => {
      const e = parseEventLog(line);
      if (!e) return;
      e.data.forEach((d, dataIndex) => {
        const data = d ?? {};
        const ev = {
          ...base,
          log_index: logIndex,
          data_index: dataIndex,
          event: e.event,
          standard: e.standard,
          version: e.version,
          data,
        };
        if (own) out.push({ account: receiver, ...ev });
        else if (e.standard === "nep141") {
          for (const p of partiesOf(data)) if (tracked.has(p) && p !== receiver) out.push({ account: p, ...ev });
        }
      });
    });
  }
  return out;
}
