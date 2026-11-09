// Solana flows against fake NEAR and Solana endpoints: which contract calls the keeper makes,
// with which arguments, and what it sends to Solana. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { solanaHousekeeping } from "../src/solana.js";
import { processTransfers } from "../src/bridge.js";
import { State } from "../src/state.js";
import { parseSolanaTx } from "../src/logic.js";
import { REPO } from "../src/config.js";
import { S25 } from "./fixtures/s25.js";

const MEME = "nvda.solidon.testnet";
const REG = JSON.parse(fs.readFileSync(path.join(REPO, "contracts/stocks/solana-devnet.json"), "utf8"));
const NVDA = REG.stocks.find((s) => s.ticker === "NVDA");
const POOL_DATA = Buffer.from(
  JSON.parse(fs.readFileSync(new URL("./fixtures/devnet-pools.json", import.meta.url), "utf8")).pools.NVDA.data,
  "base64",
);
const USDC_ATA = "318qibizcq962JSymQtW3KfuZuQhMi2UrRFuVmzTcHn7";
const STOCK_ATA = "7NZMuaey6A1bx5dthm78J1wR3PFxrLWWJSAhJMBpbx3p";
const BLOCKHASH = "58vRusYAhwezWhxS9hriQKqDjvNpuhHs4U44wJJ8ZcnP";
const S25_TICKS = [
  [-6000, 255],
  [-13200, 254],
];
/** A second signed transaction (another signature, same message), as a resign would store. */
const RESIGNED = (() => {
  const b = Buffer.from(S25.hex, "hex");
  b[1] ^= 0xff;
  return b.toString("base64");
})();
const keypair = Keypair.generate(); // local only, never funded

function solanaView(extra = {}) {
  return {
    config: {
      name: "solana",
      usdc_mint: REG.usdc,
      usdc_token_program: REG.usdc_token_program,
      stock_token_program: REG.stock_token_program,
      clmm_program: REG.raydium_clmm.program,
      amm_config: REG.raydium_clmm.amm_config,
      max_swap_usdc: "5000000",
    },
    venue: {
      chain: "solana",
      token: NVDA.token,
      decimals: 8,
      solana: {
        pool: NVDA.pool,
        usdc_vault: NVDA.usdc_vault,
        stock_vault: NVDA.stock_vault,
        observation: NVDA.observation,
        bitmap_extension: NVDA.bitmap_extension,
      },
    },
    address: S25.treasury,
    usdc_account: USDC_ATA,
    stock_account: STOCK_ATA,
    seq: 0,
    usdc: "1000000",
    stock: "0",
    in_transit: "0",
    last_buy: null,
    ...extra,
  };
}

function world({ solana = {}, cash = "0", price = true, signing = false, height = 1000 } = {}) {
  return {
    height,
    signed: {},
    meme: {
      info: { oracle: "pyth.solidon.testnet", stock: { ticker: "NVDA", price_id: "ab".repeat(32) } },
      params: { cash_buffer_bps: 2000, oracle_max_age_secs: 900 },
      treasury: { treasury_usdc: cash, last_rebalance: 0, next_rebalance: 3600, last_mnav_bps: "0" },
      tc: { address: null, signing, chains: [], solana: solanaView(solana) },
      price: price ? { price: "17667920000", conf: "0", expo: -8, publish_time: 0 } : null,
    },
  };
}

/** Fake NEAR: views from `w`, and each call mutates `w` like the contract would. */
function fakeNear(w, results = {}) {
  const calls = [];
  const s = () => w.meme.tc.solana;
  const sign = (raw) => {
    w.signed[s().seq] = raw;
    s().last_buy = { seq: s().seq, usdc_in: "1000000", min_stock_out: "560337", signed_at: w.height };
    s().seq += 1;
  };
  const effects = {
    set_solana_accounts: () => Object.assign(s(), { usdc_account: USDC_ATA, stock_account: STOCK_ATA }),
    buy_stock_solana: () => {
      sign(S25.base64);
      Object.assign(s(), { usdc: "0", stock: "560337" });
    },
    resign_solana: () => sign(RESIGNED),
    fund_chain: () => {},
    init_solana_treasury: () => {},
    report_cash: ({ amount }) => {
      const credit = BigInt(amount) < BigInt(s().in_transit) ? BigInt(amount) : BigInt(s().in_transit);
      s().in_transit = String(BigInt(s().in_transit) - credit);
      s().usdc = String(BigInt(s().usdc) + credit);
    },
  };
  return {
    calls,
    txUrl: (h) => h,
    async blockHeight() {
      return w.height;
    },
    async view(contract, method, args) {
      if (method === "get_signed_tx") return w.signed[args.nonce] ?? null;
      if (method === "get_price_no_older_than") return structuredClone(w.meme.price);
      const v = { get_info: w.meme.info, get_params: w.meme.params, get_treasury: w.meme.treasury, get_treasury_chains: w.meme.tc }[method];
      return structuredClone(v);
    },
    async tryView(contract, method, args) {
      return this.view(contract, method, args);
    },
    async call(scope, contract, c) {
      calls.push({ contract, ...c });
      effects[c.method](c.args);
      return { hash: "NEARTX", value: results[c.method] ?? null };
    },
  };
}

/** Fake Solana RPC. `land`: what a sent transaction becomes (`null`: never seen). */
function fakeSol({ treasurySol = 50_000_000n, land = { confirmationStatus: "confirmed", err: null, slot: 7 }, valid = false, statuses = {} } = {}) {
  const sent = [];
  return {
    sent,
    statuses,
    finalizedHeight: 100,
    txUrl: (sig) => `tx/${sig}`,
    addressUrl: (a) => a,
    async accountData(a) {
      assert.equal(a, NVDA.pool);
      return POOL_DATA;
    },
    async balance(a) {
      return a === S25.treasury ? treasurySol : 10n ** 10n;
    },
    async tokenBalance() {
      return 100_000_000n;
    },
    async latestBlockhash() {
      return { blockhash: BLOCKHASH, lastValidBlockHeight: 150 };
    },
    async blockhashValid() {
      return valid;
    },
    async blockHeight() {
      return this.finalizedHeight;
    },
    async status(sig) {
      return statuses[sig] ?? null;
    },
    async send(raw) {
      sent.push(raw);
      const sig = parseSolanaTx(raw).signature;
      if (land) statuses[sig] = land;
      return sig;
    },
    async confirm(sig) {
      return statuses[sig] ?? null;
    },
  };
}

const cfg = {
  dryRun: false,
  fundMin6: 1_000_000n,
  receiptTimeoutSecs: 1,
  creditMaxAttempts: 3,
  solana: { treasuryMin: 10_000_000n, treasuryTopup: 20_000_000n, confirmTimeoutSecs: 0, maxResigns: 5 },
};

function setup(w, sol, results) {
  const near = fakeNear(w, results);
  const state = new State("/nonexistent/keeper-state.json", { readOnly: true });
  const ctx = { cfg, near, state, sol: { rpc: sol, keypair }, world: { evm: {} } };
  return { ctx, near, state };
}

/** What readMeme returns: a copy, so the fake's later changes do not leak into it. */
const snap = (w) => ({ id: MEME, ...structuredClone(w.meme) });

const methods = (near) => near.calls.map((c) => c.method);

test("solana: no treasury yet -> init_solana_treasury only", async () => {
  const w = world({ solana: { address: null, usdc_account: null, stock_account: null } });
  const { ctx, near } = setup(w, fakeSol());
  await solanaHousekeeping(ctx, snap(w));
  assert.deepEqual(methods(near), ["init_solana_treasury"]);
});

test("solana: set the canonical token accounts, then buy with the pool's tick arrays and broadcast at once", async () => {
  const w = world({ solana: { usdc_account: null, stock_account: null } });
  const sol = fakeSol();
  const { ctx, near, state } = setup(w, sol);
  await solanaHousekeeping(ctx, snap(w));
  assert.deepEqual(methods(near), ["set_solana_accounts", "buy_stock_solana"]);
  assert.deepEqual(near.calls[0].args, { usdc_account_bump: 253, stock_account_bump: 255 });
  assert.equal(near.calls[0].tgas, 30);
  assert.deepEqual(near.calls[1].args, { blockhash: BLOCKHASH, tick_arrays: S25_TICKS });
  assert.equal(near.calls[1].tgas, 300);
  assert.deepEqual(sol.sent, [S25.base64]); // get_signed_tx("solana", 0), unchanged
  assert.equal(state.data.solana[MEME].landed_seq, 0);
});

test("solana: a treasury low on SOL is topped up from the keeper wallet before the buy", async () => {
  const w = world();
  const sol = fakeSol({ treasurySol: 1_000_000n });
  const { ctx, near } = setup(w, sol);
  await solanaHousekeeping(ctx, snap(w));
  assert.equal(sol.sent.length, 2);
  assert.notEqual(sol.sent[0], S25.base64); // the keeper's SOL transfer
  assert.equal(sol.sent[1], S25.base64);
  assert.deepEqual(methods(near), ["buy_stock_solana"]);
});

test("solana: no buy on a stale price, with a signature in flight, or below 1 USDC; fund when spent", async () => {
  for (const opts of [{ price: false }, { signing: true }, { solana: { usdc: "999999" }, cash: "0" }]) {
    const w = world(opts);
    const { ctx, near } = setup(w, fakeSol());
    await solanaHousekeeping(ctx, snap(w));
    assert.deepEqual(methods(near), [], JSON.stringify(opts));
  }
  // Spent and nothing in transit: 100 USDC of NEAR cash -> fund_chain("solana").
  const w = world({ solana: { usdc: "0" }, cash: "100000000" });
  const { ctx, near } = setup(w, fakeSol());
  await solanaHousekeeping(ctx, snap(w));
  assert.deepEqual(near.calls.map((c) => [c.method, c.args, c.tgas]), [["fund_chain", { chain: "solana" }, 100]]);
});

const lastBuy = { seq: 0, usdc_in: "1000000", min_stock_out: "560337", signed_at: 1000 };

test("solana: an unlanded buy whose blockhash is still valid is sent again, no new buy", async () => {
  const w = world({ solana: { seq: 1, last_buy: lastBuy } });
  w.signed[0] = S25.base64;
  const sol = fakeSol({ valid: true, land: null });
  const { ctx, near } = setup(w, sol);
  await solanaHousekeeping(ctx, snap(w));
  assert.deepEqual(sol.sent, [S25.base64]);
  assert.deepEqual(methods(near), []);
});

test("solana: an expired buy is re-signed only 200 NEAR blocks after its signature, then broadcast", async () => {
  const w = world({ solana: { seq: 1, last_buy: lastBuy, usdc: "0" }, height: 1199 });
  w.signed[0] = S25.base64;
  const sol = fakeSol({ valid: false });
  const early = setup(w, sol);
  await solanaHousekeeping(early.ctx, snap(w));
  assert.deepEqual(methods(early.near), []);
  assert.deepEqual(sol.sent, []);

  w.height = 1200;
  const { ctx, near, state } = setup(w, sol);
  await solanaHousekeeping(ctx, snap(w));
  assert.deepEqual(methods(near), ["resign_solana"]);
  assert.deepEqual(near.calls[0].args, { blockhash: BLOCKHASH, tick_arrays: S25_TICKS });
  assert.equal(near.calls[0].tgas, 300);
  assert.deepEqual(sol.sent, [RESIGNED]); // seq 1, not the expired seq 0
  assert.equal(state.data.solana[MEME].landed_seq, 1);
  assert.equal(state.data.solana[MEME].resigns, 0);
});

test("solana: a buy that landed with an error is re-signed too; a landed one frees the next buy", async () => {
  const failed = { confirmationStatus: "finalized", err: { InstructionError: [1, { Custom: 6022 }] }, slot: 3 };
  const w = world({ solana: { seq: 1, last_buy: lastBuy, usdc: "0" }, height: 1300 });
  w.signed[0] = S25.base64;
  const sol = fakeSol({ statuses: { [S25.signature]: failed } });
  const { ctx, near } = setup(w, sol);
  await solanaHousekeeping(ctx, snap(w));
  assert.deepEqual(methods(near), ["resign_solana"]);

  const ok = { confirmationStatus: "finalized", err: null, slot: 3 };
  const w2 = world({ solana: { seq: 1, last_buy: lastBuy, usdc: "2000000" } });
  w2.signed[0] = S25.base64;
  const two = setup(w2, fakeSol({ statuses: { [S25.signature]: ok } }));
  await solanaHousekeeping(two.ctx, snap(w2));
  assert.deepEqual(methods(two.near), ["buy_stock_solana"]);
  assert.equal(two.state.data.solana[MEME].landed_seq, 1);
});

test("solana: resigns stop at SOLANA_MAX_RESIGNS", async () => {
  const w = world({ solana: { seq: 1, last_buy: lastBuy, usdc: "0" }, height: 2000 });
  w.signed[0] = S25.base64;
  const { ctx, near, state } = setup(w, fakeSol());
  state.data.solana[MEME] = { landed_seq: null, resigns: 5 };
  await solanaHousekeeping(ctx, snap(w));
  assert.deepEqual(methods(near), []);
});

const received = (amount6 = "5000000", to = S25.treasury) => ({ meme: MEME, chain: "solana", to, amount6, status: "received" });

function bridgeSetup(inTransit, transfers, solOpts) {
  const w = world({ solana: { usdc: "0", in_transit: inTransit } });
  const sol = fakeSol(solOpts);
  const { ctx, near, state } = setup(w, sol, { report_cash: inTransit });
  Object.assign(state.data.transfers, transfers);
  return { ctx, near, state, sol, snapshots: new Map([[MEME, snap(w)]]) };
}

test("bridge (Solana): deliver USDC capped by in transit, then report_cash with the signature", async () => {
  const { ctx, near, state, sol, snapshots } = bridgeSetup("3000000", { R1: received(), R2: received() });
  await processTransfers(ctx, snapshots);
  const t = state.transfers.R1;
  assert.equal(t.status, "credited");
  assert.equal(t.sol.amount_raw, "3000000");
  assert.equal(sol.sent.length, 1);
  assert.equal(parseSolanaTx(sol.sent[0]).signature, t.sol.signature);
  assert.deepEqual(near.calls.map((c) => [c.method, c.args, c.tgas]), [
    ["report_cash", { chain: "solana", tx_hash: t.sol.signature, amount: "3000000" }, 30],
  ]);
  assert.equal(state.transfers.R2.status, "nothing-owed");
});

test("bridge (Solana): a delivery to another address is ignored", async () => {
  const { ctx, sol, state, snapshots } = bridgeSetup("5000000", { R1: received("5000000", keypair.publicKey.toBase58()) });
  await processTransfers(ctx, snapshots);
  assert.equal(state.transfers.R1.status, "ignored");
  assert.equal(sol.sent.length, 0);
});

test("bridge (Solana): an expired delivery is replaced, a valid one re-sent", async () => {
  const { ctx, sol, state, snapshots } = bridgeSetup("5000000", { R1: received() }, { land: null });
  await processTransfers(ctx, snapshots);
  const t = state.transfers.R1;
  assert.equal(t.status, "sending"); // sent, never seen
  const first = t.sol.signature;
  assert.equal(sol.sent.length, 2); // sent, then re-sent while its blockhash is valid (height 100 <= 150)

  sol.finalizedHeight = 151; // past its last valid block height: can never land
  await processTransfers(ctx, snapshots);
  assert.deepEqual(t.expired, [first]);
  assert.equal(t.status, "received");
  assert.equal(t.sol, undefined);
});
