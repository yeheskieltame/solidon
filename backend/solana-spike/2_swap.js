// Spike S24, step 2: swap mock USDC -> NVDAx on the Raydium CLMM devnet pool with a HAND-BUILT legacy message.
// No SDK transaction builder: the message bytes are assembled here exactly as the NEAR contract must do it,
// then signed with a raw ed25519 key (the MPC EdDSA domain signs the same bytes, see S21).
// web3.js is used only for base58/PDA math here and for funding the throwaway treasury.
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, transfer, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { conn, CLMM, keypair, payer, readState, writeState, explorer } from "./rpc.js";

const st = readState();
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const AMOUNT_IN = 100_000_000n; // 100 USDC (6 dp)
const SLIPPAGE_BPS = 100n;

const pool = new PublicKey(st.pool), usdc = new PublicKey(st.usdc), nvdax = new PublicKey(st.nvdax);
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, CLMM)[0];
const i32be = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };

// --- 0. Treasury: one key = fee payer = token owner. MPC_SIGNER=<near account> uses the NEAR MPC-derived
// address (path "solana-treasury", EdDSA domain 1) and has v1.signer-prod.testnet sign; otherwise a throwaway key.
const MPC = "v1.signer-prod.testnet", MPC_PATH = "solana-treasury", MPC_SIGNER = process.env.MPC_SIGNER;
const near = (...args) => execFileSync("near", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const tre = MPC_SIGNER ? null : keypair("treasury");
const T = MPC_SIGNER
  ? new PublicKey(JSON.parse(near("contract", "call-function", "as-read-only", MPC, "derived_public_key", "json-args",
      JSON.stringify({ path: MPC_PATH, predecessor: MPC_SIGNER, domain_id: 1 }), "network-config", "testnet", "now")).split(":")[1])
  : tre.publicKey;
const fundedKey = MPC_SIGNER ? `mpcFunded:${T.toBase58()}` : "treasuryFunded";
const inAta = getAssociatedTokenAddressSync(usdc, T, false, TOKEN_PROGRAM_ID);
const outAta = getAssociatedTokenAddressSync(nvdax, T, false, TOKEN_2022_PROGRAM_ID);
if (!st[fundedKey]) {
  const kp = payer();
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: T, lamports: 50_000_000 }));
  st.fundSolTx = await sendAndConfirmTransaction(conn, tx, [kp]);
  const src = getAssociatedTokenAddressSync(usdc, kp.publicKey, false, TOKEN_PROGRAM_ID);
  await getOrCreateAssociatedTokenAccount(conn, kp, usdc, T, false, "confirmed", undefined, TOKEN_PROGRAM_ID);
  st.fundUsdcTx = await transfer(conn, kp, src, inAta, kp, 1_000_000_000n, [], undefined, TOKEN_PROGRAM_ID);
  if (!MPC_SIGNER) st.treasury = T.toBase58();
  st[fundedKey] = true;
  writeState(st);
}
console.log("treasury", T.toBase58());

// --- 1. Live pool state (the contract gets these bytes from a relayer and/or MPC AccountState verification).
const acc = (await conn.getAccountInfo(pool)).data;
const pk = (o) => new PublicKey(acc.subarray(o, o + 32));
const P = {
  ammConfig: pk(9), mint0: pk(73), mint1: pk(105), vault0: pk(137), vault1: pk(169), observation: pk(201),
  tickSpacing: acc.readUInt16LE(235), sqrtPriceX64: acc.readBigUInt64LE(253) + (acc.readBigUInt64LE(261) << 64n),
  tickCurrent: acc.readInt32LE(269),
  bitmap: Array.from({ length: 16 }, (_, i) => acc.readBigUInt64LE(904 + 8 * i)),
};
const zeroForOne = P.mint0.equals(usdc); // input is token0 -> price moves down
console.log("tickCurrent", P.tickCurrent, "tickSpacing", P.tickSpacing, "zeroForOne", zeroForOne);

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

// Tick array: first INITIALIZED array in the swap direction, from the pool's 1024-bit bitmap
// (bit i <-> start index (i - 512) * 60 * tickSpacing). Uninitialized arrays cannot be passed.
const span = 60 * P.tickSpacing;
const startOf = (tick) => Math.floor(tick / span) * span;
const isSet = (start) => { const i = start / span + 512; return (P.bitmap[i >> 6] >> BigInt(i & 63)) & 1n; };
let start = startOf(P.tickCurrent);
while (!isSet(start)) {
  start += zeroForOne ? -span : span;
  if (Math.abs(start / span) >= 512) throw new Error("no initialized tick array in the default bitmap (would need the extension account)");
}
const tickArray = pda(Buffer.from("tick_array"), pool.toBuffer(), i32be(start));
console.log("current array start", startOf(P.tickCurrent), "-> first initialized", start, tickArray.toBase58());

// Min out: spot price minus 0.05% fee minus slippage (the contract would take this from its oracle).
const Q64 = 1n << 64n;
const spotOut = zeroForOne ? (AMOUNT_IN * P.sqrtPriceX64 * P.sqrtPriceX64) / (Q64 * Q64)
                           : (AMOUNT_IN * Q64 * Q64) / (P.sqrtPriceX64 * P.sqrtPriceX64);
const minOut = (spotOut * (10_000n - 5n - SLIPPAGE_BPS)) / 10_000n;

// --- 2. Instructions.
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const u128 = (n) => Buffer.concat([u64(n & (Q64 - 1n)), u64(n >> 64n)]);
const disc = crypto.createHash("sha256").update("global:swap_v2").digest().subarray(0, 8);
const swapData = Buffer.concat([disc, u64(AMOUNT_IN), u64(minOut), u128(0n), Buffer.from([1])]); // limit 0 = no limit, base input
const [inVault, outVault] = zeroForOne ? [P.vault0, P.vault1] : [P.vault1, P.vault0];
const W = true, R = false;
const ixs = [
  { // Associated Token Account: CreateIdempotent (data [1]) for the Token-2022 output account
    program: ATA_PROGRAM, data: Buffer.from([1]),
    keys: [[T, W, true], [outAta, W], [T, R], [nvdax, R], [SystemProgram.programId, R], [TOKEN_2022_PROGRAM_ID, R]],
  },
  { // Raydium CLMM swap_v2
    program: CLMM, data: swapData,
    keys: [
      [T, R, true], [P.ammConfig, R], [pool, W], [inAta, W], [outAta, W], [inVault, W], [outVault, W],
      [P.observation, W], [TOKEN_PROGRAM_ID, R], [TOKEN_2022_PROGRAM_ID, R], [MEMO, R], [usdc, R], [nvdax, R],
      [derived.bitmapExt, W], [tickArray, W], // remaining accounts
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
console.log("swap_v2 data hex", swapData.toString("hex"));

// --- 4. Sign the raw message bytes (ed25519) and send: by the NEAR MPC, or by the throwaway key.
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
const wire = Buffer.concat([shortvec(1), sig, message]);
console.log(`signed tx: ${wire.length} bytes (limit 1232)`);

const bal = async (a) => (await conn.getTokenAccountBalance(a).catch(() => null))?.value.amount ?? "0";
const before = [await bal(inAta), await bal(outAta)];
const rpcCall = async (method, params) => {
  const r = await fetch(conn.rpcEndpoint, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json());
  if (r.error) throw Object.assign(new Error(r.error.message), { logs: r.error.data?.logs });
  return r.result;
};
const b64 = wire.toString("base64");
const s = await rpcCall("simulateTransaction", [b64, { encoding: "base64" }]);
console.log("simulation:", s.value.err ?? "ok", "| CU", s.value.unitsConsumed);
if (s.value.err) { console.log(s.value.logs.join("\n")); process.exit(1); }
const txid = await rpcCall("sendTransaction", [b64, { encoding: "base64" }]);
console.log("sent", explorer(txid));
let status;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  status = (await rpcCall("getSignatureStatuses", [[txid]])).value[0];
  if (status?.confirmationStatus === "finalized") break;
}
console.log("status", status?.confirmationStatus, "err", status?.err);
const after = [await bal(inAta), await bal(outAta)];
console.log(`USDC ${before[0]} -> ${after[0]} | NVDAx ${before[1]} -> ${after[1]} (raw); min out ${minOut}`);
st[MPC_SIGNER ? "mpcSwap" : "swap"] = {
  tx: txid, status: status?.confirmationStatus, err: status?.err, messageBytes: message.length, txBytes: wire.length,
  accountKeys: keys.length, computeUnits: s.value.unitsConsumed, amountIn: AMOUNT_IN.toString(), minOut: minOut.toString(),
  usdc: [before[0], after[0]], nvdax: [before[1], after[1]], tickArrayStart: start, tickArray: tickArray.toBase58(),
  bitmapExt: derived.bitmapExt.toBase58(), observation: P.observation.toBase58(), vault0: P.vault0.toBase58(), vault1: P.vault1.toBase58(),
};
writeState(st);
