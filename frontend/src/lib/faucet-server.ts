// Server-only testnet faucet: the faucet account (FAUCET_ACCOUNT_ID / FAUCET_PRIVATE_KEY,
// read from the server environment, never sent to the browser) pays gas, NEAR and storage
// so a brand-new testnet account can trade without holding anything.
//
// Limits are in memory, per server instance: they reset on restart and are not shared
// between serverless instances. That is enough for a testnet demo; a public faucet would
// need a shared store (KV, Redis) and a captcha.

import "server-only";
import {
  Account,
  actions,
  JsonRpcProvider,
  KeyPairSigner,
  type KeyPairString,
} from "near-api-js";
import { FACTORY, FAUCET_USDC, NEAR_RPCS, NETWORK, USDC } from "./config";

const YOCTO = 10n ** 24n;
const TGAS = 10n ** 12n;

/** Top up when the account holds less than this. */
const MIN_NEAR = (3n * YOCTO) / 10n; // 0.3 NEAR
/** What a top-up sends. */
const DRIP_NEAR = YOCTO / 2n; // 0.5 NEAR
/** Refuse to pay more than this for one storage registration. */
const MAX_STORAGE = YOCTO / 100n; // 0.01 NEAR

const ACCOUNT_COOLDOWN_MS = 10 * 60_000;
const IP_WINDOW_MS = 60 * 60_000;
const IP_MAX = Number(process.env.FAUCET_IP_PER_HOUR || 6);
/** NEAR dripped per UTC day, all users together. */
const DAILY_NEAR_CAP = BigInt(Math.round(Number(process.env.FAUCET_DAILY_NEAR || 5) * 1000)) * (YOCTO / 1000n);

export class FaucetError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export type FaucetStep = { hash: string; detail: string };

export type FaucetResult = {
  accountId: string;
  /** The NEAR transfer created the account (implicit accounts). */
  created: boolean;
  near: (FaucetStep & { amount: string }) | null;
  usdc: FaucetStep & { amount: string };
  meme: (FaucetStep & { contract: string }) | null;
  /** Steps that were skipped, in words ("NEAR balance is already 1.2"). */
  notes: string[];
};

// --- Validation -----------------------------------------------------------------

const NAMED = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const IMPLICIT = /^[0-9a-f]{64}$/;

export function isValidAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && NAMED.test(id);
}

export const isImplicit = (id: string) => IMPLICIT.test(id);

// --- Rate limits ----------------------------------------------------------------

const lastByAccount = new Map<string, number>();
const hitsByIp = new Map<string, number[]>();
const inFlight = new Set<string>();
let day = "";
let drippedToday = 0n;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkLimits(accountId: string, ip: string, now: number) {
  if (inFlight.has(accountId)) throw new FaucetError("A faucet request for this account is already running.", 429, 30);
  const last = lastByAccount.get(accountId);
  if (last && now - last < ACCOUNT_COOLDOWN_MS) {
    const wait = Math.ceil((ACCOUNT_COOLDOWN_MS - (now - last)) / 1000);
    throw new FaucetError(
      `This account got test funds less than 10 minutes ago. Try again in ${Math.ceil(wait / 60)} min.`,
      429,
      wait,
    );
  }
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hitsByIp.set(ip, hits);
  if (hits.length >= IP_MAX) {
    const wait = Math.ceil((IP_WINDOW_MS - (now - hits[0])) / 1000);
    throw new FaucetError(`Too many faucet requests from your network. Try again in ${Math.ceil(wait / 60)} min.`, 429, wait);
  }
}

function record(accountId: string, ip: string, now: number) {
  lastByAccount.set(accountId, now);
  hitsByIp.set(ip, [...(hitsByIp.get(ip) ?? []), now]);
  // Keep the maps bounded.
  if (lastByAccount.size > 5000) {
    for (const [k, t] of lastByAccount) if (now - t > ACCOUNT_COOLDOWN_MS) lastByAccount.delete(k);
  }
}

// --- Chain access ----------------------------------------------------------------

let faucetAccount: Account | null = null;

function faucet(): Account {
  if (faucetAccount) return faucetAccount;
  const id = process.env.FAUCET_ACCOUNT_ID;
  const key = process.env.FAUCET_PRIVATE_KEY;
  if (!id || !key || !key.startsWith("ed25519:")) {
    throw new FaucetError("The faucet is not configured on this server.", 503);
  }
  const provider = new JsonRpcProvider({ url: NEAR_RPCS[0] });
  faucetAccount = new Account(id, provider, KeyPairSigner.fromSecretKey(key as KeyPairString));
  return faucetAccount;
}

/** One signer, one nonce sequence: run faucet jobs one after another. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function nearBalance(account: Account, accountId: string): Promise<bigint | null> {
  try {
    const v = await account.provider.viewAccount({ accountId });
    return BigInt(v.amount);
  } catch (e) {
    const name = e instanceof Error ? `${e.constructor.name} ${e.message}` : String(e);
    if (/AccountDoesNotExist|does not exist|UNKNOWN_ACCOUNT/i.test(name)) return null;
    throw new FaucetError("NEAR RPC is not answering. Try again in a minute.", 502);
  }
}

async function viewJson<T>(account: Account, contractId: string, method: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    return (await account.provider.callFunction({ contractId, method, args })) as T;
  } catch {
    return null;
  }
}

function hashOf(r: { transaction?: { hash?: string }; transaction_outcome?: { id?: string } }): string {
  return r.transaction?.hash ?? r.transaction_outcome?.id ?? "";
}

const fmtNear = (y: bigint) => (Number(y / 10n ** 21n) / 1000).toString();

function chainError(e: unknown, what: string): FaucetError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/NotEnoughBalance|LackBalanceForState|does not have enough balance/i.test(msg)) {
    return new FaucetError("The faucet itself is out of NEAR. Tell the Solidon team.", 503);
  }
  return new FaucetError(`${what} failed: ${msg.slice(0, 200)}`, 502);
}

// --- The faucet -------------------------------------------------------------------

export async function runFaucet(input: { accountId: string; memeId?: string; ip: string }): Promise<FaucetResult> {
  if (NETWORK !== "testnet") throw new FaucetError("The faucet only runs on testnet.", 403);
  const accountId = input.accountId.trim().toLowerCase();
  if (!isValidAccountId(accountId)) throw new FaucetError("That is not a valid NEAR account id.", 400);
  const memeId = input.memeId?.trim().toLowerCase() || undefined;
  if (memeId && (!isValidAccountId(memeId) || !memeId.endsWith(`.${FACTORY}`))) {
    throw new FaucetError(`memeId must be a meme launched on ${FACTORY}.`, 400);
  }

  const signer = faucet();
  const now = Date.now();
  checkLimits(accountId, input.ip, now);
  inFlight.add(accountId);
  try {
    return await serial(async () => {
      const notes: string[] = [];
      const balance = await nearBalance(signer, accountId);
      if (balance === null && !isImplicit(accountId)) {
        throw new FaucetError(`${accountId} does not exist on NEAR testnet. Create it in your wallet first.`, 404);
      }

      // 1. NEAR for gas (also creates an implicit account).
      let near: FaucetResult["near"] = null;
      if (balance === null || balance < MIN_NEAR) {
        if (today() !== day) {
          day = today();
          drippedToday = 0n;
        }
        if (drippedToday + DRIP_NEAR > DAILY_NEAR_CAP) {
          if (balance === null) throw new FaucetError("The faucet hit its daily NEAR limit. Try again tomorrow (UTC).", 429);
          notes.push("The daily NEAR limit is reached, so no NEAR was sent.");
        } else {
          try {
            const r = await signer.signAndSendTransaction({ receiverId: accountId, actions: [actions.transfer(DRIP_NEAR)] });
            drippedToday += DRIP_NEAR;
            near = { hash: hashOf(r), amount: DRIP_NEAR.toString(), detail: `Sent ${fmtNear(DRIP_NEAR)} NEAR for gas` };
          } catch (e) {
            throw chainError(e, "Sending NEAR");
          }
        }
      } else {
        notes.push(`NEAR balance is already ${fmtNear(balance)}, no top-up needed.`);
      }

      // 2. USDC: storage registration (paid by the faucet) and the mint, in one transaction.
      const usdcActions = [];
      const registered = await viewJson<object | null>(signer, USDC, "storage_balance_of", { account_id: accountId });
      if (!registered) {
        const bounds = await viewJson<{ min: string }>(signer, USDC, "storage_balance_bounds", {});
        const min = BigInt(bounds?.min ?? "1250000000000000000000");
        if (min > MAX_STORAGE) throw new FaucetError("USDC storage costs more than the faucet pays.", 502);
        usdcActions.push(
          actions.functionCall("storage_deposit", { account_id: accountId, registration_only: true }, 30n * TGAS, min),
        );
      }
      usdcActions.push(
        actions.functionCall("mint", { account_id: accountId, amount: FAUCET_USDC.toString() }, 30n * TGAS, 0n),
      );
      let usdc: FaucetResult["usdc"];
      try {
        const r = await signer.signAndSendTransaction({ receiverId: USDC, actions: usdcActions });
        usdc = { hash: hashOf(r), amount: FAUCET_USDC.toString(), detail: "Minted 1,000 test USDC" };
      } catch (e) {
        throw chainError(e, "Minting USDC");
      }

      // 3. Optional: storage on a meme token so the first buy cannot fail on storage.
      let meme: FaucetResult["meme"] = null;
      if (memeId) {
        const onMeme = await viewJson<object | null>(signer, memeId, "storage_balance_of", { account_id: accountId });
        const bounds = await viewJson<{ min: string }>(signer, memeId, "storage_balance_bounds", {});
        if (!bounds) {
          notes.push(`${memeId} is not a token, so no storage was paid there.`);
        } else if (onMeme) {
          notes.push(`Already registered on ${memeId}.`);
        } else if (BigInt(bounds.min) > MAX_STORAGE) {
          notes.push(`${memeId} storage costs more than the faucet pays.`);
        } else {
          try {
            const r = await signer.signAndSendTransaction({
              receiverId: memeId,
              actions: [
                actions.functionCall("storage_deposit", { account_id: accountId, registration_only: true }, 30n * TGAS, BigInt(bounds.min)),
              ],
            });
            meme = { hash: hashOf(r), contract: memeId, detail: `Registered on ${memeId}` };
          } catch (e) {
            notes.push(`Registering on ${memeId} failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
          }
        }
      }

      record(accountId, input.ip, now);
      return { accountId, created: balance === null && !!near, near, usdc, meme, notes };
    });
  } finally {
    inFlight.delete(accountId);
  }
}
