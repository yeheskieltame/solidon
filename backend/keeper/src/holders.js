// Holders of a meme: every account its indexed events name (buyers, sellers, seeders, NEP-141
// transfer parties, the creator) is asked `ft_balance_of`; non-zero balances are ranked. The meme
// contract's own balance is its pool reserve and is reported apart. Views are cached per meme for
// CACHE_MS and run at most CONCURRENCY at a time (the public RPC answers -429 when pushed).
import { partiesOf } from "./events.js";
import { sleep } from "./net.js";

const CACHE_MS = 60_000;
const CONCURRENCY = 3;

/** Accounts worth asking for a balance: event parties, signers and `extra`, minus the meme. */
export function holderCandidates(events, meme, extra = []) {
  const out = new Set(extra.filter(Boolean));
  for (const ev of events) {
    for (const p of partiesOf(ev.data)) out.add(p);
    if (ev.signer) out.add(ev.signer);
  }
  out.delete(meme);
  return [...out].sort();
}

/**
 * `balances` [{ account, balance }] (raw strings) -> non-zero holders, biggest first, each with
 * `share` = balance / totalSupply (null when the supply is unknown or zero).
 */
export function rankHolders(balances, totalSupply, limit = Infinity) {
  const supply = totalSupply ? BigInt(totalSupply) : 0n;
  return balances
    .map(({ account, balance }) => ({ account, raw: BigInt(balance ?? 0) }))
    .filter((h) => h.raw > 0n)
    .sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : a.account.localeCompare(b.account)))
    .slice(0, limit)
    .map(({ account, raw }) => ({
      account,
      balance: raw.toString(),
      share: supply > 0n ? Number((raw * 1_000_000n) / supply) / 1_000_000 : null,
    }));
}

/** `fn()` with up to 3 more tries 2 s, 4 s, 8 s apart: the RPC's -429 comes back as a JSON-RPC error. */
async function retry(fn, tries = 4, baseMs = 2_000) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(baseMs * 2 ** i);
    }
  }
}

/** Runs `fn` over `items` with at most `n` in flight; results in input order. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export class Holders {
  /** `near` a Near (views only); `now` injectable for tests. */
  constructor(near, { now = Date.now, retryMs = 2_000 } = {}) {
    this.near = near;
    this.retryMs = retryMs;
    this.now = now;
    this.cache = new Map(); // meme -> { at, promise }
  }

  /** Full holder list of `meme` (cached), `limit` applied on the way out. */
  async get(meme, events, { creator = null, limit = 50 } = {}) {
    let hit = this.cache.get(meme);
    if (!hit || this.now() - hit.at > CACHE_MS) {
      hit = { at: this.now(), promise: this.load(meme, events, creator) };
      this.cache.set(meme, hit);
      hit.promise.catch(() => this.cache.get(meme) === hit && this.cache.delete(meme));
    }
    const r = await hit.promise;
    return { ...r, holders: r.holders.slice(0, limit) };
  }

  async load(meme, events, creator) {
    const view = (method, args) => retry(() => this.near.view(meme, method, args), 4, this.retryMs);
    const totalSupply = await view("ft_total_supply");
    const pool = await view("get_pool").catch(() => null);
    const accounts = holderCandidates(events, meme, [creator]);
    const balances = await mapLimit(accounts, CONCURRENCY, async (account) => ({
      account,
      balance: await view("ft_balance_of", { account_id: account }),
    }));
    return {
      meme,
      holders: rankHolders(balances, totalSupply),
      pool_reserve: pool?.meme_reserve ?? null,
      total_supply: totalSupply,
      updated_at: Math.floor(this.now() / 1000),
    };
  }
}
