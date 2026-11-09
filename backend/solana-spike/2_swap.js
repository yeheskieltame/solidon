// Buy a synthetic stock with Circle devnet USDC on its Raydium CLMM devnet pool, with a HAND-BUILT legacy message.
// No SDK transaction builder: the message bytes are assembled here exactly as the NEAR contract must do it,
// then signed over the raw message bytes by ed25519 (the MPC EdDSA domain signs the same bytes, see S21).
// web3.js is used only for base58/PDA math and RPC.
//
//   TICKER=NVDA AMOUNT_USDC=1 MPC_SIGNER=creator.solidon.testnet node 2_swap.js
//
// Pools and mints come from contracts/stocks/solana-devnet.json (written by 1_setup.js).
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import Decimal from "decimal.js";
import { conn, CLMM, VENUES, keypair, payer, readState, writeState, explorer } from "./rpc.js";

const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const SLIPPAGE_BPS = 100n;
const MAX_TICK_ARRAYS = Number(process.env.MAX_TICK_ARRAYS || 3);

const venues = JSON.parse(fs.readFileSync(VENUES, "utf8"));
const TICKER = (process.env.TICKER || "NVDA").toUpperCase();
const stock = venues.stocks.find((s) => s.ticker === TICKER);
if (!stock) throw new Error(`unknown TICKER ${TICKER}; have ${venues.stocks.map((s) => s.ticker)}`);
const AMOUNT_IN = BigInt(new Decimal(process.env.AMOUNT_USDC || "1").mul(10 ** venues.usdc_decimals).floor().toFixed(0));
const st = readState();
const pool = new PublicKey(stock.pool), usdc = new PublicKey(venues.usdc), mint = new PublicKey(stock.token);
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, CLMM)[0];
const i32be = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
console.log(`buy ${stock.symbol} ${mint.toBase58()} with ${AMOUNT_IN} raw USDC on pool ${pool.toBase58()} (ref $${stock.ref_price_usd})`);

// --- 0. Treasury: one key = fee payer = token owner. MPC_SIGNER=<near account> uses the NEAR MPC-derived
// address (path "solana-treasury", EdDSA domain 1) and has v1.signer-prod.testnet sign; otherwise a throwaway key.
const MPC = "v1.signer-prod.testnet", MPC_PATH = "solana-treasury", MPC_SIGNER = process.env.MPC_SIGNER;
const near = (...args) => execFileSync("near", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const tre = MPC_SIGNER ? null : keypair("treasury");
const T = MPC_SIGNER
  ? new PublicKey(JSON.parse(near("contract", "call-function", "as-read-only", MPC, "derived_public_key", "json-args",
      JSON.stringify({ path: MPC_PATH, predecessor: MPC_SIGNER, domain_id: 1 }), "network-config", "testnet", "now")).split(":")[1])
  : tre.publicKey;
const inAta = getAssociatedTokenAddressSync(usdc, T, false, TOKEN_PROGRAM_ID);
const outAta = getAssociatedTokenAddressSync(mint, T, false, TOKEN_2022_PROGRAM_ID);
const bal = async (a) => (await conn.getTokenAccountBalance(a).catch(() => null))?.value.amount ?? "0";
console.log("treasury", T.toBase58(), MPC_SIGNER ? `(MPC, ${MPC_SIGNER})` : "(throwaway key)");
if ((await conn.getBalance(T)) < 0.01 * LAMPORTS_PER_SOL) {
  if (MPC_SIGNER) throw new Error("treasury has < 0.01 SOL");
  const kp = payer();
  await sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: T, lamports: 50_000_000 })), [kp]);
}
// The payer holds no Circle USDC (captcha faucet only): the treasury must already hold it.
if (BigInt(await bal(inAta)) < AMOUNT_IN) throw new Error(`treasury USDC account ${inAta.toBase58()} holds ${await bal(inAta)} < ${AMOUNT_IN}`);

// --- 1. Live pool state (the contract gets these bytes from a relayer and/or MPC AccountState verification).
const acc = (await conn.getAccountInfo(pool)).data;
const pk = (o) => new PublicKey(acc.subarray(o, o + 32));
const P = {
  ammConfig: pk(9), mint0: pk(73), mint1: pk(105), vault0: pk(137), vault1: pk(169), observation: pk(201),
  tickSpacing: acc.readUInt16LE(235), tickCurrent: acc.readInt32LE(269),
  bitmap: Array.from({ length: 16 }, (_, i) => acc.readBigUInt64LE(904 + 8 * i)),
};
const zeroForOne = P.mint0.equals(usdc); // input is token0 -> price moves down
if (!(zeroForOne ? P.mint1 : P.mint0).equals(mint)) throw new Error("pool mints do not match the venue file");
console.log("tickCurrent", P.tickCurrent, "tickSpacing", P.tickSpacing, "zeroForOne", zeroForOne, "range", stock.liquidity_range_ticks);

// PDAs the contract can derive with no live state, checked against the pool account.
const derived = {
  pool: pda(Buffer.from("pool"), P.ammConfig.toBuffer(), P.mint0.toBuffer(), P.mint1.toBuffer()),
  vault0: pda(Buffer.from("pool_vault"), pool.toBuffer(), P.mint0.toBuffer()),
  vault1: pda(Buffer.from("pool_vault"), pool.toBuffer(), P.mint1.toBuffer()),
  observation: pda(Buffer.from("observation"), pool.toBuffer()),
  bitmapExt: pda(Buffer.from("pool_tick_array_bitmap_extension"), pool.toBuffer()),
};
for (const k of ["pool", "vault0", "vault1", "observation"]) {
  const want = k === "pool" ? pool : P[k];
  if (!derived[k].equals(want)) throw new Error(`PDA mismatch for ${k}`);
}
console.log("PDA check ok: pool, vaults, observation derive from (ammConfig, mints)");

// Tick arrays: the INITIALIZED arrays in the swap direction, from the pool's 1024-bit bitmap
// (bit i <-> start index (i - 512) * 60 * tickSpacing). Uninitialized arrays cannot be passed.
// One-sided pools need more than the first: the price starts just outside the range, so the swap crosses the
// range edge (first array) and the program then loads the NEXT initialized array (the far edge) before it
// can take the step, even when the amount runs out long before that tick.
const span = 60 * P.tickSpacing;
const startOf = (tick) => Math.floor(tick / span) * span;
const isSet = (start) => { const i = start / span + 512; return (P.bitmap[i >> 6] >> BigInt(i & 63)) & 1n; };
const starts = [];
for (let s = startOf(P.tickCurrent); Math.abs(s / span) < 512 && starts.length < MAX_TICK_ARRAYS; s += zeroForOne ? -span : span)
  if (isSet(s)) starts.push(s);
if (!starts.length) throw new Error("no initialized tick array in the default bitmap (would need the extension account)");
const tickArrays = starts.map((s) => pda(Buffer.from("tick_array"), pool.toBuffer(), i32be(s)));
console.log("current array start", startOf(P.tickCurrent), "-> initialized arrays", starts.join(", "));

// Min out from the reference price (the contract takes it from its oracle): ref minus the 0.05% fee and slippage.
const ref = new Decimal(stock.ref_price_usd);
const refOut = BigInt(new Decimal(AMOUNT_IN.toString()).mul(new Decimal(10).pow(stock.decimals - venues.usdc_decimals)).div(ref).floor().toFixed(0));
const minOut = (refOut * (10_000n - 5n - SLIPPAGE_BPS)) / 10_000n;

// --- 2. Instructions.
const Q64 = 1n << 64n;
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const u128 = (n) => Buffer.concat([u64(n & (Q64 - 1n)), u64(n >> 64n)]);
const disc = crypto.createHash("sha256").update("global:swap_v2").digest().subarray(0, 8);
const swapData = Buffer.concat([disc, u64(AMOUNT_IN), u64(minOut), u128(0n), Buffer.from([1])]); // limit 0 = no limit, base input
const [inVault, outVault] = zeroForOne ? [P.vault0, P.vault1] : [P.vault1, P.vault0];
const W = true, R = false;
const ixs = [
  { // Associated Token Account: CreateIdempotent (data [1]) for the Token-2022 output account
    program: ATA_PROGRAM, data: Buffer.from([1]),
    keys: [[T, W, true], [outAta, W], [T, R], [mint, R], [SystemProgram.programId, R], [TOKEN_2022_PROGRAM_ID, R]],
  },
  { // Raydium CLMM swap_v2
    program: CLMM, data: swapData,
    keys: [
      [T, R, true], [P.ammConfig, R], [pool, W], [inAta, W], [outAta, W], [inVault, W], [outVault, W],
      [P.observation, W], [TOKEN_PROGRAM_ID, R], [TOKEN_2022_PROGRAM_ID, R], [MEMO, R], [usdc, R], [mint, R],
      [derived.bitmapExt, W], ...tickArrays.map((t) => [t, W]), // remaining accounts
    ],
  },
];

// --- 3. Legacy message, compiled by hand.
const metas = new Map(); // base58 -> {key, signer, writable}
const add = (key, writable, signer = false) => {
  const m = metas.get(key.toBase58()) ?? { key, signer: false, writable: false };
  m.signer ||= signer; m.writable ||= writable; metas.set(key.toBase58(), m);
};
add(T, true, true); // fee payer first
for (const ix of ixs) { for (const [k, w, s] of ix.keys) add(k, w, s); add(ix.program, false); }
const all = [...metas.values()];
const order = [(m) => m.signer && m.writable, (m) => m.signer && !m.writable, (m) => !m.signer && m.writable, (m) => !m.signer && !m.writable];
const keys = order.flatMap((f) => all.filter(f));
const index = (k) => keys.findIndex((m) => m.key.equals(k));
const shortvec = (n) => { const out = []; do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; out.push(b); } while (n); return Buffer.from(out); };
const header = Buffer.from([
  keys.filter((m) => m.signer).length,
  keys.filter((m) => m.signer && !m.writable).length,
  keys.filter((m) => !m.signer && !m.writable).length,
]);
const { blockhash } = await conn.getLatestBlockhash("finalized");
const message = Buffer.concat([
  header, shortvec(keys.length), ...keys.map((m) => m.key.toBuffer()), new PublicKey(blockhash).toBuffer(),
  shortvec(ixs.length),
  ...ixs.map((ix) => Buffer.concat([
    Buffer.from([index(ix.program)]), shortvec(ix.keys.length), Buffer.from(ix.keys.map(([k]) => index(k))),
    shortvec(ix.data.length), ix.data,
  ])),
]);
console.log(`message: ${message.length} bytes, ${keys.length} account keys, header [${[...header]}]; swap_v2 data ${swapData.length} bytes`);
console.log("swap_v2 data hex", swapData.toString("hex"), "| min out", minOut.toString(), "(ref out", refOut.toString() + ")");

const rpcCall = async (method, params) => {
  const r = await fetch(conn.rpcEndpoint, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json());
  if (r.error) throw Object.assign(new Error(r.error.message), { logs: r.error.data?.logs });
  return r.result;
};
const wireOf = (sig) => Buffer.concat([shortvec(1), sig, message]);

// --- 4. Simulate before signing (zero signature, sigVerify off): a failing message never reaches the MPC.
const sim = await rpcCall("simulateTransaction", [wireOf(Buffer.alloc(64)).toString("base64"), { encoding: "base64", sigVerify: false }]);
console.log("simulation:", sim.value.err ?? "ok", "| CU", sim.value.unitsConsumed);
if (sim.value.err) { console.log(sim.value.logs.join("\n")); process.exit(1); }
if (process.env.DRY_RUN) { console.log(sim.value.logs.filter((l) => /swap|Program log/i.test(l)).slice(-6).join("\n")); process.exit(0); }

// --- 5. Sign the raw message bytes (ed25519): by the NEAR MPC, or by the throwaway key.
let sig;
if (MPC_SIGNER) {
  const t0 = Date.now();
  const out = near("contract", "call-function", "as-transaction", MPC, "sign", "json-args",
    JSON.stringify({ request: { path: MPC_PATH, payload_v2: { Eddsa: message.toString("hex") }, domain_id: 1 } }),
    "prepaid-gas", "300.0 Tgas", "attached-deposit", "1 yoctoNEAR", "sign-as", MPC_SIGNER,
    "network-config", "testnet", "sign-with-keychain", "send");
  const s = JSON.parse(out.trim()).signature;
  sig = Buffer.from(Array.isArray(s) ? s : Buffer.from(s, "hex"));
  if (sig.length !== 64) throw new Error(`unexpected MPC signature: ${out.slice(0, 200)}`);
  if (!crypto.verify(null, message, crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), T.toBuffer()]), format: "der", type: "spki" }), sig))
    throw new Error("MPC signature does not verify against the treasury key");
  console.log(`MPC EdDSA signature in ${((Date.now() - t0) / 1000).toFixed(0)} s, verified against ${T.toBase58()}`);
} else {
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(tre.secretKey.subarray(0, 32))]);
  sig = crypto.sign(null, message, crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" }));
}
const wire = wireOf(sig);
console.log(`signed tx: ${wire.length} bytes (limit 1232)`);

// --- 6. Send and wait for finality.
const before = [await bal(inAta), await bal(outAta)];
const txid = await rpcCall("sendTransaction", [wire.toString("base64"), { encoding: "base64" }]);
console.log("sent", explorer(txid));
let status;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  status = (await rpcCall("getSignatureStatuses", [[txid]])).value[0];
  if (status?.confirmationStatus === "finalized") break;
}
console.log("status", status?.confirmationStatus, "err", status?.err);
const after = [await bal(inAta), await bal(outAta)];
const paid = BigInt(before[0]) - BigInt(after[0]), got = BigInt(after[1]) - BigInt(before[1]);
const price = got > 0n ? new Decimal(paid.toString()).div(10 ** venues.usdc_decimals).div(new Decimal(got.toString()).div(10 ** stock.decimals)) : null;
console.log(`USDC ${before[0]} -> ${after[0]} | ${stock.symbol} ${before[1]} -> ${after[1]} (raw); min out ${minOut}`);
if (price) console.log(`effective $${price.toFixed(4)} per ${stock.symbol} vs ref $${ref.toFixed(2)} (${price.div(ref).sub(1).mul(100).toFixed(3)}%)`);
(st.buys ??= []).push({
  ticker: TICKER, signer: MPC_SIGNER ? `mpc:${MPC_SIGNER}` : "throwaway", treasury: T.toBase58(), tx: txid,
  status: status?.confirmationStatus, err: status?.err, messageBytes: message.length, txBytes: wire.length,
  accountKeys: keys.length, computeUnits: sim.value.unitsConsumed, amountIn: AMOUNT_IN.toString(), minOut: minOut.toString(),
  usdc: [before[0], after[0]], stock: [before[1], after[1]], effectivePriceUsd: price?.toFixed(4), refPriceUsd: stock.ref_price_usd,
  tickCurrent: P.tickCurrent, tickArrayStarts: starts, tickArrays: tickArrays.map((t) => t.toBase58()),
});
writeState(st);
