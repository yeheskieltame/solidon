// HTTP + JSON-RPC with retries. The maintainer's ISP resets connections, so every network error,
// HTTP 429 and 5xx is retried with exponential backoff. Errors carry a label, never the URL
// (Alchemy URLs contain the API key).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RpcError extends Error {
  constructor(message, data) {
    super(message);
    this.data = data;
  }
}

async function withRetry(label, fn, { tries = 6, baseMs = 500 } = {}) {
  let last;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RpcError) throw e; // a real answer from the server: retrying won't change it
      last = e;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw new Error(`${label}: network failure after ${tries} tries (${last?.cause?.code ?? last?.name ?? last})`);
}

async function fetchJson(url, init, label) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
  const body = await res.json().catch(() => null);
  if (body === null) throw new RpcError(`${label}: HTTP ${res.status}, not JSON`);
  return { status: res.status, body };
}

/** JSON-RPC 2.0 call; returns `result` or throws RpcError with the server's message. */
export async function jsonRpc(url, method, params, label = method) {
  return withRetry(label, async () => {
    const { body } = await fetchJson(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      },
      label,
    );
    if (body.error) {
      const e = body.error;
      const why = e.data?.message ?? e.cause?.name ?? e.message ?? JSON.stringify(e);
      throw new RpcError(`${label}: ${String(why).slice(0, 300)}`, e);
    }
    return body.result;
  });
}

/** GET returning JSON; non-2xx answers throw RpcError (not retried unless 429/5xx). */
export async function getJson(url, headers = {}, label = "GET") {
  return withRetry(label, async () => {
    const { status, body } = await fetchJson(url, { headers }, label);
    if (status >= 300) throw new RpcError(`${label}: HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
    return body;
  });
}
