// Pure Solana logic against fixtures from the S25 devnet buy (backend/solana-spike/2_swap.js,
// contracts/meme/src/solana_treasury.rs tests) and live devnet pool accounts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  base58,
  ledgerChains,
  parseClmmPool,
  parseFundMemo,
  parseSolanaTx,
  planSolanaSwap,
  sendableEstimate,
  solTopup,
  solanaBuyAction,
  solanaTokenAccounts,
  tickArrayBump,
} from "../src/logic.js";
import { REPO } from "../src/config.js";
import { S25 } from "./fixtures/s25.js";

const REG = JSON.parse(fs.readFileSync(path.join(REPO, "contracts/stocks/solana-devnet.json"), "utf8"));
const POOLS = JSON.parse(fs.readFileSync(new URL("./fixtures/devnet-pools.json", import.meta.url), "utf8")).pools;
const venue = (t) => REG.stocks.find((s) => s.ticker === t);
const CLMM = REG.raydium_clmm.program;


test("parseFundMemo reads the Solana memo (cash.rs: solidon fund solana <base58 treasury>)", () => {
  assert.deepEqual(parseFundMemo(`solidon fund solana ${S25.treasury}`), { chain: "solana", to: S25.treasury });
  for (const bad of [
    `solidon fund solana ${S25.treasury.toLowerCase()}`, // not the same key
    `solidon fund solana ${S25.treasury}0`, // 33+ bytes
    `solidon fund solana ${S25.signature}`, // 64 bytes: a signature, not an address
    `solidon fund solana ${base58(Buffer.alloc(31, 7))}`, // 31 bytes
    `solidon fund solana ${base58(Buffer.alloc(33, 7))}`, // 33 bytes
    `solidon fund solana 0OIl${S25.treasury.slice(4)}`, // not base58
    `solidon fund solana ${S25.treasury} x`,
  ]) {
    assert.equal(parseFundMemo(bad), null, bad);
  }
});

test("base58 and parseSolanaTx give the landed transaction's id and blockhash", () => {
  assert.equal(base58([0, 0, 1]), "112");
  assert.equal(base58([]), "");
  const tx = parseSolanaTx(S25.base64);
  assert.equal(tx.signature, S25.signature);
  assert.equal(tx.blockhash, S25.blockhash);
  assert.throws(() => parseSolanaTx(Buffer.from([1, 2, 3]).toString("base64")));
});

test("solanaTokenAccounts gives set_solana_accounts' canonical bumps (solana_treasury.rs vectors)", () => {
  const a = solanaTokenAccounts({ treasury: S25.treasury, usdcMint: REG.usdc, stockMint: venue("NVDA").token });
  assert.deepEqual(a.usdc, { address: "318qibizcq962JSymQtW3KfuZuQhMi2UrRFuVmzTcHn7", bump: 253 });
  assert.deepEqual(a.stock, { address: "7NZMuaey6A1bx5dthm78J1wR3PFxrLWWJSAhJMBpbx3p", bump: 255 });
});

test("tickArrayBump matches the S25 tick arrays", () => {
  const pool = venue("NVDA").pool;
  assert.deepEqual(tickArrayBump(CLMM, pool, -6000), { start: -6000, bump: 255, address: "EWC4cMDc1LwSgE5YFNVAtU32ATh9bLrwrDtu6bgexrjt" });
  assert.deepEqual(tickArrayBump(CLMM, pool, -13200), { start: -13200, bump: 254, address: "ENQLLQvW9fjQhkGUkQghxofUmSkae7L3UxS46JcTkHA7" });
});

test("planSolanaSwap on live devnet pools: both swap directions, one-sided pools give 2 arrays", () => {
  const args = (t) => ({
    pool: venue(t).pool,
    poolData: Buffer.from(POOLS[t].data, "base64"),
    clmm: CLMM,
    usdcMint: REG.usdc,
    stockMint: venue(t).token,
    venue: venue(t),
  });
  // NVDA: USDC is mint0, price moves down; the arrays of the landed S25 buy.
  const nvda = planSolanaSwap(args("NVDA"));
  assert.equal(nvda.zeroForOne, true);
  assert.deepEqual(nvda.tickArrays, [
    [-6000, 255],
    [-13200, 254],
  ]);
  assert.deepEqual(nvda.addresses, ["EWC4cMDc1LwSgE5YFNVAtU32ATh9bLrwrDtu6bgexrjt", "ENQLLQvW9fjQhkGUkQghxofUmSkae7L3UxS46JcTkHA7"]);
  // GOOGL: USDC is mint1, price moves up through the range [10660, 17600].
  const googl = planSolanaSwap(args("GOOGL"));
  assert.equal(googl.zeroForOne, false);
  assert.deepEqual(googl.tickArrays.map(([s]) => s), [10200, 17400]);

  const p = parseClmmPool(Buffer.from(POOLS.NVDA.data, "base64"));
  assert.equal(p.tickSpacing, REG.raydium_clmm.tick_spacing);
  assert.equal(p.ammConfig, REG.raydium_clmm.amm_config);
  // Wrong stock, wrong venue accounts, not a pool.
  assert.throws(() => planSolanaSwap({ ...args("NVDA"), stockMint: venue("AAPL").token }), /does not pair/);
  assert.throws(() => planSolanaSwap({ ...args("NVDA"), venue: venue("AAPL") }), /differ/);
  assert.throws(() => planSolanaSwap({ ...args("NVDA"), poolData: Buffer.alloc(100) }), /not a CLMM pool/);
});

test("solanaBuyAction: landed, resend, and resign only after the contract's 200-block wait", () => {
  const at = (nearHeight, status, blockhashValid = false) => solanaBuyAction({ status, blockhashValid, nearHeight, signedAt: 1000 });
  const ok = { confirmationStatus: "finalized", err: null };
  assert.equal(at(1001, ok), "landed");
  assert.equal(at(1001, { confirmationStatus: "confirmed", err: null }), "landed");
  assert.equal(at(1001, { confirmationStatus: "processed", err: null }), "pending");
  assert.equal(at(1001, null, true), "broadcast");
  assert.equal(at(1199, null, false), "wait-resign");
  assert.equal(at(1200, null, false), "resign");
  assert.equal(at(5000, null, true), "broadcast"); // still valid: never resign a buy that can land
  const failed = { confirmationStatus: "finalized", err: { InstructionError: [1, { Custom: 6022 }] } };
  assert.equal(at(1100, failed), "wait-resign");
  assert.equal(at(1200, failed), "resign");
});

test("solTopup refills a treasury below the minimum", () => {
  assert.equal(solTopup(20_000_000n, 10_000_000n, 20_000_000n), 0n);
  assert.equal(solTopup(10_000_000n, 10_000_000n, 20_000_000n), 0n);
  assert.equal(solTopup(9_000_000n, 10_000_000n, 20_000_000n), 11_000_000n);
  assert.equal(solTopup(0, 10_000_000n, 20_000_000n), 20_000_000n);
});

test("ledgerChains adds the Solana ledger to the fund estimate (NAV counts it)", () => {
  const price = { price: "18000000000", expo: -8 }; // $180
  const tc = {
    chains: [{ config: { name: "base", usdc_decimals: 6, max_swap_usdc: "5000000" }, venue: { decimals: 8 }, usdc: "0", stock: "0", in_transit: "0" }],
    solana: {
      config: { name: "solana", max_swap_usdc: "5000000" },
      venue: { chain: "solana", decimals: 8 },
      usdc: "0",
      stock: "100000000", // 1 NVDAx = $180
      in_transit: "0",
    },
  };
  const all = ledgerChains(tc);
  assert.deepEqual(all.map((c) => c.config.name), ["base", "solana"]);
  assert.equal(all[1].config.usdc_decimals, 6);
  // 100 cash + 180 stock on Solana: buffer 56 -> 44 above, capped at 5 by max_swap_usdc.
  const args = { treasuryUsdc: "100000000", price, cashBufferBps: 2000 };
  assert.equal(sendableEstimate({ ...args, chains: all, chain: "solana" }), 5_000_000n);
  // 50 cash: with the Solana stock counted the buffer is 46 (4 above); without it, 10 (capped at 5).
  assert.equal(sendableEstimate({ ...args, treasuryUsdc: "50000000", chains: all, chain: "base" }), 4_000_000n);
  assert.equal(sendableEstimate({ ...args, treasuryUsdc: "50000000", chains: tc.chains, chain: "base" }), 5_000_000n);
  assert.deepEqual(ledgerChains({ chains: tc.chains, solana: null }).length, 1);
});
