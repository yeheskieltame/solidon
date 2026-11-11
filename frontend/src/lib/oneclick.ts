// NEAR Intents 1Click, seen from the browser: every call goes through our own route handler
// (/api/oneclick/*, src/app/api/oneclick/[op]/route.ts), which talks to
// https://1click.chaindefuser.com/v0, keeps an optional JWT server-side and avoids CORS.
// The destination is always USDC on NEAR mainnet, the asset a Solidon buy is paid in.

import { NETWORK } from "./config";
import { fmtAmount, toNumber } from "./format";

/** USDC on NEAR mainnet (Circle's native USDC, the 1Click destination). */
export const ONECLICK_USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

/**
 * On testnet the meme trades against a mock USDC, so 1Click can only preview the mainnet route:
 * quotes are dry, no deposit address is requested and no swap starts. The server enforces this too.
 */
export const ONECLICK_LIVE = NETWORK === "mainnet";

export type OneClickToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  contractAddress?: string;
};

export type OneClickQuote = {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  minAmountOut: string;
  timeEstimate?: number;
  refundFee?: string;
  depositAddress?: string;
  depositMemo?: string;
  deadline?: string;
};

export type OneClickQuoteResponse = {
  quote: OneClickQuote;
  quoteRequest?: { appFees?: { fee: number }[]; refundType?: string; refundTo?: string; recipient?: string };
  timestamp?: string;
};

export type OneClickStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

/** Chain keys 1Click uses, with the name and logo key we show. */
export const ONECLICK_CHAINS: Record<string, { name: string; logo?: string }> = {
  sol: { name: "Solana", logo: "solana" },
  base: { name: "Base", logo: "base" },
  arb: { name: "Arbitrum", logo: "arbitrum" },
  btc: { name: "Bitcoin", logo: "bitcoin" },
  eth: { name: "Ethereum", logo: "ethereum" },
  near: { name: "NEAR", logo: "near" },
  bsc: { name: "BNB Chain" },
  pol: { name: "Polygon" },
  avax: { name: "Avalanche" },
  op: { name: "Optimism" },
  gnosis: { name: "Gnosis" },
  bera: { name: "Berachain" },
  tron: { name: "Tron" },
  ton: { name: "TON" },
  sui: { name: "Sui" },
  doge: { name: "Dogecoin" },
  xrp: { name: "XRP Ledger" },
  zec: { name: "Zcash" },
  ltc: { name: "Litecoin" },
  stellar: { name: "Stellar" },
  aptos: { name: "Aptos" },
  cardano: { name: "Cardano" },
};

export const chainName = (key: string) => ONECLICK_CHAINS[key]?.name ?? key.toUpperCase();

/** The short list shown first, in this order: (blockchain, symbol). */
export const CURATED: [string, string][] = [
  ["sol", "SOL"],
  ["base", "ETH"],
  ["arb", "ETH"],
  ["btc", "BTC"],
  ["base", "USDC"],
  ["sol", "USDC"],
  ["arb", "USDC"],
];

/** Logo for a pay-in asset: the token's own mark for the majors, else its chain's. */
export function assetLogoKey(t: Pick<OneClickToken, "symbol" | "blockchain">): string | undefined {
  if (t.symbol === "USDC") return "usdc";
  if (t.symbol === "BTC") return "bitcoin";
  if (t.symbol === "ETH") return "ethereum";
  if (t.symbol === "SOL") return "solana";
  return ONECLICK_CHAINS[t.blockchain]?.logo;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error || `The route service answered HTTP ${res.status}`);
  return body;
}

export async function fetchOneClickTokens(): Promise<OneClickToken[]> {
  return json<OneClickToken[]>(await fetch("/api/oneclick/tokens"));
}

export async function fetchOneClickQuote(
  req: { originAsset: string; amount: string; recipient: string; refundTo?: string; dry: boolean },
  signal?: AbortSignal,
): Promise<OneClickQuoteResponse> {
  return json<OneClickQuoteResponse>(
    await fetch("/api/oneclick/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    }),
  );
}

export async function fetchOneClickStatus(depositAddress: string): Promise<{ status: OneClickStatus }> {
  return json(await fetch(`/api/oneclick/status?depositAddress=${encodeURIComponent(depositAddress)}`, { cache: "no-store" }));
}

/** A NEAR mainnet account 1Click accepts as recipient: an implicit (64 hex) or a `.near` name. */
export function isMainnetRecipient(id: string | null | undefined): id is string {
  return !!id && (/^[0-9a-f]{64}$/.test(id) || /^([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*\.near$/.test(id) || id === "near");
}

/**
 * Plain wording for 1Click errors. Minimums arrive in base units ("try at least 150000"), so
 * they are turned back into the asset's own unit.
 */
export function friendlyQuoteError(message: string, token: OneClickToken | null): string {
  const min = /at least (\d+)/i.exec(message);
  if (min && token) {
    return `That is below the smallest amount this route takes: send at least ${fmtAmount(toNumber(BigInt(min[1]), token.decimals), 8)} ${token.symbol}.`;
  }
  const usd = /minimum swap amount is \$?([\d,.]+)/i.exec(message);
  if (usd) return `This route has a minimum of $${usd[1]} right now. Try a larger amount or another asset.`;
  if (/token(In|Out)? is not valid|not supported|unsupported/i.test(message)) {
    return `${token ? `${token.symbol} on ${chainName(token.blockchain)}` : "This asset"} cannot be routed to USDC on NEAR. Pick another asset.`;
  }
  if (/recipient/i.test(message)) return "1Click did not accept the receiving NEAR account.";
  if (/internal server error/i.test(message)) {
    return "1Click could not quote this pair right now. Try another amount or asset.";
  }
  if (/failed to fetch|network/i.test(message)) return "Could not reach the route service. Check your connection.";
  return message.length > 160 ? `${message.slice(0, 157)}…` : message;
}
