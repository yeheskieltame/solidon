// Testnet bridge: the stand-in for the Intents/1Click leg of `fund_chain` (docs/SPEC.md, "Fund the
// treasury"). The keeper's NEAR account is every meme's `bridge` and `relayer`.
//
// 1. Detect: NearBlocks v3 lists USDC transfers to the keeper; each new one from a meme is read
//    back from NEAR RPC (`EXPERIMENTAL_receipt`: sender, `ft_transfer` args, memo) so the indexer
//    is only a hint. The memo `solidon fund <chain> <treasury>` says where to deliver.
// 2. Deliver: the same amount of that chain's testnet USDC (decimals converted) from the keeper
//    wallet to the treasury, capped by what the meme still has in transit there minus what the
//    keeper already delivered (so a lost state file or a replayed event cannot over-deliver).
//    The signed tx is saved before it is broadcast, so a crash never sends it twice.
// 3. Prove: `credit_cash` with the receipt's Transfer log on MPC-verified chains (Base),
//    `report_cash` on relayer chains (Robinhood).
// Each transfer is processed once: its NEAR receipt id keys the state file.
import { findTransferLog, owedToChain, parseFundMemo, scaleAmount, USDC_DECIMALS } from "./logic.js";
import { functionCallOf } from "./near.js";
import { getJson } from "./net.js";
import { log, errMsg } from "./log.js";
import { signFromWallet } from "./evm.js";
import { readMeme } from "./world.js";

const usd = (raw6) => (Number(raw6) / 1e6).toFixed(2);
const PENDING = new Set(["sending", "delivered"]);

/** Records new USDC transfers from memes to the keeper in `state.transfers`. */
export async function scanIncoming(ctx) {
  const { cfg, near, world, state } = ctx;
  const memes = new Set(world.memes);
  const headers = cfg.nearblocksKey ? { authorization: `Bearer ${cfg.nearblocksKey}` } : {};
  const url = `${cfg.nearblocksApi}/v3/accounts/${cfg.keeperAccount}/ft-txns?limit=50`;
  let events;
  try {
    events = (await getJson(url, headers, "nearblocks ft-txns")).data ?? [];
  } catch (e) {
    log.warn("bridge", `cannot list incoming transfers (retrying next cycle): ${errMsg(e)}`);
    return;
  }
  let fresh = 0;
  for (const ev of events.slice().reverse()) {
    if (ev.contract_account_id !== world.usdc || BigInt(ev.delta_amount) <= 0n) continue;
    if (!memes.has(ev.involved_account_id) || state.transfers[ev.receipt_id]) continue;
    const t = { meme: ev.involved_account_id, near_tx: ev.transaction_hash, seen_at: new Date().toISOString() };
    const receipt = await near.receipt(ev.receipt_id);
    const fc = functionCallOf(receipt);
    const fund = parseFundMemo(fc?.args?.memo);
    if (
      receipt.predecessor_id !== t.meme ||
      fc?.method !== "ft_transfer" ||
      fc.args.receiver_id !== cfg.keeperAccount ||
      !fund
    ) {
      state.transfers[ev.receipt_id] = { ...t, status: "ignored", memo: fc?.args?.memo ?? null };
      log.warn("bridge", `transfer from ${t.meme} is not a fund_chain transfer: ignored`, { receipt: ev.receipt_id });
    } else {
      state.transfers[ev.receipt_id] = { ...t, status: "received", chain: fund.chain, to: fund.to, amount6: fc.args.amount };
      log.info("bridge", `received ${usd(fc.args.amount)} USDC from ${t.meme} for ${fund.chain}`, {
        to: fund.to,
        tx: near.txUrl(t.near_tx),
      });
    }
    fresh++;
    state.save();
  }
  if (!fresh) log.info("bridge", "no new transfers", { scanned: events.length });
}

/** 6-decimal USDC the keeper delivered to (meme, chain) and is still waiting to have credited. */
function pendingDelivered(state, meme, chain) {
  return Object.values(state.transfers)
    .filter((t) => t.meme === meme && t.chain === chain && PENDING.has(t.status))
    .reduce((sum, t) => sum + BigInt(t.evm.delivered6), 0n);
}

/** Delivers, settles and credits every open transfer of the memes in `snapshots`. */
export async function processTransfers(ctx, snapshots) {
  for (const [id, t] of Object.entries(ctx.state.transfers)) {
    if (!["received", "sending", "delivered"].includes(t.status)) continue;
    const meme = snapshots.get(t.meme);
    if (!meme?.tc) continue;
    const scope = `bridge:${t.chain}`;
    try {
      if (t.status === "received") await deliver(ctx, id, t, meme, scope);
      if (t.status === "sending") await settle(ctx, t, scope);
      if (t.status === "delivered") await credit(ctx, t, meme, scope);
      // A credit lowers in_transit: later transfers of this meme must see the new value.
      if (t.status === "credited") snapshots.set(t.meme, await readMeme(ctx.near, t.meme));
    } catch (e) {
      log.error(scope, `${t.meme} transfer ${id}: ${errMsg(e)}`);
    }
    ctx.state.save();
  }
}

async function deliver(ctx, id, t, meme, scope) {
  const { cfg, state, wallet } = ctx;
  const evm = ctx.world.evm[t.chain];
  const chain = meme.tc.chains.find((c) => c.config.name === t.chain);
  if (!evm || !chain) {
    t.status = "ignored";
    log.error(scope, `${t.meme}: unknown chain ${t.chain} in memo`, { receipt: id });
    return;
  }
  if (t.to !== meme.tc.address?.toLowerCase()) {
    t.status = "ignored";
    log.error(scope, `${t.meme}: memo treasury ${t.to} is not the meme's ${meme.tc.address}`, { receipt: id });
    return;
  }
  const owed = owedToChain(chain.in_transit, pendingDelivered(state, t.meme, t.chain));
  const amount6 = BigInt(t.amount6) < owed ? BigInt(t.amount6) : owed;
  if (amount6 === 0n) {
    t.status = "nothing-owed";
    log.warn(scope, `${t.meme}: nothing in transit left to deliver for this transfer (already delivered or returned)`, {
      receipt: id,
    });
    return;
  }
  const amountRaw = scaleAmount(amount6, USDC_DECIMALS, evm.usdcDecimals);
  const what = `${usd(amount6)} USDC (${amountRaw} raw) to treasury ${t.to}`;
  if (cfg.dryRun || !wallet) {
    if (cfg.dryRun) log.dry(scope, `deliver ${what}, then ${evm.proof === "Relayer" ? "report_cash" : "credit_cash"}`);
    else log.error(scope, "no keeper EVM key (EVM_DEPLOYER_PRIVATE_KEY): cannot deliver");
    return;
  }
  const [usdcBal, ethBal] = await Promise.all([evm.erc20Balance(evm.usdc, wallet.address), evm.balance(wallet.address)]);
  if (usdcBal < amountRaw || ethBal === 0n) {
    log.warn(scope, `keeper wallet cannot deliver ${what}: fund it`, {
      wallet: wallet.address,
      usdc_raw: usdcBal,
      needs_raw: amountRaw,
      eth_wei: ethBal,
    });
    return;
  }
  const tx = await signFromWallet(evm, wallet, { token: evm.usdc, to: t.to, amount: amountRaw });
  t.status = "sending";
  t.evm = { hash: tx.hash, raw: tx.raw, nonce: tx.nonce, amount_raw: amountRaw.toString(), delivered6: amount6.toString() };
  state.save(); // before broadcasting: a restart resumes this exact transaction
  await evm.sendRaw(tx.raw);
  log.info(scope, `sent ${what}`, { tx: evm.txUrl(tx.hash) });
}

async function settle(ctx, t, scope) {
  const evm = ctx.world.evm[t.chain];
  let r = await evm.receipt(t.evm.hash);
  if (!r) {
    await evm.sendRaw(t.evm.raw); // idempotent: same nonce, same hash
    r = await evm.waitReceipt(t.evm.hash, ctx.cfg.receiptTimeoutSecs);
  }
  if (!r) {
    log.warn(scope, `delivery not mined yet, retrying next cycle`, { tx: evm.txUrl(t.evm.hash) });
    return;
  }
  if (BigInt(r.status) !== 1n) {
    t.status = "failed";
    log.error(scope, `delivery REVERTED: in-transit cash stays booked; deliver by hand`, { tx: evm.txUrl(t.evm.hash) });
    return;
  }
  t.status = "delivered";
  log.info(scope, `delivered to ${t.to}`, { block: Number(BigInt(r.blockNumber)), tx: evm.txUrl(t.evm.hash) });
}

async function credit(ctx, t, meme, scope) {
  const { near, cfg } = ctx;
  const evm = ctx.world.evm[t.chain];
  let call;
  if (evm.proof === "Relayer") {
    call = { method: "report_cash", args: { chain: t.chain, tx_hash: t.evm.hash, amount: t.evm.amount_raw }, tgas: 30 };
  } else {
    const r = await evm.receipt(t.evm.hash);
    const found = findTransferLog(r, evm.usdc, meme.tc.address);
    if (!found) throw new Error(`no USDC Transfer to the treasury in ${t.evm.hash}`);
    if (found.position !== found.logIndex) {
      log.warn(scope, `logIndex ${found.logIndex} differs from the position ${found.position} in the receipt; the MPC may index by position`);
    }
    call = {
      method: "credit_cash",
      args: { chain: t.chain, tx_hash: t.evm.hash, log_index: found.logIndex, log: found.log },
      tgas: 300,
    };
  }
  let credited;
  try {
    const res = await near.call(`bridge:${t.chain}`, t.meme, call);
    if (res === null) return; // dry run
    credited = BigInt(res.value ?? 0);
  } catch (e) {
    if (/Already credited/.test(errMsg(e))) credited = -1n;
    else {
      credited = 0n;
      log.warn(scope, `${call.method} failed: ${errMsg(e)}`);
    }
  }
  if (credited !== 0n) {
    t.status = "credited";
    log.info(scope, `${t.meme}: ${call.method} done`, { credited6: credited > 0n ? credited : "earlier" });
    return;
  }
  t.credit_attempts = (t.credit_attempts ?? 0) + 1;
  if (t.credit_attempts >= cfg.creditMaxAttempts) {
    t.status = "credit-failed";
    log.error(scope, `${t.meme}: ${call.method} gave no credit after ${t.credit_attempts} tries; check by hand`, {
      tx: evm.txUrl(t.evm.hash),
    });
  } else {
    log.warn(scope, `${t.meme}: ${call.method} gave no credit (try ${t.credit_attempts}), retrying next cycle`);
  }
}
