// Read-only NEAR access: JSON-RPC `call_function` view calls with endpoint fallback,
// plus the JSON shapes of the factory and meme views (contracts/factory, contracts/meme).
// Every view either returns data or throws a ViewError with a readable message.

import { FACTORY, NEAR_RPCS } from "./config";

export class ViewError extends Error {
  /** True when the contract has no such method (older deployed code). */
  readonly missingMethod: boolean;
  constructor(message: string, missingMethod = false) {
    super(message);
    this.missingMethod = missingMethod;
  }
}

function encodeArgs(args: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** Endpoints that just failed (rate limit, outage) go to the back of the line for 30 s. */
const benched = new Map<string, number>();
const BENCH_MS = 30_000;

function endpoints(): string[] {
  const now = Date.now();
  const ok = NEAR_RPCS.filter((u) => (benched.get(u) ?? 0) <= now);
  return [...ok, ...NEAR_RPCS.filter((u) => !ok.includes(u))];
}

async function rpc(body: object): Promise<unknown> {
  let last: unknown;
  for (const url of endpoints()) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
      const json = await res.json();
      benched.delete(url);
      return json;
    } catch (e) {
      last = e;
      benched.set(url, Date.now() + BENCH_MS);
    }
  }
  throw new ViewError(
    `NEAR RPC unreachable (${last instanceof Error ? last.message : "network error"})`,
  );
}

type QueryResponse = {
  result?: { result?: number[]; error?: string };
  error?: { message?: string; data?: unknown; cause?: { name?: string } };
};

export async function view<T>(
  contract: string,
  method: string,
  args: object = {},
): Promise<T> {
  const r = (await rpc({
    jsonrpc: "2.0",
    id: "solidon",
    method: "query",
    params: {
      request_type: "call_function",
      finality: "optimistic",
      account_id: contract,
      method_name: method,
      args_base64: encodeArgs(args),
    },
  })) as QueryResponse;
  if (r.error) {
    const detail = JSON.stringify(r.error.data ?? r.error.cause ?? r.error.message);
    if (detail.includes("UNKNOWN_ACCOUNT") || detail.includes("does not exist")) {
      throw new ViewError(`${contract} does not exist on this network`);
    }
    if (detail.includes("CodeDoesNotExist") || detail.includes("NO_CONTRACT_CODE")) {
      throw new ViewError(`${contract} has no contract deployed`);
    }
    if (detail.includes("MethodNotFound")) {
      throw new ViewError(`${contract} has no ${method}() view`, true);
    }
    throw new ViewError(`${method}() failed: ${detail.slice(0, 200)}`);
  }
  const res = r.result;
  if (res?.error) {
    const missing = res.error.includes("MethodNotFound");
    throw new ViewError(
      missing ? `${contract} has no ${method}() view` : `${method}() failed: ${res.error}`,
      missing,
    );
  }
  if (!res?.result) throw new ViewError(`${method}() returned nothing`);
  const text = new TextDecoder().decode(new Uint8Array(res.result));
  return JSON.parse(text) as T;
}

/**
 * Liquid NEAR of an account in yoctoNEAR: 0n when the account does not exist yet (a fresh
 * implicit account), null when the RPC is unreachable.
 */
export async function nearBalance(accountId: string): Promise<bigint | null> {
  try {
    const r = (await rpc({
      jsonrpc: "2.0",
      id: "solidon",
      method: "query",
      params: { request_type: "view_account", finality: "optimistic", account_id: accountId },
    })) as { result?: { amount?: string }; error?: unknown };
    if (r.result?.amount) return BigInt(r.result.amount);
    return JSON.stringify(r.error ?? "").match(/UNKNOWN_ACCOUNT|does not exist/) ? 0n : null;
  } catch {
    return null;
  }
}

/** Like `view`, but resolves to `null` instead of throwing. */
export async function tryView<T>(
  contract: string,
  method: string,
  args: object = {},
): Promise<T | null> {
  try {
    return await view<T>(contract, method, args);
  } catch {
    return null;
  }
}

// --- View shapes ------------------------------------------------------------

export type Venue = { chain: string; token: string; decimals: number };

/**
 * A listed stock. The current contracts list `venues`; the first testnet factory
 * (BSC era) returned `bsc_token` + `decimals` instead, so both are optional.
 */
export type Stock = {
  ticker: string;
  price_id: string;
  venues?: Venue[];
  bsc_token?: string;
  decimals?: number;
};

export type MemeInfo = {
  creator: string;
  usdc: string;
  oracle: string;
  stock: Stock;
};

export type FtMetadata = {
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
};

export type PoolView = {
  meme_reserve: string;
  usdc_reserve: string;
  treasury_usdc: string;
  /** USDC raw per meme raw, scaled by 1e30. */
  spot_price: string;
  twap_price: string | null;
};

export type TreasuryView = {
  stock_units: string;
  treasury_usdc: string;
  circulating: string;
  redemption_open: boolean;
  last_rebalance: number;
  next_rebalance: number;
  last_nav: string;
  last_mnav_bps: string;
  epoch_cap: string;
  epoch_issued: string;
};

export type Params = {
  pool_fee_bps: number;
  treasury_fee_bps: number;
  creator_fee_bps: number;
  issuance_mnav_bps: number;
  max_issuance_bps_per_epoch: number;
  epoch_secs: number;
  buyback_mnav_bps: number;
  redemption_mnav_bps: number;
  cash_buffer_bps: number;
  cash_refill_bps: number;
  twap_window_secs: number;
  oracle_max_age_secs: number;
  rebalance_cooldown_secs: number;
  caller_tip_bps: number;
  target_leverage_bps: number;
};

/** SPEC defaults, used when `get_params` is unavailable. */
export const DEFAULT_PARAMS: Params = {
  pool_fee_bps: 100,
  treasury_fee_bps: 80,
  creator_fee_bps: 20,
  issuance_mnav_bps: 20_000,
  max_issuance_bps_per_epoch: 100,
  epoch_secs: 86_400,
  buyback_mnav_bps: 10_000,
  redemption_mnav_bps: 9_000,
  cash_buffer_bps: 2_000,
  cash_refill_bps: 1_000,
  twap_window_secs: 1_800,
  oracle_max_age_secs: 900,
  rebalance_cooldown_secs: 3_600,
  caller_tip_bps: 5,
  target_leverage_bps: 10_000,
};

/** `get_treasury_chains`. Fields beyond the EVM ones are optional: Solana and
 * holdings proofs are landing in later contract versions. */
export type ChainViewRaw = {
  config?: {
    name?: string;
    chain_id?: number;
    usdc?: string;
    usdc_decimals?: number;
    swap_router?: string;
    max_swap_usdc?: string;
    [k: string]: unknown;
  };
  name?: string;
  chain?: string;
  address?: string | null;
  venue?: Venue | null;
  nonce?: number;
  approved?: boolean;
  usdc?: string;
  stock?: string;
  [k: string]: unknown;
};

export type TreasuryChainsRaw = {
  address?: string | null;
  evm_address?: string | null;
  solana_address?: string | null;
  solana?: (ChainViewRaw & { address?: string | null }) | null;
  mpc?: string;
  signing?: boolean;
  chains?: ChainViewRaw[];
  [k: string]: unknown;
};

export type PythPrice = {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
};

export type StorageBalance = { total: string; available: string };

// --- Factory ------------------------------------------------------------------

export const factory = {
  memes: (from_index = 0, limit = 100) =>
    view<string[]>(FACTORY, "get_memes", { from_index, limit }),
  stocks: () => view<Stock[]>(FACTORY, "get_stocks"),
  launchCost: () => view<string>(FACTORY, "launch_cost"),
};

export type TxResult = {
  /** Logs written by `executor`, in receipt order. */
  logs: string[];
  /** JSON return values of `executor`'s receipts (undecodable ones skipped). */
  values: unknown[];
  /** The first failure in the receipts, as the RPC words it; null when none failed. */
  failure: string | null;
};

/**
 * What one contract did in a transaction, from its final receipts (`tx` RPC, which waits for
 * finality). Null when the RPC does not know the transaction (yet) or is unreachable.
 */
export async function txResult(txHash: string, sender: string, executor: string): Promise<TxResult | null> {
  type Outcome = { executor_id?: string; logs?: string[]; status?: { SuccessValue?: string; Failure?: unknown } };
  try {
    const r = (await rpc({
      jsonrpc: "2.0",
      id: "solidon",
      method: "tx",
      params: { tx_hash: txHash, sender_account_id: sender, wait_until: "FINAL" },
    })) as { result?: { receipts_outcome?: { outcome?: Outcome }[] } };
    const receipts = r.result?.receipts_outcome?.map((x) => x.outcome ?? {});
    if (!receipts) return null;
    const mine = receipts.filter((o) => o.executor_id === executor);
    const values: unknown[] = [];
    for (const o of mine) {
      const v = o.status?.SuccessValue;
      if (!v) continue;
      try {
        values.push(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v), (ch) => ch.charCodeAt(0)))));
      } catch {
        /* not JSON */
      }
    }
    const failed = receipts.find((o) => o.status?.Failure !== undefined);
    return {
      logs: mine.flatMap((o) => o.logs ?? []),
      values,
      failure: failed ? JSON.stringify(failed.status?.Failure).slice(0, 300) : null,
    };
  } catch {
    return null;
  }
}

/** Stock price from the meme's oracle, without the staleness check the contract applies. */
export async function oraclePrice(oracle: string, priceId: string): Promise<PythPrice | null> {
  return tryView<PythPrice | null>(oracle, "get_price_unsafe", {
    price_identifier: priceId,
  });
}
