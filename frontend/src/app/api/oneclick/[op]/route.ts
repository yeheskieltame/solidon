// /api/oneclick/tokens   GET   -> the 1Click token list (trimmed, cached 5 minutes)
// /api/oneclick/quote    POST  { originAsset, amount, recipient, refundTo?, dry } -> 1Click quote
// /api/oneclick/status   GET   ?depositAddress=  -> swap status
//
// A narrow proxy to NEAR Intents 1Click (https://1click.chaindefuser.com/v0): the destination is
// fixed to USDC on NEAR, so it cannot be used as an open relay. ONECLICK_JWT (optional,
// server-only) is sent as a bearer token; without it 1Click charges its default fee. Unless
// NEXT_PUBLIC_NETWORK=mainnet every quote is forced to dry: no deposit address, no swap.

import { connection, type NextRequest } from "next/server";

const API = "https://1click.chaindefuser.com/v0";
const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const LIVE = process.env.NEXT_PUBLIC_NETWORK === "mainnet";
const TOKENS_TTL_MS = 5 * 60_000;

type Token = { assetId: string; decimals: number; blockchain: string; symbol: string; price?: number; contractAddress?: string };
let tokensCache: { at: number; data: Token[] } | null = null;

function headers(): HeadersInit {
  const h: Record<string, string> = { "content-type": "application/json", "user-agent": "solidon-web" };
  const jwt = process.env.ONECLICK_JWT;
  if (jwt) h.authorization = `Bearer ${jwt}`;
  return h;
}

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Forwards a 1Click answer; errors become `{ error }` with 1Click's own message (never our internals). */
async function forward(res: Response): Promise<Response> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (res.ok) return Response.json(body);
  const message = (body as { message?: unknown } | null)?.message;
  return fail(typeof message === "string" ? message : `1Click answered HTTP ${res.status}`, res.status >= 500 ? 502 : res.status);
}

async function tokens(): Promise<Response> {
  if (tokensCache && Date.now() - tokensCache.at < TOKENS_TTL_MS) return Response.json(tokensCache.data);
  const res = await fetch(`${API}/tokens`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return forward(res);
  const list = (await res.json()) as Token[];
  const data = list.map(({ assetId, decimals, blockchain, symbol, price, contractAddress }) => ({
    assetId,
    decimals,
    blockchain,
    symbol,
    price,
    contractAddress,
  }));
  tokensCache = { at: Date.now(), data };
  return Response.json(data);
}

const ASSET = /^[A-Za-z0-9:._-]{3,200}$/;
const AMOUNT = /^[1-9]\d{0,39}$/;
const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const ADDRESS = /^[A-Za-z0-9:._-]{20,128}$/;

async function quote(req: NextRequest): Promise<Response> {
  let body: { originAsset?: unknown; amount?: unknown; recipient?: unknown; refundTo?: unknown; dry?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Send JSON: { originAsset, amount, recipient }.", 400);
  }
  const { originAsset, amount, recipient, refundTo } = body;
  if (typeof originAsset !== "string" || !ASSET.test(originAsset)) return fail("originAsset is not a 1Click asset id.", 400);
  if (typeof amount !== "string" || !AMOUNT.test(amount)) return fail("amount must be a positive integer in base units.", 400);
  if (typeof recipient !== "string" || recipient.length > 64 || !NEAR_ACCOUNT.test(recipient)) return fail("recipient must be a NEAR account.", 400);
  if (refundTo !== undefined && (typeof refundTo !== "string" || !ADDRESS.test(refundTo))) return fail("refundTo is not an address.", 400);
  // Off mainnet the receiving USDC is not the one the meme trades against: preview only.
  const dry = !LIVE || body.dry !== false;
  const upstream = {
    dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: USDC_NEAR,
    amount,
    // Refunds go back to the origin chain when the user gave an address there, else to their
    // NEAR account inside NEAR Intents (withdrawable from any Intents app).
    refundTo: refundTo ?? recipient,
    refundType: refundTo ? "ORIGIN_CHAIN" : "INTENTS",
    recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
    referral: "solidon",
  };
  const res = await fetch(`${API}/quote`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(upstream),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  return forward(res);
}

async function status(req: NextRequest): Promise<Response> {
  const address = req.nextUrl.searchParams.get("depositAddress") ?? "";
  if (!ADDRESS.test(address)) return fail("depositAddress is missing or malformed.", 400);
  const res = await fetch(`${API}/status?depositAddress=${encodeURIComponent(address)}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return forward(res);
}

async function guard(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error("oneclick: upstream failed", e instanceof Error ? e.name : typeof e);
    return fail(timeout ? "1Click took too long to answer. Try again." : "Could not reach 1Click. Try again in a minute.", 502);
  }
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/oneclick/[op]">) {
  await connection();
  const { op } = await ctx.params;
  if (op === "tokens") return guard(tokens);
  if (op === "status") return guard(() => status(req));
  return fail("Unknown 1Click operation.", 404);
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/oneclick/[op]">) {
  const { op } = await ctx.params;
  if (op === "quote") return guard(() => quote(req));
  return fail("Unknown 1Click operation.", 404);
}
