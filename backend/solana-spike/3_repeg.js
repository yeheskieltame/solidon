// Re-peg a synthetic stock pool to the live Chainlink price.
//
// 1_setup.js put one-sided stock liquidity in [reference, ~2x reference], reference = the price at creation. When
// the oracle falls below the reference, a buy fills at the range edge, above the oracle, and the contract's min out
// (oracle - fee - 1%) rejects it (TooLittleOutputReceived, 6022). Per ticker whose pool is more than THRESHOLD_PCT
// (default 0.5%) above the oracle, the payer (mint authority) does:
//
//   a. mint stock to itself (swap budget + DEPTH_USD of new liquidity);
//   b. only if it holds no USDC and the price sits inside the range: sell stock back to the range edge
//      (returns the buyers' USDC, needed for c);
//   c. a USDC-only "sentinel" position, the one tick spacing that contains the target price. Past the range edge
//      the pool has no liquidity in the sell direction, and the program rejects such a swap even with a price
//      limit: LiquidityInsufficient (6019) with no initialized tick beyond the limit, TooSmallInputOrOutputAmount
//      (6026) when nothing is exchanged (both seen on devnet). The swap ends inside the sentinel and takes a
//      little of its USDC;
//   d. sell stock with sqrt_price_limit at TARGET x oracle (default 0.995): past the edge the ticks are empty, so
//      the price moves to the limit for almost nothing;
//   e. a one-sided stock position (DEPTH_USD) from just past the new price to the old range's inner edge, so the
//      liquidity is contiguous and a buy fills at about the oracle price.
//
// After d the price sits inside the sentinel, next to the new range. Resumable: every step is recorded in
// state.json under stocks.<T>.repegs. ONLY=NVDA,MSFT limits the tickers; DRY_RUN=1 prints the plan only.
// contracts/stocks/solana-devnet.json is not rewritten: its liquidity_range_ticks stay the original range.
import crypto from "node:crypto";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, mintTo,
} from "@solana/spl-token";
import { Raydium, TxVersion } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import Decimal from "decimal.js";
import { AMM_CONFIG, CLMM, USDC, conn, explorer, hoodCall, payer, readState, writeState } from "./rpc.js";

Decimal.set({ precision: 60 });
// Same Chainlink proxies as 1_setup.js (Robinhood Chain mainnet).
const FEEDS = { NVDA: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", AAPL: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
  MSFT: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E", GOOGL: "0xF6f373a037c30F0e5010d854385cA89185AE638b",
  AMZN: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C", META: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1",
  TSLA: "0x4A1166a659A55625345e9515b32adECea5547C38", SPCX: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb" };
const S_DEC = 8, U_DEC = 6, SPACING = 10, SPAN = 60 * SPACING;
const DEPTH_USD = Number(process.env.DEPTH_USD || 50_000);
const TARGET = new Decimal(process.env.TARGET || "0.995"); // new pool price / oracle
const THRESHOLD = new Decimal(process.env.THRESHOLD_PCT || "0.5").div(100);
const SENTINEL_USDC = 10_000n; // 0.01 USDC
const ONLY = process.env.ONLY?.split(",").map((t) => t.trim().toUpperCase());
const DRY = !!process.env.DRY_RUN;
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const Q64 = new Decimal(2).pow(64);

const kp = payer();
const st = readState();
const save = () => writeState(st);
console.log("payer", kp.publicKey.toBase58(), DRY ? "(DRY_RUN)" : "");
const raydium = await Raydium.load({ connection: conn, owner: kp, cluster: "devnet", disableLoadToken: true, disableFeatureCheck: true });

const be32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, CLMM)[0];
const floorTo = (t, m) => Math.floor(t / m) * m;
const usdcAta = getAssociatedTokenAddressSync(USDC, kp.publicKey, false, TOKEN_PROGRAM_ID);
const bal = async (a) => BigInt((await conn.getTokenAccountBalance(a).catch(() => null))?.value.amount ?? "0");

async function chainlink(proxy) {
  const answer = BigInt("0x" + (await hoodCall(proxy, "0xfeaf968c")).slice(66, 130)); // latestRoundData().answer
  const dec = Number(BigInt(await hoodCall(proxy, "0x313ce567")));
  return new Decimal(answer.toString()).div(new Decimal(10).pow(dec));
}

async function ensureSol(min) {
  for (let i = 0; i < 4 && (await conn.getBalance(kp.publicKey)) < min * LAMPORTS_PER_SOL; i++) {
    const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL); // Alchemy devnet: 1 SOL per request
    await conn.confirmTransaction(sig, "confirmed");
    console.log("airdrop 1 SOL", sig);
  }
}

// Pool state (offsets as in 2_swap.js). Prices: raw = mint1 raw per mint0 raw; usd = USDC per stock.
async function readPool(id, stockIs0) {
  const d = (await conn.getAccountInfo(id)).data;
  const sqrt = d.readBigUInt64LE(253) + (d.readBigUInt64LE(261) << 64n);
  const raw = new Decimal(sqrt.toString()).div(Q64).pow(2);
  return {
    ammConfig: new PublicKey(d.subarray(9, 41)), vault0: new PublicKey(d.subarray(137, 169)), vault1: new PublicKey(d.subarray(169, 201)),
    observation: new PublicKey(d.subarray(201, 233)), tick: d.readInt32LE(269), sqrt,
    bitmap: Array.from({ length: 16 }, (_, i) => d.readBigUInt64LE(904 + 8 * i)),
    usd: stockIs0 ? raw.mul(10 ** (S_DEC - U_DEC)) : new Decimal(10 ** (S_DEC - U_DEC)).div(raw),
  };
}
const rawOfUsd = (usd, stockIs0) => (stockIs0 ? usd.div(10 ** (S_DEC - U_DEC)) : new Decimal(10 ** (S_DEC - U_DEC)).div(usd));
const sqrtX64 = (raw) => BigInt(raw.sqrt().mul(Q64).floor().toFixed(0));
const sqrtAtTick = (t) => sqrtX64(new Decimal("1.0001").pow(t));
const tickOfRaw = (raw) => Decimal.ln(raw).div(Decimal.ln("1.0001")).toNumber();

// Sell stock into the pool (stock in, USDC out) with a price limit: hand-built swap_v2, like 2_swap.js.
// Tick arrays: the initialized ones from the current price in the sell direction, nearest first, up to 3.
function swapTx(c, P, amountIn, limit) {
  const up = !c.stockIs0; // stock is token1: selling it raises the tick
  const isSet = (s) => { const i = s / SPAN + 512; return (P.bitmap[i >> 6] >> BigInt(i & 63)) & 1n; };
  const starts = [];
  for (let s = floorTo(P.tick, SPAN); Math.abs(s / SPAN) < 512 && starts.length < 3; s += up ? SPAN : -SPAN) if (isSet(s)) starts.push(s);
  const [inVault, outVault] = c.stockIs0 ? [P.vault0, P.vault1] : [P.vault1, P.vault0];
  const k = (pubkey, isWritable) => ({ pubkey, isSigner: false, isWritable });
  const disc = crypto.createHash("sha256").update("global:swap_v2").digest().subarray(0, 8);
  const mask = (1n << 64n) - 1n;
  const data = Buffer.concat([disc, u64(amountIn), u64(0n), u64(limit & mask), u64(limit >> 64n), Buffer.from([1])]);
  const ix = new TransactionInstruction({ programId: CLMM, data, keys: [
    { pubkey: kp.publicKey, isSigner: true, isWritable: true }, k(P.ammConfig, false), k(c.pool, true), k(c.stockAta, true), k(usdcAta, true),
    k(inVault, true), k(outVault, true), k(P.observation, true), k(TOKEN_PROGRAM_ID, false), k(TOKEN_2022_PROGRAM_ID, false), k(MEMO, false),
    k(c.mint, false), k(USDC, false), k(pda(Buffer.from("pool_tick_array_bitmap_extension"), c.pool.toBuffer()), true),
    ...starts.map((s) => k(pda(Buffer.from("tick_array"), c.pool.toBuffer(), be32(s)), true)),
  ] });
  return { starts, tx: new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, usdcAta, kp.publicKey, USDC, TOKEN_PROGRAM_ID), ix) };
}

// One-sided position through the SDK, with 1_setup.js's minimal poolInfo and protocol_position patch.
async function openPosition(c, P, lo, hi, baseMint, amount) {
  const mi = (m) => (m.equals(USDC)
    ? { address: USDC.toBase58(), programId: TOKEN_PROGRAM_ID.toBase58(), decimals: U_DEC }
    : { address: m.toBase58(), programId: TOKEN_2022_PROGRAM_ID.toBase58(), decimals: S_DEC });
  const poolInfo = { id: c.pool.toBase58(), programId: CLMM.toBase58(), mintA: mi(c.mint0), mintB: mi(c.mint1),
    config: { id: AMM_CONFIG.toBase58(), tickSpacing: SPACING } };
  const poolKeys = { vault: { A: P.vault0.toBase58(), B: P.vault1.toBase58() } };
  const { transaction, signers, extInfo } = await raydium.clmm.openPositionFromBase({
    poolInfo, poolKeys, tickLower: lo, tickUpper: hi, base: baseMint.equals(c.mint0) ? "MintA" : "MintB",
    baseAmount: new BN(amount.toString()), otherAmountMax: new BN(0), ownerInfo: { useSOLBalance: false }, txVersion: TxVersion.LEGACY,
  });
  const protocolPosition = pda(Buffer.from("position"), c.pool.toBuffer(), be32(lo), be32(hi));
  for (const ix of transaction.instructions)
    for (const key of ix.keys) if (key.pubkey.equals(extInfo.protocolPosition)) Object.assign(key, { pubkey: protocolPosition, isWritable: true });
  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
  const tx = await sendAndConfirmTransaction(conn, transaction, [kp, ...signers], { commitment: "confirmed" });
  return { tx, nft: extInfo.nftMint.toBase58() };
}

const send = (tx) => sendAndConfirmTransaction(conn, tx, [kp], { commitment: "confirmed" });

for (const [ticker, proxy] of Object.entries(FEEDS)) {
  if (ONLY && !ONLY.includes(ticker)) continue;
  const s = st.stocks?.[ticker];
  if (!s?.done) { console.log(`\n== ${ticker}: not set up (1_setup.js)`); continue; }
  const c = { pool: new PublicKey(s.pool), mint: new PublicKey(s.mint), stockIs0: s.stockIsMint0 };
  [c.mint0, c.mint1] = c.stockIs0 ? [c.mint, USDC] : [USDC, c.mint];
  c.stockAta = getAssociatedTokenAddressSync(c.mint, kp.publicKey, false, TOKEN_2022_PROGRAM_ID);

  s.repegs ??= [];
  let r = s.repegs.find((x) => !x.done);
  let P = await readPool(c.pool, c.stockIs0);
  const oracle = new Decimal(r?.oracleUsd ?? (await chainlink(proxy)));
  const diff = P.usd.div(oracle).sub(1);
  console.log(`\n== ${ticker}: pool $${P.usd.toFixed(4)} (tick ${P.tick}) oracle $${oracle.toFixed(4)} (${diff.mul(100).toFixed(2)}%)`);
  if (!r && diff.lte(THRESHOLD)) { console.log(`within ${THRESHOLD.mul(100)}%: nothing to do`); continue; }

  // Plan. Inner edge: the range edge nearest the price (the last repeg's range, else the setup range).
  const inner = s.repegs.filter((x) => x.done).at(-1)?.range ?? s.ticks;
  const targetUsd = oracle.mul(TARGET);
  const limit = sqrtX64(rawOfUsd(targetUsd, c.stockIs0));
  const tTarget = tickOfRaw(rawOfUsd(targetUsd, c.stockIs0)); // fractional tick of the limit
  // Sentinel: the one tick spacing that contains the limit, so the swap ends inside it and takes a little of its USDC.
  let lo = floorTo(tTarget, SPACING);
  if (lo === tTarget) lo -= SPACING;
  const sentinel = [lo, lo + SPACING];
  const depth = BigInt(new Decimal(DEPTH_USD).div(oracle).mul(10 ** S_DEC).floor().toFixed(0));
  const budget = depth / 100n; // stock for the swaps; the price limit stops them early
  const inside = c.stockIs0 ? P.tick >= inner[0] : P.tick < inner[1];
  const plan = { oracleUsd: oracle.toFixed(8), poolUsdBefore: P.usd.toFixed(4), tickBefore: P.tick, targetUsd: targetUsd.toFixed(4),
    limitTick: Number(tTarget.toFixed(2)), sentinel, innerEdge: c.stockIs0 ? inner[0] : inner[1], depthStock: depth.toString(),
    swapBudget: budget.toString(), priceInsideRange: inside };
  console.log("plan", JSON.stringify(plan));
  if (DRY) continue;
  if (!r) { r = { ...plan, startedAt: new Date().toISOString() }; s.repegs.push(r); save(); }
  await ensureSol(0.3);

  // a. mint the swap budget + new depth
  const have = await bal(c.stockAta);
  if (!r.mintToTx && have < depth + budget) {
    r.mintToTx = await mintTo(conn, kp, c.mint, c.stockAta, kp, depth + budget - have, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    save(); console.log("mintTo", explorer(r.mintToTx));
  }

  // b. USDC for the sentinel: sell back to the range edge (returns what buyers paid)
  if (!r.sentinelTx && !r.edgeSwapTx && (await bal(usdcAta)) < SENTINEL_USDC) {
    if (!inside) throw new Error(`${ticker}: payer needs ${SENTINEL_USDC} raw USDC for the sentinel and the pool holds none to sell back`);
    const { tx } = swapTx(c, P, budget, sqrtAtTick(c.stockIs0 ? inner[0] : inner[1]));
    r.edgeSwapTx = await send(tx); save();
    P = await readPool(c.pool, c.stockIs0);
    console.log(`edge swap -> tick ${P.tick}, payer USDC ${await bal(usdcAta)}`, explorer(r.edgeSwapTx));
  }

  // c. sentinel: USDC only, the spacing that contains the limit
  if (!r.sentinelTx) {
    const usdcHave = await bal(usdcAta);
    if (usdcHave < SENTINEL_USDC) throw new Error(`${ticker}: payer holds ${usdcHave} raw USDC < ${SENTINEL_USDC} for the sentinel`);
    const o = await openPosition(c, P, sentinel[0], sentinel[1], USDC, SENTINEL_USDC);
    Object.assign(r, { sentinelTx: o.tx, sentinelNft: o.nft }); save();
    console.log("sentinel", sentinel, explorer(o.tx));
  }

  // d. sell to the limit
  if (!r.repegSwapTx) {
    P = await readPool(c.pool, c.stockIs0);
    const usdc0 = await bal(usdcAta), stock0 = await bal(c.stockAta);
    const { tx, starts } = swapTx(c, P, budget, limit);
    r.repegSwapTx = await send(tx); r.repegSwapArrays = starts; save();
    P = await readPool(c.pool, c.stockIs0);
    r.stockSold = (stock0 - (await bal(c.stockAta))).toString(); r.usdcReceived = ((await bal(usdcAta)) - usdc0).toString();
    r.tickAfterSwap = P.tick; r.poolUsdAfterSwap = P.usd.toFixed(4); save();
    console.log(`repeg swap -> tick ${P.tick} $${P.usd.toFixed(4)}; sold ${r.stockSold} raw stock for ${r.usdcReceived} raw USDC`, explorer(r.repegSwapTx));
  }
  P = await readPool(c.pool, c.stockIs0);
  if (P.usd.div(targetUsd).sub(1).abs().gt(0.002)) throw new Error(`${ticker}: pool $${P.usd} is not at the target $${targetUsd}`);

  // e. new stock liquidity from just past the price to the inner edge
  if (!r.positionTx) {
    const range = c.stockIs0 ? [floorTo(P.tick, SPACING) + SPACING, inner[0]] : [inner[1], floorTo(P.tick, SPACING)];
    if (range[0] >= range[1]) throw new Error(`${ticker}: empty new range ${range}`);
    const amount = (await bal(c.stockAta)) < depth ? await bal(c.stockAta) : depth;
    const o = await openPosition(c, P, range[0], range[1], c.mint, amount);
    Object.assign(r, { range, positionTx: o.tx, positionNft: o.nft, positionStock: amount.toString() }); save();
    console.log("position", range, explorer(o.tx));
  }
  const edge = new Decimal("1.0001").pow(c.stockIs0 ? r.range[0] : -r.range[1]).mul(10 ** (S_DEC - U_DEC));
  Object.assign(r, { edgeUsd: edge.toFixed(4), poolUsdAfter: P.usd.toFixed(4), done: true, doneAt: new Date().toISOString() }); save();
  console.log(`${ticker} done: pool $${P.usd.toFixed(4)}, new range ${r.range} (edge $${edge.toFixed(4)}) vs oracle $${oracle.toFixed(4)}`);
}
