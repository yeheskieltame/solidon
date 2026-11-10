// POST /api/faucet  { accountId, memeId? }  ->  FaucetResult | { error }
// Gasless testnet faucet: no wallet signature, the server's faucet account pays.
// See src/lib/faucet-server.ts for the steps and the limits.

import type { NextRequest } from "next/server";
import { FaucetError, runFaucet } from "@/lib/faucet-server";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: NextRequest) {
  let body: { accountId?: unknown; memeId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send JSON: { \"accountId\": \"you.testnet\" }." }, { status: 400 });
  }
  if (typeof body.accountId !== "string" || (body.memeId != null && typeof body.memeId !== "string")) {
    return Response.json({ error: "accountId must be a string." }, { status: 400 });
  }
  try {
    const result = await runFaucet({
      accountId: body.accountId,
      memeId: typeof body.memeId === "string" ? body.memeId : undefined,
      ip: clientIp(req),
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof FaucetError) {
      return Response.json(
        { error: e.message },
        { status: e.status, headers: e.retryAfter ? { "retry-after": String(e.retryAfter) } : undefined },
      );
    }
    // Never echo internals: the message could come from the signer.
    console.error("faucet: unexpected error", e instanceof Error ? e.name : typeof e);
    return Response.json({ error: "The faucet failed unexpectedly. Try again in a minute." }, { status: 500 });
  }
}
