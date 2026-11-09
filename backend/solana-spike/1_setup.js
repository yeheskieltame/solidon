// Spike S24, step 1: mock USDC (SPL Token, 6 dp) + synthetic NVDAx (Token-2022, 8 dp),
// a Raydium CLMM pool NVDAx/USDC at ~180 USDC per NVDAx and a wide position (90..360), on devnet.
// Uses the Raydium SDK for pool and position only. Idempotent: progress is kept in state.json.
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Raydium, TxVersion, TickUtil } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import Decimal from "decimal.js";
import { conn, CLMM, payer, readState, writeState, explorer } from "./rpc.js";

const AMM_CONFIG = new PublicKey("GVSwm4smQBYcgAJU7qjFHLQBHTc4AdB3F2HbZp6KqKof"); // index 2, 0.05% fee, tickSpacing 10
const kp = payer();
const st = readState();
st.payer = kp.publicKey.toBase58();
console.log("payer", st.payer);

// 1. SOL for fees and rent
if ((await conn.getBalance(kp.publicKey)) < 0.5 * LAMPORTS_PER_SOL) {
  // The public devnet RPC faucet is closed (410); Alchemy's devnet endpoint still serves airdrops.
  const sig = await conn.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
  console.log("airdrop", sig);
}
console.log("balance", (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL, "SOL");

// 2. Mints and payer balances
if (!st.usdc) {
  st.usdc = (await createMint(conn, kp, kp.publicKey, null, 6, undefined, undefined, TOKEN_PROGRAM_ID)).toBase58();
  writeState(st);
}
if (!st.nvdax) {
  st.nvdax = (await createMint(conn, kp, kp.publicKey, null, 8, undefined, undefined, TOKEN_2022_PROGRAM_ID)).toBase58();
  writeState(st);
}
const usdc = new PublicKey(st.usdc), nvdax = new PublicKey(st.nvdax);
console.log("mock USDC", st.usdc, "| NVDAx (Token-2022)", st.nvdax);
if (!st.minted) {
  const a = await getOrCreateAssociatedTokenAccount(conn, kp, usdc, kp.publicKey, false, "confirmed", undefined, TOKEN_PROGRAM_ID);
  const b = await getOrCreateAssociatedTokenAccount(conn, kp, nvdax, kp.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  st.mintUsdcTx = await mintTo(conn, kp, usdc, a.address, kp, 1_000_000n * 10n ** 6n, [], undefined, TOKEN_PROGRAM_ID);
  st.mintNvdaxTx = await mintTo(conn, kp, nvdax, b.address, kp, 10_000n * 10n ** 8n, [], undefined, TOKEN_2022_PROGRAM_ID);
  st.minted = true;
  writeState(st);
}

// 3. Pool
const raydium = await Raydium.load({ connection: conn, owner: kp, cluster: "devnet", disableLoadToken: true, disableFeatureCheck: true });
const token = (address, programId, decimals, symbol) =>
  ({ chainId: 103, address, programId: programId.toBase58(), logoURI: "", symbol, name: symbol, decimals, tags: [], extensions: {} });
if (!st.pool) {
  const cfg = await conn.getAccountInfo(AMM_CONFIG);
  const d = cfg.data;
  const ammConfig = {
    id: AMM_CONFIG, index: d.readUInt16LE(9), protocolFeeRate: d.readUInt32LE(43), tradeFeeRate: d.readUInt32LE(47),
    tickSpacing: d.readUInt16LE(51), fundFeeRate: d.readUInt32LE(53), fundOwner: "", description: "",
  };
  const { execute, extInfo } = await raydium.clmm.createPool({
    programId: CLMM,
    mint1: token(st.nvdax, TOKEN_2022_PROGRAM_ID, 8, "NVDAx"),
    mint2: token(st.usdc, TOKEN_PROGRAM_ID, 6, "USDC"),
    ammConfig,
    initialPrice: new Decimal(180), // mint2 per mint1: USDC per NVDAx
    txVersion: TxVersion.LEGACY,
  });
  const { txId } = await execute({ sendAndConfirm: true });
  st.pool = extInfo.address.id;
  st.createPoolTx = txId;
  writeState(st);
  console.log("createPool", explorer(txId));
}
console.log("pool", st.pool);

// 4. Wide position: 90..360 USDC per NVDAx, 100 NVDAx + matching USDC
// getPoolInfoFromRpc() throws on a pool without initialized tick arrays (SDK 0.2.84-alpha),
// so the minimal pool info is built from the raw pool account.
const rpc = await raydium.clmm.getRpcClmmPoolInfo({ poolId: st.pool });
const mintInfo = (m) => m.toBase58() === st.nvdax
  ? { address: st.nvdax, programId: TOKEN_2022_PROGRAM_ID.toBase58(), decimals: 8 }
  : { address: st.usdc, programId: TOKEN_PROGRAM_ID.toBase58(), decimals: 6 };
const poolInfo = {
  id: st.pool, programId: CLMM.toBase58(), mintA: mintInfo(rpc.mintA), mintB: mintInfo(rpc.mintB),
  config: { id: AMM_CONFIG.toBase58(), tickSpacing: rpc.tickSpacing },
};
const poolKeys = { vault: { A: rpc.vaultA.toBase58(), B: rpc.vaultB.toBase58() } };
if (!st.positionNft) {
  const nvdaxIsA = poolInfo.mintA.address === st.nvdax;
  const tickAt = (usdcPerNvdax) => TickUtil.getPriceAndTick({
    price: new Decimal(nvdaxIsA ? usdcPerNvdax : 1 / usdcPerNvdax), // mintB per mintA
    mintADecimals: poolInfo.mintA.decimals, mintBDecimals: poolInfo.mintB.decimals,
    zeroForOne: true, tickSpacing: poolInfo.config.tickSpacing,
  }).tick;
  const [t1, t2] = [tickAt(90), tickAt(360)];
  const { transaction, signers, extInfo } = await raydium.clmm.openPositionFromBase({
    poolInfo, poolKeys,
    tickLower: Math.min(t1, t2), tickUpper: Math.max(t1, t2),
    base: nvdaxIsA ? "MintA" : "MintB",
    baseAmount: new BN(100).mul(new BN(10).pow(new BN(8))),
    otherAmountMax: new BN(100_000).mul(new BN(10).pow(new BN(6))),
    ownerInfo: { useSOLBalance: false },
    txVersion: TxVersion.LEGACY,
  });
  // The devnet program seeds protocol_position with big-endian ticks; the SDK derives it little-endian
  // (fails with ConstraintSeeds 2006) and passes it read-only, but the program creates it, so it must be writable.
  const be = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  const [protocolPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), new PublicKey(st.pool).toBuffer(), be(Math.min(t1, t2)), be(Math.max(t1, t2))], CLMM);
  for (const ix of transaction.instructions)
    for (const k of ix.keys) if (k.pubkey.equals(extInfo.protocolPosition)) Object.assign(k, { pubkey: protocolPosition, isWritable: true });
  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
  const txId = await sendAndConfirmTransaction(conn, transaction, [kp, ...signers], { commitment: "confirmed" });
  st.positionNft = extInfo.nftMint.toBase58();
  st.openPositionTx = txId;
  st.ticks = [Math.min(t1, t2), Math.max(t1, t2)];
  writeState(st);
  console.log("openPosition", explorer(txId));
}
const vaults = await Promise.all([rpc.vaultA, rpc.vaultB].map((v) => conn.getTokenAccountBalance(v)));
const live = await raydium.clmm.getRpcClmmPoolInfo({ poolId: st.pool });
console.log("mintA", poolInfo.mintA.address, "mintB", poolInfo.mintB.address, "tick", live.tickCurrent,
  "price B/A", live.currentPrice, "| vault A", vaults[0].value.uiAmountString, "vault B", vaults[1].value.uiAmountString);
