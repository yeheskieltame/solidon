// Indexer: event extraction from real testnet transactions (FastNear tx API shape, fixtures from
// e2etest.solidon.testnet), history math against live views, downsampling, and the API routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eventsFromTx, involves, parseEventLog, txComplete } from "../src/events.js";
import { downsample, snapshotOf, treasuryAssets } from "../src/history.js";
import { route } from "../src/api.js";
import { Store } from "../src/store.js";

const FIX = path.join(import.meta.dirname, "fixtures");
const TXS = JSON.parse(fs.readFileSync(path.join(FIX, "meme-txs.json"), "utf8"));
const VIEWS = JSON.parse(fs.readFileSync(path.join(FIX, "meme-views.json"), "utf8"));
const MEME = "e2etest.solidon.testnet";
const FACTORY = "solidon.testnet";
const USDC = "usdc.solidon.testnet";
const OPTS = { tracked: new Set([FACTORY, MEME]), usdc: USDC };
const txByHash = (h) => TXS.find((t) => t.transaction.hash === h);

test("parseEventLog reads the NEP-297 logs the meme and factory write (pool.rs emit)", () => {
  const log =
    'EVENT_JSON:{"standard":"solidon","version":"1.0.0","event":"buy","data":[{"account":"a.testnet","usdc_in":"5","meme_out":"7"}]}';
  assert.deepEqual(parseEventLog(log), {
    standard: "solidon",
    version: "1.0.0",
    event: "buy",
    data: [{ account: "a.testnet", usdc_in: "5", meme_out: "7" }],
  });
  for (const bad of [null, "", "plain log", "EVENT_JSON:{not json", 'EVENT_JSON:{"standard":"x"}', 'EVENT_JSON:{"event":"x"}']) {
    assert.equal(parseEventLog(bad), null, String(bad));
  }
});

test("a buy (ft_transfer_call on USDC) yields the meme's buy plus both token transfers", () => {
  const evs = eventsFromTx(txByHash("3D7W6ECKVvmTvM4YfXFmHMWABEVHzZMh9eJNiXVK7JaP"), OPTS);
  assert.deepEqual(
    evs.map((e) => [e.account, e.receiver, e.standard, e.event]),
    [
      [MEME, USDC, "nep141", "ft_transfer"],
      [MEME, MEME, "nep141", "ft_transfer"],
      [MEME, MEME, "solidon", "buy"],
    ],
  );
  const buy = evs[2];
  assert.deepEqual(buy, {
    account: MEME,
    block_height: 276982140,
    timestamp: 1794263635,
    tx_hash: "3D7W6ECKVvmTvM4YfXFmHMWABEVHzZMh9eJNiXVK7JaP",
    receipt_id: buy.receipt_id,
    log_index: 1,
    data_index: 0,
    signer: "creator.solidon.testnet",
    predecessor: USDC,
    receiver: MEME,
    event: "buy",
    standard: "solidon",
    version: "1.0.0",
    data: { account: "creator.solidon.testnet", usdc_in: "500000000", meme_out: "331103678929765886287625418" },
  });
  assert.equal(evs[0].data.amount, "500000000"); // the USDC leg, under the meme's file
});

test("sell, rebalance with issuance, fund_chain and credit_cash are all extracted", () => {
  const sell = eventsFromTx(txByHash("4TQE9jDdFt3T7hFqsRbXPWK61ReMXEu9VuuaeRNSkcXv"), OPTS);
  assert.deepEqual(sell.map((e) => e.event), ["ft_transfer", "sell", "ft_transfer"]);
  assert.equal(sell[1].data.usdc_out, "2453290");

  const reb = eventsFromTx(txByHash("7eMpY8QMwLDkQjWTmCdxNUtJrsPFvRh93Nc21ybYmu7J"), OPTS);
  assert.deepEqual(reb.map((e) => `${e.standard}:${e.event}`), ["nep141:ft_mint", "solidon:rebalance"]);
  assert.equal(reb[0].data.memo, "issuance");
  assert.deepEqual(reb[1].data.outcome, { issued: { meme: "3311036789297658862876254", usdc: "7363799" } });
  assert.equal(reb[1].signer, "keeper.solidon.testnet");

  const fund = eventsFromTx(txByHash("3uZr2wpVcW74KP8kqiE8VPpcoi3TtrA2c29KDXVCLvAH"), OPTS);
  assert.deepEqual(fund.map((e) => [e.receiver, e.event]), [[MEME, "cash_sent"], [USDC, "ft_transfer"]]);
  assert.match(fund[1].data.memo, /^solidon fund base 0x/);

  const credit = eventsFromTx(txByHash("6KTHwQQaXs5HDHWpSydzju3fZtkugfVk5QWxzLGetgZq"), OPTS);
  assert.deepEqual(credit.map((e) => e.event), ["cash_credited"]);
  assert.equal(credit[0].data.proof, "mpc");
});

test("USDC events that do not touch a tracked meme, and untracked contracts, are skipped", () => {
  const tx = txByHash("3D7W6ECKVvmTvM4YfXFmHMWABEVHzZMh9eJNiXVK7JaP");
  assert.deepEqual(eventsFromTx(tx, { tracked: new Set([FACTORY]), usdc: USDC }), []);
  assert.equal(eventsFromTx(tx, { tracked: new Set([MEME]), usdc: null }).length, 2); // no USDC leg
});

test("txComplete waits until every spawned receipt has an outcome", () => {
  for (const tx of TXS) assert.equal(txComplete(tx), true, tx.transaction.hash);
  const tx = structuredClone(TXS[0]);
  tx.receipts.pop();
  assert.equal(txComplete(tx), false);
});

test("involves matches signer, predecessor and the accounts named in the data", () => {
  const evs = eventsFromTx(txByHash("4TQE9jDdFt3T7hFqsRbXPWK61ReMXEu9VuuaeRNSkcXv"), OPTS);
  const seller = "fd392f2a8bb5de669e0ca4a1dd37dc8a9ed4a38848006138ada9455c54138d24";
  assert.equal(evs.every((e) => involves(e, seller)), true);
  assert.equal(involves(evs[1], "creator.solidon.testnet"), false);
  const reb = eventsFromTx(txByHash("7eMpY8QMwLDkQjWTmCdxNUtJrsPFvRh93Nc21ybYmu7J"), OPTS);
  assert.equal(involves(reb[0], MEME), true); // ft_mint owner_id
});

test("snapshotOf matches the contract's NAV math on live e2etest views", () => {
  const { pool, treasury, tc, price } = VIEWS;
  const s = snapshotOf({ t: 1794372843, pool, treasury, tc, price });
  // Independent float check (frontend math.ts estimateNav): cash + chain USDC + in transit + stock.
  const px = Number(price.price) * 10 ** price.expo;
  let usd = Number(treasury.treasury_usdc) / 1e6;
  for (const c of tc.chains) usd += Number(c.usdc) / 10 ** c.config.usdc_decimals + Number(c.in_transit) / 1e6 + (Number(c.stock) / 10 ** c.venue.decimals) * px;
  usd += Number(tc.solana.usdc) / 1e6 + Number(tc.solana.in_transit) / 1e6 + (Number(tc.solana.stock) / 10 ** tc.solana.venue.decimals) * px;
  const circ = Number(treasury.circulating) / 1e18;
  assert.ok(Math.abs(s.treasury_value - usd) < 1e-5, `${s.treasury_value} vs ${usd}`);
  assert.equal(s.circulating, circ);
  assert.ok(Math.abs(s.nav / (usd / circ) - 1) < 1e-6);
  assert.equal(s.price, Number(pool.spot_price) / 1e18);
  assert.equal(s.twap, Number(pool.twap_price) / 1e18);
  assert.ok(Math.abs(s.mnav / (s.twap / s.nav) - 1) < 1e-5, "mNAV uses the TWAP when present");
  assert.equal(s.stock_price, px);
  assert.deepEqual(s.chains, { base: "5829568", robinhood: "45190227948846476", solana: "5634522" });
  // Exact bigint value, as Meme::assets (floors each stock value).
  assert.equal(treasuryAssets(treasury, tc, price), 34_556_322n);
});

test("snapshotOf without a price or before the TWAP window", () => {
  const { pool, treasury, tc } = VIEWS;
  const s = snapshotOf({ t: 1, pool: { ...pool, twap_price: null }, treasury, tc, price: null });
  assert.equal(s.twap, null);
  assert.equal(s.nav, null);
  assert.equal(s.mnav, null);
  assert.equal(s.treasury_value, null);
  assert.equal(s.stock_price, null);
  const young = snapshotOf({ t: 1, pool: { ...pool, twap_price: null }, treasury, tc, price: VIEWS.price });
  assert.ok(Math.abs(young.mnav / (young.price / young.nav) - 1) < 1e-5, "falls back to spot");
});

test("downsample keeps 24 h at full resolution, then one point per 15 minutes", () => {
  const now = 10 * 86_400;
  const points = [];
  for (let t = now - 3 * 86_400; t <= now; t += 60) points.push({ t });
  const kept = downsample(points, now);
  const old = kept.filter((p) => p.t < now - 86_400);
  const recent = kept.filter((p) => p.t >= now - 86_400);
  assert.equal(recent.length, points.filter((p) => p.t >= now - 86_400).length);
  assert.equal(old.length, (2 * 86_400) / 900);
  assert.ok(old.every((p) => p.t % 900 === 0), "first point of each bucket");
  assert.deepEqual(downsample(kept, now), kept, "idempotent");
  assert.deepEqual(downsample([], now), []);
});

// --- API ---------------------------------------------------------------------------------

function fakeService() {
  const store = new Store(null);
  store.addEvents(TXS.flatMap((tx) => eventsFromTx(tx, OPTS)));
  for (let i = 0; i < 5; i++) store.addSnapshot(MEME, { t: 1000 + 60 * i, price: i });
  return {
    store,
    meta: new Map([[MEME, { symbol: "E2ETEST" }]]),
    memes: () => [MEME],
    health: () => ({ ok: true, last_block: 1, memes: 1, lag_s: 0 }),
  };
}

test("routes: health, memes, history, events, activity", () => {
  const s = fakeService();
  assert.deepEqual(route(s, "GET", "/health"), { status: 200, body: { ok: true, last_block: 1, memes: 1, lag_s: 0 } });

  const memes = route(s, "GET", "/v1/memes");
  assert.equal(memes.status, 200);
  assert.deepEqual(memes.body.memes[0].latest, { t: 1240, price: 4 });
  assert.equal(memes.body.memes[0].symbol, "E2ETEST");

  const h = route(s, "GET", `/v1/memes/${MEME}/history?since=1100&limit=2`);
  assert.deepEqual(h.body.history.map((p) => p.t), [1120, 1180]);
  assert.equal(h.body.more, true);

  const ev = route(s, "GET", `/v1/memes/${MEME}/events?limit=3`).body.events;
  assert.equal(ev.length, 3);
  assert.equal(ev[0].block_height, 277109740, "newest first");
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i - 1].block_height >= ev[i].block_height);
  const older = route(s, "GET", `/v1/memes/${MEME}/events?before=276982800`).body.events;
  assert.ok(older.length > 0 && older.every((e) => e.block_height < 276982800));

  const act = route(s, "GET", "/v1/accounts/creator.solidon.testnet/activity").body.events;
  assert.deepEqual([...new Set(act.map((e) => e.tx_hash))], ["3D7W6ECKVvmTvM4YfXFmHMWABEVHzZMh9eJNiXVK7JaP"]);
  assert.equal(route(s, "GET", "/v1/accounts/nobody.testnet/activity").body.events.length, 0);
});

test("routes: JSON errors for unknown memes, bad params, unknown paths and writes", () => {
  const s = fakeService();
  const cases = [
    ["GET", "/v1/memes/other.testnet/history", 404],
    ["GET", "/v1/memes/Bad$Id/events", 400],
    ["GET", `/v1/memes/${MEME}/events?limit=0`, 400],
    ["GET", `/v1/memes/${MEME}/events?limit=abc`, 400],
    ["GET", `/v1/memes/${MEME}/history?since=-1`, 400],
    ["GET", `/v1/memes/${MEME}/history?limit=100000`, 400],
    ["GET", "/v1/nothing", 404],
    ["GET", "/", 404],
    ["GET", "/v1/memes/%E0%A4%A/events", 400],
    ["POST", "/v1/memes", 405],
  ];
  for (const [m, u, status] of cases) {
    const r = route(s, m, u);
    assert.equal(r.status, status, `${m} ${u}`);
    assert.equal(typeof r.body.error, "string");
  }
  assert.equal(route(s, "OPTIONS", "/v1/memes").status, 204);
});

test("store: events and history survive a restart, without duplicates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solidon-ix-"));
  try {
    const a = new Store(dir);
    const recs = TXS.flatMap((tx) => eventsFromTx(tx, OPTS));
    assert.equal(a.addEvents(recs), recs.length);
    assert.equal(a.addEvents(recs), 0);
    a.addSnapshot(MEME, { t: 5 });
    a.cursor.done.abc = 1;
    a.saveCursor();
    fs.appendFileSync(path.join(dir, "events", `${MEME}.jsonl`), `${JSON.stringify(recs[0])}\n{"cut`); // crash replay
    const b = new Store(dir);
    assert.equal(b.events.get(MEME).length, recs.length);
    assert.deepEqual(b.history.get(MEME), [{ t: 5 }]);
    assert.equal(b.cursor.done.abc, 1);
    assert.throws(() => b.file("events", "../etc"), /unsafe/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
