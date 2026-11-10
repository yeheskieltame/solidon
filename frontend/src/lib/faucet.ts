// Browser side of the gasless faucet (src/app/api/faucet/route.ts). No wallet signature:
// the server's faucet account pays NEAR for gas, USDC storage and the 1,000 USDC mint.

import type { FaucetResult } from "./faucet-server";

export type { FaucetResult };

export const FAUCET_LINE = "Free testnet NEAR for gas + 1,000 test USDC";

export async function requestFaucet(accountId: string, memeId?: string): Promise<FaucetResult> {
  let res: Response;
  try {
    res = await fetch("/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId, memeId }),
    });
  } catch {
    throw new Error("Could not reach the faucet. Check your connection.");
  }
  const json = (await res.json().catch(() => null)) as (FaucetResult & { error?: string }) | null;
  if (!res.ok || !json || json.error) throw new Error(json?.error ?? `The faucet answered HTTP ${res.status}`);
  return json;
}
