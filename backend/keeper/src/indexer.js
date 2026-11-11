// Indexer: price history and the event log of every meme, served by src/api.js. Read-only: it
// never signs. Two independent timers, so neither blocks the keeper's treasury loop:
//   snapshots  every SNAPSHOT_SECS: per meme get_pool + get_treasury + get_treasury_chains + the
//              oracle price -> one history point (src/history.js)
//   events     every INDEXER_POLL_SECS: the FastNear transactions API lists each tracked account's
//              transactions (`POST /v0/account`, newest first, resume_token pages); new ones are
//              fetched with every receipt and log (`POST /v0/transactions`, 20 per call) and their
//              EVENT_JSON logs stored (src/events.js). The first run walks every page (backfill
//              from the account's creation); `cursor.json` records the transactions done, so a
//              restart resumes. Why not neardata block-following: its free tier serves 30 blocks a
//              minute while testnet makes ~100 (measured, backend/README.md).
import { serve } from "./api.js";
import { eventsFromTx, txComplete } from "./events.js";
import { Holders } from "./holders.js";
import { snapshotOf } from "./history.js";
import { log, errMsg } from "./log.js";
import { sleep } from "./net.js";
import { Store } from "./store.js";
import { readMeme } from "./world.js";

const BATCH = 20; // FastNear: "Too many transactions requested. Limit is 20"
/** A transaction this many blocks old is stored even if a receipt outcome is missing. */
const STALE_BLOCKS = 1000;

/** FastNear tx API client: POST JSON, patient backoff on 429 / 5xx / network errors. */
export class TxApi {
  constructor(base, { minGapMs = 300 } = {}) {
    this.base = base.replace(/\/$/, "");
    this.minGapMs = minGapMs;
    this.last = 0;
    this.requests = 0;
  }

  async post(path, body, label = path) {
    let wait = 5_000;
    for (let attempt = 0; ; attempt++) {
      const gap = this.last + this.minGapMs - Date.now();
      if (gap > 0) await sleep(gap);
      this.last = Date.now();
      this.requests++;
      let res;
      try {
        res = await fetch(`${this.base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        res = { status: 0, error: e };
      }
      if (res.status === 200) return res.json();
      if (res.status && res.status !== 429 && res.status < 500) {
        const text = await res.text().catch(() => "");
        throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      if (attempt >= 7) throw new Error(`${label}: gave up after ${attempt + 1} tries (HTTP ${res.status || "network"})`);
      await sleep(wait);
      wait = Math.min(wait * 2, 60_000);
    }
  }
}

export class Indexer {
  /**
   * `cfg` from loadConfig, `near` a Near (views only). `memeFilter` limits the memes (--meme=).
   */
  constructor(cfg, near, { memeFilter = null, store = null } = {}) {
    this.cfg = cfg;
    this.near = near;
    this.ix = cfg.indexer;
    this.store = store ?? new Store(this.ix.dataDir);
    this.api = new TxApi(this.ix.txApi);
    this.memeFilter = memeFilter;
    this.holderBook = new Holders(near);
    this.memeList = [];
    this.meta = new Map();
    this.usdc = null;
    this.lastBlock = null;
    this.lastPollAt = null;
    this.lastSnapshotAt = null;
    this.lastCompact = 0;
    this.timers = [];
    this.stopped = false;
  }

  memes() {
    return this.memeList;
  }

  /** Holders of `meme` from live `ft_balance_of` views over its event parties (src/holders.js). */
  holders(meme, limit) {
    const creator = this.meta.get(meme)?.creator ?? null;
    return this.holderBook.get(meme, this.store.events.get(meme) ?? [], { creator, limit });
  }

  onHoldersError(meme, e) {
    log.warn("api", `holders of ${meme} failed: ${errMsg(e)}`);
  }

  health() {
    const now = Math.floor(Date.now() / 1000);
    const lag = this.lastPollAt === null ? null : now - this.lastPollAt;
    const tracked = [this.cfg.factory, ...this.memeList];
    return {
      ok: lag !== null && lag <= 3 * this.ix.pollSecs + 60,
      last_block: this.lastBlock,
      memes: this.memeList.length,
      lag_s: lag,
      events: [...this.store.events.values()].reduce((n, l) => n + l.length, 0),
      transactions: Object.keys(this.store.cursor.done).length,
      backfilled: tracked.filter((a) => this.store.cursor.backfilled[a]).length,
      tracked: tracked.length,
      last_snapshot: this.lastSnapshotAt,
    };
  }

  async discover() {
    const f = this.cfg.factory;
    const memes = [];
    for (let from = 0; ; from += 50) {
      const page = await this.near.view(f, "get_memes", { from_index: from, limit: 50 });
      memes.push(...page);
      if (page.length < 50) break;
    }
    this.memeList = memes.filter((m) => !this.memeFilter || this.memeFilter.includes(m));
    this.usdc ??= (await this.near.tryView(f, "get_usdc")) ?? `usdc.${f}`;
  }

  // --- snapshots ---------------------------------------------------------------------------

  async snapshotOnce() {
    await this.discover();
    const t = Math.floor(Date.now() / 1000);
    for (const id of this.memeList) {
      try {
        const [m, pool] = await Promise.all([readMeme(this.near, id), this.near.view(id, "get_pool")]);
        let price = m.price;
        let oracleStale = false;
        if (!price) {
          price = await this.near.tryView(m.info.oracle, "get_price_unsafe", { price_identifier: m.info.stock.price_id });
          oracleStale = !!price;
        }
        if (!this.meta.has(id)) {
          const md = await this.near.tryView(id, "ft_metadata").catch(() => null);
          this.meta.set(id, { symbol: md?.symbol ?? null, name: md?.name ?? null, creator: m.info.creator, ticker: m.info.stock.ticker });
        }
        this.store.addSnapshot(id, snapshotOf({ t, pool, treasury: m.treasury, tc: m.tc, price: price ?? null, oracleStale }));
      } catch (e) {
        log.error(`history:${id}`, `snapshot failed: ${errMsg(e)}`);
      }
    }
    if (t - this.lastCompact >= 3600) {
      this.store.compact(t);
      this.lastCompact = t;
    }
    this.lastSnapshotAt = t;
  }

  // --- events ------------------------------------------------------------------------------

  /** Transactions of `account` not indexed yet; `end` = the walk reached the oldest page. */
  async listNew(account) {
    const { done, backfilled } = this.store.cursor;
    const fresh = [];
    let token = null;
    for (;;) {
      const body = await this.api.post(
        "/v0/account",
        { account_id: account, limit: 200, ...(token ? { resume_token: token } : {}) },
        `tx api account ${account}`,
      );
      const txs = body.account_txs ?? [];
      let anyNew = false;
      for (const t of txs) {
        if (done[t.transaction_hash]) continue;
        fresh.push(t);
        anyNew = true;
      }
      if (!body.resume_token || !txs.length) return { fresh, end: true };
      if (backfilled[account] && !anyNew) return { fresh, end: false };
      token = body.resume_token;
    }
  }

  async pollOnce() {
    if (!this.memeList.length) await this.discover();
    const head = await this.near.blockHeight();
    const tracked = [this.cfg.factory, ...this.memeList];
    const trackedSet = new Set(tracked);
    const { cursor } = this.store;
    const pending = new Map(); // hash -> height
    const walked = [];
    for (const account of tracked) {
      try {
        const { fresh, end } = await this.listNew(account);
        for (const t of fresh) pending.set(t.transaction_hash, t.tx_block_height);
        walked.push({ account, end, n: fresh.length });
      } catch (e) {
        log.warn("indexer", `cannot list ${account} (retrying next poll): ${errMsg(e)}`);
      }
    }
    const hashes = [...pending.keys()].sort((a, b) => pending.get(a) - pending.get(b)); // oldest first
    let deferred = 0;
    let failed = 0;
    let added = 0;
    for (let i = 0; i < hashes.length && !this.stopped; i += BATCH) {
      const batch = hashes.slice(i, i + BATCH);
      let txs;
      try {
        txs = (await this.api.post("/v0/transactions", { tx_hashes: batch }, "tx api transactions")).transactions ?? [];
      } catch (e) {
        failed += batch.length;
        log.warn("indexer", `cannot fetch ${batch.length} transaction(s): ${errMsg(e)}`);
        continue;
      }
      const got = new Map(txs.filter(Boolean).map((tx) => [tx.transaction?.hash, tx]));
      for (const h of batch) {
        const tx = got.get(h);
        if (!tx || (!txComplete(tx) && pending.get(h) > head - STALE_BLOCKS)) {
          deferred++;
          continue;
        }
        added += this.store.addEvents(eventsFromTx(tx, { tracked: trackedSet, usdc: this.usdc }));
        cursor.done[h] = pending.get(h);
      }
      this.store.saveCursor();
    }
    if (!deferred && !failed) {
      for (const w of walked) if (w.end && !cursor.backfilled[w.account]) {
        cursor.backfilled[w.account] = true;
        log.info("indexer", `backfill of ${w.account} complete`);
      }
    }
    this.store.saveCursor();
    this.lastBlock = head;
    this.lastPollAt = Math.floor(Date.now() / 1000);
    if (hashes.length || added) {
      log.info("indexer", `indexed ${hashes.length - deferred - failed} transaction(s), ${added} event(s)`, {
        deferred: deferred || undefined,
        failed: failed || undefined,
        block: head,
      });
    }
  }

  // --- timers ------------------------------------------------------------------------------

  loop(name, secs, fn) {
    const run = async () => {
      if (this.stopped) return;
      const t0 = Date.now();
      try {
        await fn();
      } catch (e) {
        log.error("indexer", `${name} failed: ${errMsg(e)}`);
      }
      if (!this.stopped) this.timers.push(setTimeout(run, Math.max(1000, secs * 1000 - (Date.now() - t0))));
    };
    this.timers.push(setTimeout(run, 0));
  }

  start() {
    this.loop("snapshot", this.ix.snapshotSecs, () => this.snapshotOnce());
    this.loop("events", this.ix.pollSecs, () => this.pollOnce());
    return this;
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
  }
}

/** Starts the indexer and the HTTP API on `cfg.indexer.port`; returns `{ indexer, stop }`. */
export function startReadService(cfg, near, { memeFilter = null } = {}) {
  const indexer = new Indexer(cfg, near, { memeFilter }).start();
  const server = serve(indexer, cfg.indexer.port, (e) => log.error("api", `cannot listen on ${cfg.indexer.port}: ${errMsg(e)}`));
  log.info("api", `read API on http://localhost:${cfg.indexer.port}`, {
    data: cfg.indexer.dataDir,
    tx_api: new URL(cfg.indexer.txApi).host,
  });
  return {
    indexer,
    stop: () => {
      indexer.stop();
      server.close();
      server.closeAllConnections?.();
    },
  };
}
