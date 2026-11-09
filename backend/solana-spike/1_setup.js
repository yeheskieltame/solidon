// Solana devnet stock venues, written to contracts/stocks/solana-devnet.json (mirror of contracts/evm/deploy-testnet-stocks.py).
//
// For each of the 8 listed stocks: a synthetic Token-2022 mint (8 dp, like the real xStocks, with on-chain
// name/symbol metadata) and a Raydium CLMM pool on the devnet program against Circle devnet USDC, priced at the
// live Chainlink feed on Robinhood Chain mainnet.
//
// Pools hold one-sided liquidity: stock tokens only ($50k each), in the range [reference, ~2x reference], with
// the pool initialised just outside it. Buying the stock with USDC moves into the range, so the payer needs no
// USDC. (The treasury only ever buys.)
//
// Uses the Raydium SDK for pool and position only. Resumable: every step is recorded in state.json, mint keys
// live in .secrets/, and pools/positions are detected on-chain if a confirmation timed out. ONLY=NVDA,AAPL limits
// the run to some tickers; the JSON is written once all 8 are done.
import fs from "node:fs";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  ExtensionType, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TYPE_SIZE, createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction, getAssociatedTokenAddressSync, getMintLen, getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import { Raydium, TxVersion } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import Decimal from "decimal.js";
import { AMM_CONFIG, CLMM, USDC, VENUES, conn, explorer, hoodCall, keypair, payer, readState, writeState } from "./rpc.js";

Decimal.set({ precision: 60 });
// Official Chainlink proxies on Robinhood Chain mainnet (docs/SPIKE.md S19), same list as deploy-testnet-stocks.py.
const STOCKS = [["NVDA", "NVIDIA", "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15"],
  ["AAPL", "Apple", "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0"],
  ["MSFT", "Microsoft", "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E"],
  ["GOOGL", "Alphabet", "0xF6f373a037c30F0e5010d854385cA89185AE638b"],
  ["AMZN", "Amazon", "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C"],
  ["META", "Meta Platforms", "0x7C38C00C30BEe9378381E7B6135d7283356D71b1"],
  ["TSLA", "Tesla", "0x4A1166a659A55625345e9515b32adECea5547C38"],
  ["SPCX", "SpaceX", "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb"]];
const S_DEC = 8, U_DEC = 6, SPACING = 10, FEE = 500; // fee in 1e-6 units (0.05%), like Uniswap's fee tiers
const WIDTH = 6940; // 1.0001^6940 ~ 2.0, a multiple of the tick spacing
const DEPTH_USD = 50_000;
const ONLY = process.env.ONLY?.split(",");

const kp = payer();
const st = readState();
st.payer = kp.publicKey.toBase58();
st.stocks ??= {};
console.log("payer", st.payer);

const raydium = await Raydium.load({ connection: conn, owner: kp, cluster: "devnet", disableLoadToken: true, disableFeatureCheck: true });
const cfgData = (await conn.getAccountInfo(AMM_CONFIG)).data;
const ammConfig = {
  id: AMM_CONFIG, index: cfgData.readUInt16LE(9), protocolFeeRate: cfgData.readUInt32LE(43), tradeFeeRate: cfgData.readUInt32LE(47),
  tickSpacing: cfgData.readUInt16LE(51), fundFeeRate: cfgData.readUInt32LE(53), fundOwner: "", description: "",
};
if (ammConfig.tickSpacing !== SPACING || ammConfig.tradeFeeRate !== FEE) throw new Error(`unexpected AMM config ${JSON.stringify(ammConfig)}`);

async function ensureSol(min) {
  for (let i = 0; i < 4 && (await conn.getBalance(kp.publicKey)) < min * LAMPORTS_PER_SOL; i++) {
    // The public devnet faucet is closed (410); Alchemy's devnet endpoint serves 1 SOL per request.
    const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("airdrop 1 SOL", sig);
  }
  console.log("balance", (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL, "SOL");
}

async function chainlink(proxy) {
  const answer = BigInt("0x" + (await hoodCall(proxy, "0xfeaf968c")).slice(66, 130)); // latestRoundData().answer
  const dec = Number(BigInt(await hoodCall(proxy, "0x313ce567")));
  return new Decimal(answer.toString()).div(new Decimal(10).pow(dec));
}

const tickOf = (rawPrice) => Math.floor(Decimal.ln(rawPrice).div(Decimal.ln("1.0001")).toNumber() / SPACING) * SPACING;
const be32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, CLMM)[0];

async function createStockMint(mintKp, name, symbol) {
  const mint = mintKp.publicKey;
  const metadata = { mint, name, symbol, uri: "", additionalMetadata: [] };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length);
  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: kp.publicKey, newAccountPubkey: mint, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeMetadataPointerInstruction(mint, kp.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, S_DEC, kp.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, mint, metadata: mint, name, symbol, uri: "",
      mintAuthority: kp.publicKey, updateAuthority: kp.publicKey }),
  );
  return sendAndConfirmTransaction(conn, tx, [kp, mintKp], { commitment: "confirmed" });
}

const rows = [];
for (const [ticker, company, proxy] of STOCKS) {
  const s = (st.stocks[ticker] ??= {});
  const save = () => writeState(st);
  if (ONLY && !ONLY.includes(ticker)) { if (s.done) rows.push(s.row); continue; }
  const symbol = `${ticker}x`, name = `${company} (Solidon synthetic, devnet)`;
  console.log(`\n== ${ticker}`);
  if (!s.done) await ensureSol(0.3);

  // Reference price, fixed on first run so a resumed run uses the same ticks.
  if (!s.ref_price_usd) { s.ref_price_usd = (await chainlink(proxy)).toFixed(8); save(); }
  const ref = new Decimal(s.ref_price_usd);

  // 1. Mint (key kept in .secrets/, so a lost confirmation can be detected on-chain)
  const mintKp = keypair(`mint-${ticker}`);
  const mint = mintKp.publicKey;
  if (!s.mint) {
    if (!(await conn.getAccountInfo(mint))) s.createMintTx = await createStockMint(mintKp, name, symbol);
    s.mint = mint.toBase58(); save();
    console.log("mint", s.mint, s.createMintTx ? explorer(s.createMintTx) : "(found on-chain)");
  }
  const amount = BigInt(new Decimal(DEPTH_USD).div(ref).mul(10 ** S_DEC).floor().toFixed(0));
  const payerAta = await getOrCreateAssociatedTokenAccount(conn, kp, mint, kp.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID);
  if (!s.mintToTx && payerAta.amount < amount) {
    s.mintToTx = await mintTo(conn, kp, mint, payerAta.address, kp, amount - payerAta.amount, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
    save();
  }
  s.amount = amount.toString();

  // 2. Ticks. raw = USDC raw per stock raw at the reference price; tick price = mint1 raw per mint0 raw.
  const stockIs0 = Buffer.compare(mint.toBuffer(), USDC.toBuffer()) < 0;
  const [mint0, mint1] = stockIs0 ? [mint, USDC] : [USDC, mint];
  const raw = ref.mul(new Decimal(10).pow(U_DEC - S_DEC));
  let lo, hi, start;
  if (stockIs0) { // price = USDC per stock; a buy pushes it up, so the range sits above the start
    lo = tickOf(raw); hi = lo + WIDTH; start = lo - SPACING / 2;
  } else { // price = stock per USDC; a buy pushes it down, so the range sits below the start
    hi = tickOf(new Decimal(1).div(raw)) + SPACING; lo = hi - WIDTH; start = hi + SPACING / 2;
  }
  // USD per stock at the range edge nearest to the reference: at most one tick spacing (0.1%) below it.
  const edge = new Decimal("1.0001").pow(stockIs0 ? lo : -hi).mul(new Decimal(10).pow(S_DEC - U_DEC));
  if (edge.gt(ref) || edge.div(ref).lt(0.998)) throw new Error(`${ticker}: range edge ${edge} vs ref ${ref}`);
  Object.assign(s, { stockIsMint0: stockIs0, ticks: [lo, hi], startTick: start, edgeUsd: edge.toFixed(4) });
  save();

  // 3. Pool, initialised mid-spacing just outside the range.
  const poolId = pda(Buffer.from("pool"), AMM_CONFIG.toBuffer(), mint0.toBuffer(), mint1.toBuffer());
  if (!s.pool) {
    if (!(await conn.getAccountInfo(poolId))) {
      const token = (address, programId, decimals, sym) =>
        ({ chainId: 103, address: address.toBase58(), programId: programId.toBase58(), logoURI: "", symbol: sym, name: sym, decimals, tags: [], extensions: {} });
      const t0 = stockIs0 ? token(mint, TOKEN_2022_PROGRAM_ID, S_DEC, symbol) : token(USDC, TOKEN_PROGRAM_ID, U_DEC, "USDC");
      const t1 = stockIs0 ? token(USDC, TOKEN_PROGRAM_ID, U_DEC, "USDC") : token(mint, TOKEN_2022_PROGRAM_ID, S_DEC, symbol);
      const { execute, extInfo } = await raydium.clmm.createPool({
        programId: CLMM, mint1: t0, mint2: t1, ammConfig, txVersion: TxVersion.LEGACY,
        initialPrice: new Decimal("1.0001").pow(start).mul(new Decimal(10).pow(t0.decimals - t1.decimals)), // mint1 per mint0, UI units
      });
      if (extInfo.address.id !== poolId.toBase58()) throw new Error(`pool PDA mismatch ${extInfo.address.id}`);
      const { txId } = await execute({ sendAndConfirm: true });
      s.createPoolTx = txId;
    }
    s.pool = poolId.toBase58(); save();
    console.log("pool", s.pool, s.createPoolTx ? explorer(s.createPoolTx) : "(found on-chain)");
  }
  const poolAcc = (await conn.getAccountInfo(poolId)).data;
  const vaultStock = new PublicKey(poolAcc.subarray(stockIs0 ? 137 : 169, (stockIs0 ? 137 : 169) + 32));
  const tickNow = poolAcc.readInt32LE(269);
  if (!s.done && (stockIs0 ? tickNow >= lo : tickNow < hi)) throw new Error(`${ticker}: pool tick ${tickNow} is not outside [${lo}, ${hi}]`);

  // 4. One-sided position: stock only. The program derives liquidity from the base amount; USDC max is 0.
  const protocolPosition = pda(Buffer.from("position"), poolId.toBuffer(), be32(lo), be32(hi));
  if (!s.positionNft) {
    if (s.pendingNft && (await conn.getAccountInfo(protocolPosition))) {
      s.positionNft = s.pendingNft; // the last run's tx landed but its confirmation was lost
    } else {
      // getPoolInfoFromRpc() throws on a pool without tick arrays (SDK 0.2.84-alpha): build the minimal info by hand.
      const mi = (m) => (m.equals(USDC)
        ? { address: USDC.toBase58(), programId: TOKEN_PROGRAM_ID.toBase58(), decimals: U_DEC }
        : { address: m.toBase58(), programId: TOKEN_2022_PROGRAM_ID.toBase58(), decimals: S_DEC });
      const poolInfo = { id: s.pool, programId: CLMM.toBase58(), mintA: mi(mint0), mintB: mi(mint1),
        config: { id: AMM_CONFIG.toBase58(), tickSpacing: SPACING } };
      const poolKeys = { vault: { A: new PublicKey(poolAcc.subarray(137, 169)).toBase58(), B: new PublicKey(poolAcc.subarray(169, 201)).toBase58() } };
      const { transaction, signers, extInfo } = await raydium.clmm.openPositionFromBase({
        poolInfo, poolKeys, tickLower: lo, tickUpper: hi,
        base: stockIs0 ? "MintA" : "MintB", baseAmount: new BN(amount.toString()), otherAmountMax: new BN(0),
        ownerInfo: { useSOLBalance: false }, txVersion: TxVersion.LEGACY,
      });
      // The devnet program seeds protocol_position with big-endian ticks and creates it (so writable);
      // the SDK derives it little-endian and passes it read-only. Patch the key.
      for (const ix of transaction.instructions)
        for (const k of ix.keys) if (k.pubkey.equals(extInfo.protocolPosition)) Object.assign(k, { pubkey: protocolPosition, isWritable: true });
      transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
      s.pendingNft = extInfo.nftMint.toBase58(); save();
      s.openPositionTx = await sendAndConfirmTransaction(conn, transaction, [kp, ...signers], { commitment: "confirmed" });
      s.positionNft = s.pendingNft;
      console.log("openPosition", explorer(s.openPositionTx));
    }
    delete s.pendingNft; save();
  }

  // 5. Checks: the stock vault holds the liquidity, the pool sits just outside the range, and it holds no USDC.
  const vaultAmt = BigInt((await conn.getTokenAccountBalance(vaultStock)).value.amount);
  if (vaultAmt * 100n < amount * 99n) throw new Error(`${ticker}: stock vault holds ${vaultAmt}, expected ${amount}`);
  s.row = { ticker, name: company, token: s.mint, symbol, decimals: S_DEC, synthetic: true, pool: s.pool, pool_fee: FEE,
    ref_price_usd: ref.toFixed(2), liquidity_range_ticks: [lo, hi] };
  s.done = true; save();
  rows.push(s.row);
  console.log(`${ticker} ${symbol} ${s.mint} pool ${s.pool} ref $${ref.toFixed(2)} edge $${s.edgeUsd} tick ${tickNow} range [${lo}, ${hi}] vault ${vaultAmt}`);
}

if (rows.length === STOCKS.length) {
  const doc = {
    _comment: "Testnet stock venues on Solana devnet, written by backend/solana-spike/1_setup.js. synthetic=true: Solidon Token-2022 mint "
      + "(payer-only mint authority, metadata extension only), one-sided liquidity from the reference price to ~2x on Raydium CLMM. "
      + "pool_fee in 1e-6 units (500 = 0.05%); ticks are Raydium ticks of the pool's mint1-per-mint0 raw price (mint0 < mint1 bytewise).",
    network: "solana-devnet", usdc: USDC.toBase58(), usdc_decimals: U_DEC,
    usdc_token_program: TOKEN_PROGRAM_ID.toBase58(), stock_token_program: TOKEN_2022_PROGRAM_ID.toBase58(),
    raydium_clmm: { program: CLMM.toBase58(), amm_config: AMM_CONFIG.toBase58(), tick_spacing: SPACING },
    deployer: st.payer, stocks: rows,
  };
  fs.writeFileSync(VENUES, JSON.stringify(doc, null, 2) + "\n");
  console.log("\nwrote", VENUES);
} else {
  console.log(`\n${rows.length}/${STOCKS.length} stocks done; ${VENUES} is written once all are done`);
}
