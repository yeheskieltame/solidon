// Broadcaster: sends every transaction a meme has signed through Chain Signatures that its chain
// has not mined yet (`get_signed_tx(chain, nonce)` for nonces from the treasury's on-chain nonce up
// to the meme's next nonce). It holds no key for the treasury and trusts nothing: anyone can run
// it, and running it twice is safe. It also keeps a little ETH on the treasury for gas, from the
// keeper wallet, since a treasury without gas cannot land its own transactions.
import { noncesToBroadcast } from "./logic.js";
import { log, errMsg } from "./log.js";
import { signFromWallet, txHash } from "./evm.js";

const fmtEth = (wei) => (Number(wei) / 1e18).toFixed(6);

async function ensureGas(ctx, evm, address) {
  const { cfg, wallet } = ctx;
  const have = await evm.balance(address);
  if (have >= cfg.treasuryGasMin) return true;
  const scope = `gas:${evm.name}`;
  if (cfg.treasuryGasTopup === 0n || !wallet) {
    log.warn(scope, `treasury has ${fmtEth(have)} ETH, below the minimum, and auto top-up is off`, { address });
    return false;
  }
  if (cfg.dryRun) {
    log.dry(scope, `send ${fmtEth(cfg.treasuryGasTopup)} ETH from the keeper wallet to treasury ${address}`, { has: fmtEth(have) });
    return false;
  }
  const tx = await signFromWallet(evm, wallet, { to: address, value: cfg.treasuryGasTopup });
  await evm.sendRaw(tx.raw);
  const r = await evm.waitReceipt(tx.hash, cfg.receiptTimeoutSecs);
  log.info(scope, `topped up treasury gas with ${fmtEth(cfg.treasuryGasTopup)} ETH`, {
    status: r ? Number(BigInt(r.status)) : "pending",
    tx: evm.txUrl(tx.hash),
  });
  return Boolean(r && BigInt(r.status) === 1n);
}

/** Broadcasts pending signed transactions of one meme on every chain. */
export async function broadcast(ctx, meme) {
  const { tc } = meme;
  if (!tc?.address) return;
  for (const chain of tc.chains) {
    const name = chain.config.name;
    const evm = ctx.world.evm[name];
    if (!evm) continue;
    const scope = `broadcast:${name}`;
    try {
      const mined = await evm.nonce(tc.address);
      const nonces = noncesToBroadcast(mined, chain.nonce);
      if (mined > chain.nonce) {
        log.warn(scope, `${meme.id}: treasury nonce on chain ${mined} is ahead of the meme's ${chain.nonce}`);
      }
      if (!nonces.length) continue;
      log.info(scope, `${meme.id}: ${nonces.length} signed tx to send`, { treasury: tc.address, mined, signed: chain.nonce });
      if (!(await ensureGas(ctx, evm, tc.address)) && !ctx.cfg.dryRun) continue;
      for (const n of nonces) {
        const raw = await ctx.near.view(meme.id, "get_signed_tx", { chain: name, nonce: n });
        if (!raw) {
          log.error(scope, `${meme.id}: no signed tx for nonce ${n}; later nonces cannot land before it`);
          break;
        }
        const hash = txHash(raw);
        if (ctx.cfg.dryRun) {
          log.dry(scope, `broadcast nonce ${n}`, { tx: evm.txUrl(hash) });
          continue;
        }
        await evm.sendRaw(raw);
        const r = await evm.waitReceipt(hash, ctx.cfg.receiptTimeoutSecs);
        if (!r) {
          log.warn(scope, `nonce ${n} not mined after ${ctx.cfg.receiptTimeoutSecs}s, retrying next cycle`, { tx: evm.txUrl(hash) });
          break;
        }
        const ok = BigInt(r.status) === 1n;
        (ok ? log.info : log.error)(
          scope,
          ok ? `nonce ${n} mined` : `nonce ${n} REVERTED: the meme booked it as done, the ledger now drifts from the chain`,
          { block: Number(BigInt(r.blockNumber)), gas: Number(BigInt(r.gasUsed)), tx: evm.txUrl(hash) },
        );
      }
    } catch (e) {
      log.error(scope, `${meme.id}: ${errMsg(e)}`);
    }
  }
}
