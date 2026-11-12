// POST /api/rpc/<base|robinhood|solana>   one JSON-RPC request -> the chain's answer
//
// A read-only proxy for the treasury balance checks (lib/chains.ts readOnChain): some networks
// cannot reach a chain's public RPC (an ISP blocks *.robinhood.com), so the browser asks this
// server instead. Only the two reads the checks make are forwarded: ERC-20 balanceOf through
// eth_call, and getTokenAccountsByOwner on Solana. Upstream URLs are server-only:
// <CHAIN>_RPC_URL, else an Alchemy URL from ALCHEMY_API_KEY, else the public endpoint.
// Successful answers are kept 15 s in memory; errors never are.

import type { NextRequest } from "next/server";

type Chain = { env: string; alchemy: string; public: string; methods: Set<string> };

const CHAINS: Record<string, Chain> = {
  base: { env: "BASE_RPC_URL", alchemy: "base-sepolia", public: "https://sepolia.base.org", methods: new Set(["eth_call"]) },
  robinhood: {
    env: "ROBINHOOD_RPC_URL",
    alchemy: "robinhood-testnet",
    public: "https://rpc.testnet.chain.robinhood.com",
    methods: new Set(["eth_call"]),
  },
  solana: {
    env: "SOLANA_RPC_URL",
    alchemy: "solana-devnet",
    public: "https://api.devnet.solana.com",
    methods: new Set(["getTokenAccountsByOwner"]),
  },
};

const MAX_BODY = 2_048;
const TIMEOUT_MS = 8_000;
const TTL_MS = 15_000;
const BALANCE_OF = /^0x70a08231[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const cache = new Map<string, { at: number; body: string }>();

function upstream(c: Chain): string {
  const explicit = process.env[c.env];
  if (explicit) return explicit;
  const key = process.env.ALCHEMY_API_KEY;
  return key ? `https://${c.alchemy}.g.alchemy.com/v2/${key}` : c.public;
}

const fail = (message: string, status: number) =>
  Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32600, message } }, { status, headers: { "cache-control": "no-store" } });

/** True when the params are exactly the read lib/chains.ts makes for this method. */
function allowedParams(method: string, params: unknown): boolean {
  if (!Array.isArray(params)) return false;
  if (method === "eth_call") {
    const [call, block] = params as [{ to?: unknown; data?: unknown } | undefined, unknown];
    return (
      params.length === 2 &&
      block === "latest" &&
      typeof call?.to === "string" &&
      ADDRESS.test(call.to) &&
      typeof call.data === "string" &&
      BALANCE_OF.test(call.data)
    );
  }
  if (method === "getTokenAccountsByOwner") {
    const [owner, filter] = params as [unknown, { mint?: unknown } | undefined];
    return typeof owner === "string" && BASE58.test(owner) && typeof filter?.mint === "string" && BASE58.test(filter.mint);
  }
  return false;
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rpc/[chain]">) {
  const { chain } = await ctx.params;
  const c = CHAINS[chain];
  if (!c) return fail("Unknown chain.", 404);

  const text = await req.text();
  if (text.length > MAX_BODY) return fail("Request too large.", 413);
  let body: { method?: unknown; params?: unknown; id?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail("Send one JSON-RPC request.", 400);
  }
  const method = typeof body?.method === "string" ? body.method : "";
  if (!c.methods.has(method) || !allowedParams(method, body.params)) return fail("Only treasury balance reads are proxied.", 403);

  const key = `${chain}:${method}:${JSON.stringify(body.params)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return new Response(hit.body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }

  try {
    const res = await fetch(upstream(c), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: body.id ?? 1, method, params: body.params }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = await res.text();
    if (!res.ok) return fail(`The ${chain} RPC answered HTTP ${res.status}.`, 502);
    let parsed: { result?: unknown; error?: unknown };
    try {
      parsed = JSON.parse(out);
    } catch {
      return fail(`The ${chain} RPC did not answer JSON.`, 502);
    }
    if (parsed.error === undefined && parsed.result !== undefined) {
      if (cache.size > 500) cache.clear();
      cache.set(key, { at: Date.now(), body: out });
    }
    return new Response(out, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error(`rpc proxy: ${chain} upstream failed`, e instanceof Error ? e.name : typeof e);
    return fail(timeout ? `The ${chain} RPC took too long.` : `Could not reach the ${chain} RPC.`, 502);
  }
}
