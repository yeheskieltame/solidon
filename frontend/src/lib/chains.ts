// Treasury chains: display metadata, normalisation of `get_treasury_chains`, and
// balance reads straight from each chain's public RPC in the browser.

import { toBig } from "./format";
import type { ChainViewRaw, Stock, TreasuryChainsRaw } from "./near";
import { TESTNET_VENUES } from "./venues";

export type ChainKind = "evm" | "solana";

export type ChainMeta = {
  key: string;
  label: string;
  kind: ChainKind;
  chainId?: number;
  rpc: string;
  explorer: (kind: "address" | "token" | "tx", id: string) => string;
  /** USDC on this chain when the contract view does not say. */
  usdc: string;
  usdcDecimals: number;
  /** Holdings proof path, from SPEC "Trust assumptions". */
  proof: string;
};

const BASE_SEPOLIA: ChainMeta = {
  key: "base",
  label: "Base Sepolia",
  kind: "evm",
  chainId: 84532,
  rpc: process.env.NEXT_PUBLIC_BASE_RPC || "https://sepolia.base.org",
  explorer: (k, id) => `https://sepolia.basescan.org/${k === "tx" ? "tx" : k}/${id}`,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdcDecimals: 6,
  proof: "MPC can verify Base logs: holdings proof planned.",
};

const HOOD_TESTNET: ChainMeta = {
  key: "robinhood",
  label: "Robinhood Chain testnet",
  kind: "evm",
  chainId: 46630,
  rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.testnet.chain.robinhood.com",
  explorer: (k, id) =>
    `https://explorer.testnet.chain.robinhood.com/${k === "tx" ? "tx" : k}/${id}`,
  usdc: "0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F",
  usdcDecimals: 18,
  proof: "Relayer-reported. MPC has no proof path for Robinhood Chain yet.",
};

const SOLANA_DEVNET: ChainMeta = {
  key: "solana",
  label: "Solana devnet",
  kind: "solana",
  rpc: process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com",
  explorer: (k, id) =>
    `https://explorer.solana.com/${k === "token" ? "address" : k}/${id}?cluster=devnet`,
  usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  usdcDecimals: 6,
  proof: "MPC can verify Solana account state: holdings proof planned.",
};

export const KNOWN_CHAINS = [BASE_SEPOLIA, HOOD_TESTNET, SOLANA_DEVNET];

export function chainMeta(name: string | undefined, chainId?: number): ChainMeta | null {
  const n = (name || "").toLowerCase();
  return (
    KNOWN_CHAINS.find(
      (c) =>
        (chainId !== undefined && c.chainId === chainId) ||
        c.key === n ||
        (n.includes("hood") && c.key === "robinhood") ||
        (n.includes("sol") && c.key === "solana") ||
        (n.includes("base") && c.key === "base"),
    ) ?? null
  );
}

/** One treasury chain, ready to render. Any field may be missing on older contracts. */
export type TreasuryChain = {
  key: string;
  meta: ChainMeta;
  /** Treasury address on this chain; null until `init_treasury` ran. */
  address: string | null;
  stockToken: string | null;
  stockSymbol: string | null;
  stockDecimals: number;
  usdcToken: string;
  usdcDecimals: number;
  /** From the contract ledger; null if the contract does not track this chain. */
  ledgerUsdc: bigint | null;
  ledgerStock: bigint | null;
  approved: boolean | null;
  nonce: number | null;
  /** True when the venue came from the frontend's registry, not the contract. */
  venueFromRegistry: boolean;
};

function fromRegistry(ticker: string | undefined, key: string) {
  const r = ticker ? TESTNET_VENUES[ticker] : undefined;
  return (r?.[key as "base" | "robinhood" | "solana"] as
    | { token: string; symbol: string; decimals: number }
    | undefined) ?? null;
}

function normaliseOne(
  raw: ChainViewRaw,
  sharedAddress: string | null,
  ticker: string | undefined,
): TreasuryChain | null {
  const name = raw.config?.name ?? raw.name ?? raw.chain;
  const meta = chainMeta(name, raw.config?.chain_id);
  if (!meta) return null;
  const reg = fromRegistry(ticker, meta.key);
  const venue = raw.venue ?? null;
  return {
    key: meta.key,
    meta,
    address: (raw.address as string | undefined) ?? sharedAddress,
    stockToken: venue?.token ?? reg?.token ?? null,
    stockSymbol:
      reg && (!venue || reg.token.toLowerCase() === venue.token.toLowerCase())
        ? reg.symbol
        : null,
    stockDecimals: venue?.decimals ?? reg?.decimals ?? 18,
    usdcToken: raw.config?.usdc ?? meta.usdc,
    usdcDecimals: raw.config?.usdc_decimals ?? meta.usdcDecimals,
    ledgerUsdc: raw.usdc !== undefined ? toBig(raw.usdc) : null,
    ledgerStock: raw.stock !== undefined ? toBig(raw.stock) : null,
    approved: typeof raw.approved === "boolean" ? raw.approved : null,
    nonce: typeof raw.nonce === "number" ? raw.nonce : null,
    venueFromRegistry: !venue && !!reg,
  };
}

/**
 * Turns whatever `get_treasury_chains` returned (or null on an older contract) into
 * one row per treasury chain: Base Sepolia, Robinhood Chain testnet, Solana devnet.
 */
export function normaliseTreasury(
  raw: TreasuryChainsRaw | null,
  stock: Stock | null,
): TreasuryChain[] {
  const ticker = stock?.ticker;
  const evmAddress = raw?.address ?? raw?.evm_address ?? null;
  const out: TreasuryChain[] = [];
  for (const c of raw?.chains ?? []) {
    const n = normaliseOne(c, c.config?.name?.toLowerCase().includes("sol") ? null : evmAddress, ticker);
    if (n && !out.some((o) => o.key === n.key)) out.push(n);
  }
  if (raw?.solana && !out.some((o) => o.key === "solana")) {
    const n = normaliseOne({ name: "solana", ...raw.solana }, raw.solana_address ?? null, ticker);
    if (n) out.push(n);
  }
  // Chains the contract does not report yet still get a row, with the registry venue.
  for (const meta of KNOWN_CHAINS) {
    if (out.some((o) => o.key === meta.key)) continue;
    const reg = fromRegistry(ticker, meta.key);
    const address =
      meta.kind === "solana" ? raw?.solana_address ?? null : evmAddress;
    out.push({
      key: meta.key,
      meta,
      address,
      stockToken: reg?.token ?? null,
      stockSymbol: reg?.symbol ?? null,
      stockDecimals: reg?.decimals ?? 18,
      usdcToken: meta.usdc,
      usdcDecimals: meta.usdcDecimals,
      ledgerUsdc: null,
      ledgerStock: null,
      approved: null,
      nonce: null,
      venueFromRegistry: !!reg,
    });
  }
  return out;
}

/** Ledger holdings per chain for the NAV estimate. On older contracts without the
 * per-chain view, falls back to `stock_units` (18 decimals) from `get_treasury`. */
export function ledgerHoldings(chains: TreasuryChain[], stockUnits18: string | undefined) {
  const tracked = chains.filter((c) => c.ledgerUsdc !== null || c.ledgerStock !== null);
  if (tracked.length === 0) {
    return [{ usdcRaw: 0n, usdcDecimals: 6, stockRaw: toBig(stockUnits18), stockDecimals: 18 }];
  }
  return tracked.map((c) => ({
    usdcRaw: c.ledgerUsdc ?? 0n,
    usdcDecimals: c.usdcDecimals,
    stockRaw: c.ledgerStock ?? 0n,
    stockDecimals: c.stockDecimals,
  }));
}

// --- On-chain reads -----------------------------------------------------------

async function jsonRpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result;
}

/** ERC-20 `balanceOf(owner)` through `eth_call`. */
export async function erc20Balance(rpc: string, token: string, owner: string): Promise<bigint> {
  const data = "0x70a08231" + owner.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const result = (await jsonRpc(rpc, "eth_call", [{ to: token, data }, "latest"])) as string;
  return result && result !== "0x" ? BigInt(result) : 0n;
}

type SolTokenAccounts = {
  value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[];
};

/** Sum of every token account of `owner` for `mint` (SPL Token or Token-2022). */
export async function splBalance(rpc: string, mint: string, owner: string): Promise<bigint> {
  const r = (await jsonRpc(rpc, "getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ])) as SolTokenAccounts;
  return r.value.reduce(
    (sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount),
    0n,
  );
}

export type OnChainBalance = { usdc: bigint | null; stock: bigint | null; error: string | null };

/** Reads the treasury's real USDC and stock balance on one chain. Never throws. */
export async function readOnChain(c: TreasuryChain): Promise<OnChainBalance> {
  if (!c.address) return { usdc: null, stock: null, error: null };
  const read = c.meta.kind === "solana" ? splBalance : erc20Balance;
  const [usdc, stock] = await Promise.allSettled([
    read(c.meta.rpc, c.usdcToken, c.address),
    c.stockToken ? read(c.meta.rpc, c.stockToken, c.address) : Promise.resolve(null),
  ]);
  const err = [usdc, stock].find((r) => r.status === "rejected") as
    | PromiseRejectedResult
    | undefined;
  return {
    usdc: usdc.status === "fulfilled" ? usdc.value : null,
    stock: stock.status === "fulfilled" ? stock.value : null,
    error: err ? `${c.meta.label} RPC: ${err.reason instanceof Error ? err.reason.message : "unreachable"}` : null,
  };
}
