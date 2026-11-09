// Housekeeping and bridge flows against fake NEAR / EVM endpoints: which contract calls the keeper
// makes, with which arguments. No network.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { housekeeping, resetRebalanceTries } from "../src/treasury.js";
import { processTransfers } from "../src/bridge.js";
import { keeperWallet } from "../src/evm.js";
import { State } from "../src/state.js";
import { TRANSFER_TOPIC } from "../src/logic.js";

beforeEach(() => resetRebalanceTries());

const MEME = "nvda.solidon.testnet";
const TREASURY = "0x680bcf5a2e3c07118991adb3976d3df077ed96ee";
const BASE_USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const HOOD_USDC = "0xbf4479c07dc6fdc6daa764a0cca06969e894275f";
// Anvil's first dev key: public test key, never funded on a real network.
const wallet = keeperWallet("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

function chain(name, decimals, extra = {}) {
  return {
    config: { name, usdc_decimals: decimals, max_swap_usdc: (5n * 10n ** BigInt(decimals)).toString() },
    venue: { chain: name, token: "0x8f13563130684478e617c1797308a081cb2c2654", decimals: 8 },
    nonce: 0,
    approved: true,
    usdc: "0",
    stock: "0",
    in_transit: "0",
    ...extra,
  };
}

function fakeNear(snapshot, results = {}) {
  const calls = [];
  const views = {
    [`${MEME}.get_info`]: { oracle: "pyth.solidon.testnet", stock: { ticker: "NVDA", price_id: "ab".repeat(32) } },
    [`${MEME}.get_params`]: { cash_buffer_bps: 2000, oracle_max_age_secs: 900 },
    [`${MEME}.get_treasury`]: () => snapshot.treasury,
    [`${MEME}.get_treasury_chains`]: () => snapshot.tc,
    "pyth.solidon.testnet.get_price_no_older_than": () => snapshot.price,
  };
  return {
    calls,
    txUrl: (h) => h,
    async view(contract, method) {
      const v = views[`${contract}.${method}`];
      return typeof v === "function" ? v() : v;
    },
    async tryView(contract, method) {
      return this.view(contract, method);
    },
    async call(scope, contract, c) {
      calls.push({ contract, ...c });
      return { hash: "NEARTX", value: results[c.method] ?? null };
    },
  };
}

function memeSnapshot(tc, cash = "100000000") {
  return {
    id: MEME,
    info: { oracle: "pyth.solidon.testnet", stock: { ticker: "NVDA", price_id: "ab".repeat(32) } },
    params: { cash_buffer_bps: 2000, oracle_max_age_secs: 900 },
    treasury: { treasury_usdc: cash, last_rebalance: 0, next_rebalance: 3600, last_mnav_bps: "0" },
    tc,
    price: { price: "17756000000", conf: "0", expo: -8, publish_time: 0 },
  };
}

const cfg = { dryRun: false, fundMin6: 1_000_000n, receiptTimeoutSecs: 1, creditMaxAttempts: 3 };

test("housekeeping: no treasury yet -> init_treasury, no chain step (rebalance still runs)", async () => {
  const meme = memeSnapshot({ address: null, signing: false, chains: [chain("base", 6)] });
  const near = fakeNear(meme);
  await housekeeping({ cfg, near }, meme);
  assert.deepEqual(near.calls.map((c) => c.method), ["init_treasury", "rebalance"]);
});

test("housekeeping: approve, fund the next chain, buy where USDC sits, rebalance", async () => {
  const meme = memeSnapshot({
    address: TREASURY,
    signing: false,
    chains: [
      chain("base", 6, { approved: false }),
      chain("robinhood", 18),
      chain("third", 6, { usdc: "2000000" }),
    ],
  });
  const near = fakeNear(meme);
  await housekeeping({ cfg, near }, meme);
  assert.deepEqual(
    near.calls.map((c) => `${c.method}(${c.args.chain ?? ""}) ${c.tgas}`),
    ["approve_router(base) 300", "fund_chain(robinhood) 100", "buy_stock(third) 300", "rebalance() 100"],
  );
});

test("housekeeping: a signature in flight blocks signing; no fund while cash is in transit; stale price blocks all", async () => {
  const tc = {
    address: TREASURY,
    signing: true,
    chains: [chain("base", 6, { approved: false }), chain("robinhood", 18, { usdc: "3000000000000000000", in_transit: "1" })],
  };
  const near = fakeNear(memeSnapshot(tc));
  await housekeeping({ cfg, near }, memeSnapshot(tc));
  assert.deepEqual(near.calls.map((c) => c.method), ["rebalance"]);

  const stale = { ...memeSnapshot({ ...tc, signing: false }), price: null };
  const near2 = fakeNear(stale);
  await housekeeping({ cfg, near: near2 }, stale);
  assert.deepEqual(near2.calls.map((c) => `${c.method}(${c.args.chain ?? ""})`), ["approve_router(base)"]);
});

function fakeEvm(name, usdc, decimals, proof, { logIndex = 4, position = 1 } = {}) {
  const sent = [];
  const receiptFor = (hash) => ({
    transactionHash: hash,
    status: "0x1",
    blockNumber: "0x10",
    gasUsed: "0x5208",
    logs: [
      ...Array(position).fill({ address: "0x0000000000000000000000000000000000000009", topics: [], data: "0x" }),
      {
        address: usdc,
        topics: [TRANSFER_TOPIC, `0x${"0".repeat(24)}${wallet.address.slice(2).toLowerCase()}`, `0x${"0".repeat(24)}${TREASURY.slice(2)}`],
        data: `0x${(5n * 10n ** BigInt(decimals)).toString(16).padStart(64, "0")}`,
        blockHash: `0x${"cd".repeat(32)}`,
        blockNumber: "0x10",
        transactionIndex: "0x3",
        logIndex: `0x${logIndex.toString(16)}`,
      },
    ],
  });
  return {
    name,
    usdc,
    usdcDecimals: decimals,
    proof,
    chainId: 84532,
    sent,
    txUrl: (h) => h,
    erc20Balance: async () => 10n ** 30n,
    balance: async () => 10n ** 18n,
    nonce: async () => 7,
    fees: async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n }),
    rpc: async () => "0xc350",
    sendRaw: async (raw) => sent.push(raw),
    receipt: async (hash) => (sent.length ? receiptFor(hash) : null),
    waitReceipt: async (hash) => receiptFor(hash),
  };
}

function bridgeCtx(evm, inTransit, transfers, results) {
  const meme = memeSnapshot({ address: TREASURY, signing: false, chains: [chain(evm.name, evm.usdcDecimals, { in_transit: inTransit })] });
  const state = new State("/nonexistent/keeper-state.json", { readOnly: true });
  Object.assign(state.data.transfers, transfers);
  const near = fakeNear(meme, results);
  return { ctx: { cfg, near, wallet, state, world: { evm: { [evm.name]: evm } } }, snapshots: new Map([[MEME, meme]]), near, state };
}

const received = (chainName, amount6 = "5000000") => ({
  meme: MEME,
  chain: chainName,
  to: TREASURY,
  amount6,
  status: "received",
});

test("bridge (Base): deliver 6-dp USDC, then credit_cash with the receipt's Transfer log", async () => {
  const evm = fakeEvm("base", BASE_USDC, 6, { Mpc: { foreign_chain: "Base", finality: "Latest" } });
  const { ctx, snapshots, near, state } = bridgeCtx(evm, "5000000", { R1: received("base") }, { credit_cash: "5000000" });
  await processTransfers(ctx, snapshots);
  const t = state.transfers.R1;
  assert.equal(t.status, "credited");
  assert.equal(t.evm.amount_raw, "5000000");
  assert.equal(evm.sent.length, 1);
  assert.equal(near.calls.length, 1);
  const c = near.calls[0];
  assert.equal(c.method, "credit_cash");
  assert.equal(c.tgas, 300);
  assert.equal(c.contract, MEME);
  assert.equal(c.args.tx_hash, t.evm.hash);
  assert.equal(c.args.log_index, 4);
  assert.deepEqual(Object.keys(c.args.log), ["block_hash", "block_number", "transaction_index", "address", "topics", "data"]);
  assert.equal(c.args.log.block_number, 16);
  assert.equal(c.args.log.transaction_index, 3);
});

test("bridge (Robinhood): deliver 18-dp USDC, then report_cash with the raw amount", async () => {
  const evm = fakeEvm("robinhood", HOOD_USDC, 18, "Relayer");
  const { ctx, snapshots, near, state } = bridgeCtx(evm, "5000000", { R1: received("robinhood") }, { report_cash: "5000000" });
  await processTransfers(ctx, snapshots);
  assert.equal(state.transfers.R1.status, "credited");
  assert.deepEqual(near.calls.map((c) => [c.method, c.args.amount]), [["report_cash", "5000000000000000000"]]);
});

test("bridge: never delivers more than is still in transit", async () => {
  const evm = fakeEvm("robinhood", HOOD_USDC, 18, "Relayer");
  // 3 USDC in transit, two 5-USDC transfers seen: deliver 3, then nothing for the second.
  const { ctx, snapshots, state } = bridgeCtx(evm, "3000000", { R1: received("robinhood"), R2: received("robinhood") }, {});
  await processTransfers(ctx, snapshots);
  assert.equal(state.transfers.R1.evm.delivered6, "3000000");
  assert.equal(state.transfers.R1.status, "delivered"); // report_cash gave no credit: retried next cycle
  assert.equal(state.transfers.R1.credit_attempts, 1);
  assert.equal(state.transfers.R2.status, "nothing-owed");
  assert.equal(evm.sent.length, 1);
});

test("bridge: memo treasury must be the meme's treasury", async () => {
  const evm = fakeEvm("base", BASE_USDC, 6, { Mpc: { foreign_chain: "Base", finality: "Latest" } });
  const wrong = { ...received("base"), to: "0x000000000000000000000000000000000000dead" };
  const { ctx, snapshots, state } = bridgeCtx(evm, "5000000", { R1: wrong }, {});
  await processTransfers(ctx, snapshots);
  assert.equal(state.transfers.R1.status, "ignored");
  assert.equal(evm.sent.length, 0);
});
