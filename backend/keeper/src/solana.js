// Solana leg of the treasury (contracts/meme/src/solana_treasury.rs), per meme whose
// `get_treasury_chains().solana` is set and whose stock trades there:
//
// 1. Setup: `init_solana_treasury()` (anyone, once), then `set_solana_accounts(usdc_bump,
//    stock_bump)` (relayer = this keeper) with the canonical bumps of the treasury's USDC (SPL
//    Token) and stock (Token-2022) associated token accounts; re-set if the stored ones differ.
// 2. Gas: keeps the treasury above TREASURY_SOL_MIN from the keeper wallet. The treasury is the
//    fee payer of its swaps and pays the first stock token account rent (~0.002 SOL).
// 3. Last buy: the ledger books a buy when it is signed, so each cycle the meme's last signed
//    buy is checked on Solana first. Landed: done. Unknown with a valid blockhash: sent again.
//    Expired (or landed with an error, which moves nothing): `resign_solana(new blockhash,
//    tick arrays)` once 200 NEAR blocks have passed since it was signed (the contract enforces
//    it), then the new transaction is broadcast. A new buy never starts before the last landed.
// 4. Buy: when the Solana ledger holds at least FUND_MIN_USDC, the price is fresh and nothing is
//    in flight: read the pool, pick up to 3 initialized tick arrays in the swap direction
//    (`planSolanaSwap`), a recent blockhash, `buy_stock_solana` (300 TGas), then send
//    `get_signed_tx("solana", seq)` at once and confirm (the blockhash lives ~60-90 s).
// 5. Fund: `fund_chain("solana")` under the same rule as the EVM chains (treasury.js).
//
// Bridge deliveries to the Solana treasury (memo `solidon fund solana <address>`) are in
// bridge.js; their Solana part is `deliverSolana` / `settleSolana` here.
import {
  SOLANA,
  associatedTokenAccount,
  fundTarget,
  ledgerChains,
  parseSolanaTx,
  planSolanaSwap,
  sendableEstimate,
  solTopup,
  solanaBuyAction,
  solanaTokenAccounts,
} from "./logic.js";
import { log, errMsg } from "./log.js";
import { readMeme } from "./world.js";
import { RpcError } from "./net.js";
import { fmtSol, keeperUsdcAccount, signSolTransfer, signUsdcDelivery } from "./sol.js";

const usd = (raw6) => (Number(raw6) / 1e6).toFixed(2);
/** Rent of a token account (~0.00204 SOL) plus fees: what a delivery may cost the keeper. */
const DELIVERY_SOL = 3_000_000n;

/** The keeper's per-meme Solana record in state.json: last landed seq, resigns of the current buy. */
function record(state, memeId) {
  state.data.solana ??= {};
  return (state.data.solana[memeId] ??= { landed_seq: null, resigns: 0 });
}

/** One write on the meme; the re-read meme, or null under --dry-run or on failure. */
// Views read `final` state, which trails the call's own result by a few blocks: a re-read right
// after `buy_stock_solana` can still miss the new `last_buy` (seen live: the buy was signed but the
// keeper skipped its broadcast). `until` polls the view until it shows the call's effect.
async function call(ctx, meme, scope, method, args, tgas, until = () => true) {
  try {
    const r = await ctx.near.call(scope, meme.id, { method, args, tgas });
    if (r === null) return null;
    let m = await readMeme(ctx.near, meme.id);
    for (let i = 0; i < 8 && !until(m); i++) {
      await new Promise((ok) => setTimeout(ok, ctx.cfg.viewLagMs ?? 1500));
      m = await readMeme(ctx.near, meme.id);
    }
    return m;
  } catch (e) {
    log.error(scope, `${method} failed (it may still be executing; re-read next cycle)`, { error: errMsg(e) });
    return null;
  }
}

/** Last lines of a failed preflight's program logs, for the error line. */
function preflightLogs(e) {
  const logs = e instanceof RpcError ? e.data?.data?.logs : null;
  return Array.isArray(logs) ? logs.slice(-3).join(" | ") : undefined;
}

/** Sends a signed transaction (idempotent); false when the node rejects it in preflight. */
async function send(ctx, scope, raw, what) {
  try {
    await ctx.sol.rpc.send(raw);
    return true;
  } catch (e) {
    if (/already been processed/i.test(errMsg(e))) return true;
    log.error(scope, `${what} rejected by sendTransaction`, { error: errMsg(e), logs: preflightLogs(e) });
    return false;
  }
}

/** Broadcasts `get_signed_tx(chain, seq)` and waits for it; true once it landed without error. */
async function broadcastSeq(ctx, meme, scope, seq) {
  const { rpc } = ctx.sol;
  const s = meme.tc.solana;
  const raw = await ctx.near.view(meme.id, "get_signed_tx", { chain: s.config.name, nonce: seq });
  if (!raw) {
    log.error(scope, `no signed transaction for seq ${seq}`);
    return false;
  }
  const { signature } = parseSolanaTx(raw);
  if (ctx.cfg.dryRun) {
    log.dry(scope, `broadcast seq ${seq}`, { tx: rpc.txUrl(signature) });
    return false;
  }
  if (!(await send(ctx, scope, raw, `seq ${seq}`))) return false;
  const st = await rpc.confirm(signature, ctx.cfg.solana.confirmTimeoutSecs);
  const landed = Boolean(st && !st.err && ["confirmed", "finalized"].includes(st.confirmationStatus));
  if (landed) {
    const r = record(ctx.state, meme.id);
    r.landed_seq = seq;
    r.resigns = 0;
    ctx.state.save();
    log.info(scope, `seq ${seq} landed`, { slot: st.slot, tx: rpc.txUrl(signature) });
  } else if (st?.err) {
    log.error(scope, `seq ${seq} landed with an error (nothing moved; resign_solana retries it)`, {
      err: st.err,
      tx: rpc.txUrl(signature),
    });
  } else {
    log.warn(scope, `seq ${seq} not confirmed after ${ctx.cfg.solana.confirmTimeoutSecs}s, checked again next cycle`, {
      tx: rpc.txUrl(signature),
    });
  }
  return landed;
}

/** Tick arrays of the meme's pool for a swap now: `[[start, bump], ...]`. */
async function swapPlan(ctx, s) {
  const pool = s.venue.solana.pool;
  const data = await ctx.sol.rpc.accountData(pool);
  if (!data) throw new Error(`pool ${pool} not found on Solana`);
  const plan = planSolanaSwap({
    pool,
    poolData: data,
    clmm: s.config.clmm_program,
    usdcMint: s.config.usdc_mint,
    stockMint: s.venue.token,
    venue: s.venue.solana,
  });
  if (plan.tickArrays.length < 2) {
    log.warn("solana", `pool ${pool} has only one initialized tick array ahead; a one-sided pool needs two (S25)`);
  }
  return plan;
}

/** Keeps the treasury's SOL above the minimum. False when it is short and was not topped up. */
async function ensureSol(ctx, scope, address) {
  const { rpc, keypair } = ctx.sol;
  const { treasuryMin, treasuryTopup } = ctx.cfg.solana;
  const have = await rpc.balance(address);
  const lamports = solTopup(have, treasuryMin, treasuryTopup);
  if (lamports === 0n) return true;
  const what = `send ${fmtSol(lamports)} SOL from the keeper wallet to treasury ${address}`;
  if (ctx.cfg.dryRun) {
    log.dry(scope, what, { has: fmtSol(have) });
    return false;
  }
  const keeperSol = await rpc.balance(keypair.publicKey.toBase58());
  if (keeperSol < lamports + 10_000n) {
    log.warn(scope, `cannot ${what}: the keeper wallet holds ${fmtSol(keeperSol)} SOL (airdrop it)`, {
      wallet: keypair.publicKey.toBase58(),
    });
    return false;
  }
  const { blockhash } = await rpc.latestBlockhash();
  const tx = signSolTransfer({ keypair, blockhash, to: address, lamports });
  if (!(await send(ctx, scope, tx.raw, "treasury SOL top-up"))) return false;
  const st = await rpc.confirm(tx.signature, ctx.cfg.solana.confirmTimeoutSecs);
  const ok = Boolean(st && !st.err);
  (ok ? log.info : log.warn)(scope, `${ok ? "topped up" : "top-up not confirmed:"} treasury SOL by ${fmtSol(lamports)}`, {
    tx: rpc.txUrl(tx.signature),
  });
  return ok;
}

/**
 * Settles the meme's last signed buy (step 3). Returns true when a new buy may start: there is
 * none, or the last one landed.
 */
async function settleLastBuy(ctx, meme, scope, gasOk) {
  const s = meme.tc.solana;
  const lb = s.last_buy;
  if (!lb) return true;
  const rec = record(ctx.state, meme.id);
  if (rec.landed_seq === lb.seq) return true;
  const { rpc } = ctx.sol;
  const raw = await ctx.near.view(meme.id, "get_signed_tx", { chain: s.config.name, nonce: lb.seq });
  if (!raw) {
    log.error(scope, `last buy seq ${lb.seq} has no signed transaction`);
    return false;
  }
  const tx = parseSolanaTx(raw);
  const status = await rpc.status(tx.signature);
  const blockhashValid = status ? null : await rpc.blockhashValid(tx.blockhash);
  const nearHeight = await ctx.near.blockHeight();
  const action = solanaBuyAction({ status, blockhashValid, nearHeight, signedAt: lb.signed_at });
  const fields = { seq: lb.seq, usdc_in: usd(lb.usdc_in), tx: rpc.txUrl(tx.signature) };

  if (action === "landed") {
    rec.landed_seq = lb.seq;
    rec.resigns = 0;
    ctx.state.save();
    log.info(scope, `last buy landed`, { ...fields, slot: status.slot });
    return true;
  }
  if (action === "pending") {
    log.info(scope, `last buy seen, not confirmed yet`, fields);
    return false;
  }
  if (action === "broadcast") {
    if (!gasOk && !ctx.cfg.dryRun) return false;
    log.info(scope, `last buy not on Solana yet and its blockhash is valid: sending`, fields);
    return broadcastSeq(ctx, meme, scope, lb.seq);
  }
  const why = status?.err ? `failed on Solana (${JSON.stringify(status.err)})` : "expired without landing";
  if (action === "wait-resign") {
    log.info(scope, `last buy ${why}; resign_solana allowed at NEAR block ${Number(lb.signed_at) + SOLANA.RESIGN_AFTER_BLOCKS}`, {
      ...fields,
      near_block: nearHeight,
    });
    return false;
  }
  // action === "resign"
  if (meme.tc.signing) {
    log.info(scope, `last buy ${why}; a signature is in flight, resign next cycle`, fields);
    return false;
  }
  if (rec.resigns >= ctx.cfg.solana.maxResigns) {
    log.error(scope, `last buy ${why} after ${rec.resigns} resigns (SOLANA_MAX_RESIGNS): check the pool by hand`, fields);
    return false;
  }
  if (!gasOk && !ctx.cfg.dryRun) return false;
  const plan = await swapPlan(ctx, s);
  const { blockhash } = await rpc.latestBlockhash();
  log.info(scope, `last buy ${why}: signing it again`, { ...fields, tick_arrays: plan.tickArrays });
  const after = await call(ctx, meme, scope, "resign_solana", { blockhash, tick_arrays: plan.tickArrays }, 300,
    (m) => m.tc?.solana?.last_buy?.seq !== lb.seq);
  if (!after) return false;
  rec.resigns += 1;
  ctx.state.save();
  const nb = after.tc.solana.last_buy;
  if (!nb || nb.seq === lb.seq) {
    log.warn(scope, "resign_solana gave no new signature (MPC rejected or timed out); retried next cycle");
    return false;
  }
  return broadcastSeq(ctx, after, scope, nb.seq);
}

/** Step 4: a new buy, broadcast at once. */
async function buy(ctx, meme, scope) {
  const s = meme.tc.solana;
  const plan = await swapPlan(ctx, s);
  const { blockhash } = await ctx.sol.rpc.latestBlockhash();
  log.info(scope, `buy ${usd(s.usdc)} USDC of ${s.venue.token}`, {
    tick_current: plan.tickCurrent,
    tick_arrays: plan.tickArrays,
    blockhash,
  });
  const after = await call(ctx, meme, scope, "buy_stock_solana", { blockhash, tick_arrays: plan.tickArrays }, 300,
    (m) => (m.tc?.solana?.last_buy?.seq ?? -1) >= s.seq);
  if (!after) return null;
  const nb = after.tc.solana.last_buy;
  if (!nb || nb.seq < s.seq) {
    log.warn(scope, "buy_stock_solana signed nothing (stale price, amount out of range or MPC rejection)");
    return after;
  }
  record(ctx.state, meme.id).resigns = 0;
  ctx.state.save();
  await broadcastSeq(ctx, after, scope, nb.seq);
  return readMeme(ctx.near, meme.id);
}

/** The Solana steps for one meme (see the top of this file). */
export async function solanaHousekeeping(ctx, meme) {
  let s = meme.tc?.solana;
  if (!s) return;
  const scope = `solana:${meme.id}`;
  if (!ctx.sol) {
    log.warn(scope, "no Solana RPC/wallet: skipped");
    return;
  }
  if (!s.venue?.solana) {
    log.info(scope, `${meme.info.stock.ticker} does not trade on Solana: nothing to do`);
    return;
  }
  if (!s.address) {
    await call(ctx, meme, scope, "init_solana_treasury", {}, 100);
    return; // the key arrives in a callback: accounts next cycle
  }
  const want = solanaTokenAccounts({ treasury: s.address, usdcMint: s.config.usdc_mint, stockMint: s.venue.token });
  if (s.usdc_account !== want.usdc.address || s.stock_account !== want.stock.address) {
    if (s.usdc_account) log.warn(scope, "stored token accounts are not the canonical ones: correcting", { usdc: s.usdc_account, stock: s.stock_account });
    const after = await call(
      ctx,
      meme,
      scope,
      "set_solana_accounts",
      { usdc_account_bump: want.usdc.bump, stock_account_bump: want.stock.bump },
      30,
    );
    if (after) {
      meme = after;
      s = meme.tc.solana;
    } else if (!ctx.cfg.dryRun) return; // a dry run plans the rest as if they were set
  }
  log.info(scope, `${meme.info.stock.ticker} on Solana`, {
    treasury: s.address,
    seq: s.seq,
    usdc: usd(s.usdc),
    in_transit: usd(s.in_transit),
    stock: s.stock,
    last_buy: s.last_buy ? `seq ${s.last_buy.seq} @ ${s.last_buy.signed_at}` : "none",
  });

  const gasOk = await ensureSol(ctx, scope, s.address);
  const free = await settleLastBuy(ctx, meme, scope, gasOk);
  if (s.last_buy && !ctx.cfg.dryRun) {
    meme = await readMeme(ctx.near, meme.id); // a resign may have changed it
    s = meme.tc.solana;
  }

  if (free && BigInt(s.usdc) >= ctx.cfg.fundMin6 && meme.price && !meme.tc.signing && (gasOk || ctx.cfg.dryRun)) {
    meme = (await buy(ctx, meme, scope)) ?? meme;
    s = meme.tc.solana;
  } else if (free && BigInt(s.usdc) >= ctx.cfg.fundMin6) {
    log.info(scope, `buy waits`, { price: meme.price ? "fresh" : "stale", signing: meme.tc.signing, gas: gasOk });
  }

  if (BigInt(s.in_transit) === 0n && BigInt(s.usdc) < ctx.cfg.fundMin6 && meme.price && fundTarget(meme.tc, meme.price) === s.config.name) {
    const est = sendableEstimate({
      treasuryUsdc: meme.treasury.treasury_usdc,
      chains: ledgerChains(meme.tc),
      chain: s.config.name,
      price: meme.price,
      cashBufferBps: meme.params.cash_buffer_bps,
    });
    if (est >= ctx.cfg.fundMin6) {
      log.info(scope, `${usd(est)} USDC above the cash buffer`);
      await call(ctx, meme, scope, "fund_chain", { chain: s.config.name }, 100);
    }
  }
}

// --- bridge: deliveries to the Solana treasury ----------------------------------------------

/**
 * Sends `amount6` Circle devnet USDC from the keeper wallet to the treasury's USDC account
 * (created if missing). The signed transaction is saved before it is sent.
 */
export async function deliverSolana(ctx, t, s, amount6, scope) {
  const what = `${usd(amount6)} USDC (${amount6} raw) to Solana treasury ${t.to}`;
  if (ctx.cfg.dryRun) {
    log.dry(scope, `deliver ${what}, then report_cash`);
    return;
  }
  if (!ctx.sol) {
    log.error(scope, "no Solana wallet: cannot deliver");
    return;
  }
  const { rpc, keypair } = ctx.sol;
  const usdcMint = s.config.usdc_mint;
  const account = associatedTokenAccount(t.to, SOLANA.TOKEN_PROGRAM, usdcMint).address;
  if (s.usdc_account && s.usdc_account !== account) {
    log.error(scope, `treasury USDC account ${s.usdc_account} is not the canonical ${account}: not delivering`);
    return;
  }
  const wallet = keypair.publicKey.toBase58();
  const [usdcBal, solBal] = await Promise.all([rpc.tokenBalance(keeperUsdcAccount(keypair, usdcMint)), rpc.balance(wallet)]);
  if ((usdcBal ?? 0n) < amount6 || solBal < DELIVERY_SOL) {
    log.warn(scope, `keeper Solana wallet cannot deliver ${what}: fund it`, {
      wallet,
      usdc_raw: usdcBal ?? 0n,
      needs_raw: amount6,
      sol: fmtSol(solBal),
    });
    return;
  }
  const { blockhash, lastValidBlockHeight } = await rpc.latestBlockhash();
  const tx = signUsdcDelivery({ keypair, blockhash, usdcMint, treasury: t.to, treasuryAccount: account, amount: amount6 });
  t.status = "sending";
  t.sol = {
    signature: tx.signature,
    raw: tx.raw,
    last_valid_height: lastValidBlockHeight,
    amount_raw: amount6.toString(),
    delivered6: amount6.toString(),
  };
  ctx.state.save(); // before sending: a restart resumes this exact transaction
  await send(ctx, scope, tx.raw, "delivery");
  log.info(scope, `sent ${what}`, { tx: rpc.txUrl(tx.signature) });
}

/**
 * A sent delivery: landed -> `delivered`; failed -> `failed`; unknown while its blockhash is
 * valid -> sent again; unknown after the finalized block height passed its last valid height ->
 * it can never land, so back to `received` for a new transaction.
 */
export async function settleSolana(ctx, t, scope) {
  const { rpc } = ctx.sol;
  let st = await rpc.status(t.sol.signature);
  if (!st) {
    if ((await rpc.blockHeight("finalized")) <= t.sol.last_valid_height) {
      await send(ctx, scope, t.sol.raw, "delivery");
      st = await rpc.confirm(t.sol.signature, ctx.cfg.solana.confirmTimeoutSecs);
    } else if (!(st = await rpc.status(t.sol.signature))) {
      log.warn(scope, "delivery expired without landing: sending a new one", { tx: rpc.txUrl(t.sol.signature) });
      (t.expired ??= []).push(t.sol.signature);
      delete t.sol;
      t.status = "received";
      return;
    }
  }
  if (!st || (!st.err && st.confirmationStatus === "processed")) {
    log.warn(scope, "delivery not confirmed yet, checked again next cycle", { tx: rpc.txUrl(t.sol.signature) });
    return;
  }
  if (st.err) {
    t.status = "failed";
    log.error(scope, `delivery FAILED on Solana (${JSON.stringify(st.err)}): in-transit cash stays booked; deliver by hand`, {
      tx: rpc.txUrl(t.sol.signature),
    });
    return;
  }
  t.status = "delivered";
  log.info(scope, `delivered to ${t.to}`, { slot: st.slot, tx: rpc.txUrl(t.sol.signature) });
}

/** Startup report of the keeper's Solana wallet; asks the devnet faucet for SOL when low. */
export async function solanaWalletReport(ctx, created) {
  const { rpc, keypair } = ctx.sol;
  const { registry, walletMin } = ctx.cfg.solana;
  const address = keypair.publicKey.toBase58();
  if (created) {
    log.warn(
      "wallet:solana",
      `created the keeper's Solana devnet wallet ${address} (${ctx.cfg.solana.keypairPath}). It needs devnet SOL (deliveries, treasury gas: requestAirdrop, 1 SOL each) and Circle devnet USDC (faucet.circle.com, Solana Devnet) for fund_chain deliveries`,
    );
  }
  try {
    const [sol, usdc] = await Promise.all([rpc.balance(address), rpc.tokenBalance(keeperUsdcAccount(keypair, registry.usdc))]);
    log.info("wallet:solana", address, { sol: fmtSol(sol), usdc: usd(usdc ?? 0n), explorer: rpc.addressUrl(address) });
    if (!usdc) log.warn("wallet:solana", `no Circle devnet USDC: get some at faucet.circle.com (Solana Devnet) for ${address}`);
    if (sol >= walletMin) return;
    if (ctx.cfg.dryRun) {
      log.dry("wallet:solana", `request a 1 SOL devnet airdrop for ${address}`);
      return;
    }
    const sig = await rpc.requestAirdrop(address, 1_000_000_000n);
    log.info("wallet:solana", "requested a 1 SOL devnet airdrop", { tx: rpc.txUrl(sig) });
  } catch (e) {
    log.warn("wallet:solana", `balance or airdrop failed: ${errMsg(e)}`);
  }
}
