// Treasury housekeeping for one meme. Every method called here is open to anyone and checked by
// the contract; the keeper only decides *when*, from the views, so most calls are not wasted:
//   init_treasury -> approve_router(chain) -> fund_chain(chain) -> [bridge] -> buy_stock(chain)
//   rebalance() whenever the cooldown allows and the price is fresh.
// One MPC signature is in flight at a time per meme (`signing`), so signing steps wait for it.
import { rebalanceDue, scaleAmount, sendableEstimate, USDC_DECIMALS } from "./logic.js";
import { log, errMsg } from "./log.js";
import { readMeme } from "./world.js";

const usd = (raw6) => (Number(raw6) / 1e6).toFixed(2);

/** Runs one write and re-reads the meme; a failed call is logged and ends this meme's turn. */
async function step(ctx, meme, method, args, tgas) {
  try {
    const r = await ctx.near.call(`treasury:${meme.id}`, meme.id, { method, args, tgas });
    if (r === null) return meme; // dry run: nothing changed
    return await readMeme(ctx.near, meme.id);
  } catch (e) {
    log.error(`treasury:${meme.id}`, `${method}(${JSON.stringify(args)}) failed (it may still be executing; re-read next cycle)`, {
      error: errMsg(e),
    });
    return null;
  }
}

export async function housekeeping(ctx, meme) {
  const scope = `treasury:${meme.id}`;
  const now = Math.floor(Date.now() / 1000);
  log.info(scope, `${meme.info.stock.ticker}`, {
    cash: usd(meme.treasury.treasury_usdc),
    price: meme.price ? "fresh" : "stale",
    mnav_bps: meme.treasury.last_mnav_bps,
    next_rebalance: meme.treasury.next_rebalance,
  });

  if (meme.tc === undefined) {
    log.warn(scope, "pre-multichain meme code (no get_treasury_chains): only rebalance");
  } else {
    meme = await chainSteps(ctx, meme, scope);
    if (!meme) return;
  }

  if (!rebalanceDue(meme.treasury, now)) return;
  if (!meme.price) {
    log.info(scope, "rebalance skipped: oracle price is stale");
    return;
  }
  await step(ctx, meme, "rebalance", {}, 100);
}

async function chainSteps(ctx, meme, scope) {
  if (!meme.tc.address) {
    return step(ctx, meme, "init_treasury", {}, 100);
  }
  for (let i = 0; i < meme.tc.chains.length; i++) {
    const c = meme.tc.chains[i];
    const name = c.config.name;
    if (!c.venue) continue;
    const usdc6 = scaleAmount(c.usdc, c.config.usdc_decimals, USDC_DECIMALS);
    log.info(scope, `${name}`, {
      approved: c.approved,
      nonce: c.nonce,
      usdc: usd(usdc6),
      in_transit: usd(c.in_transit),
      stock: c.stock,
    });

    if (!c.approved) {
      if (meme.tc.signing) continue;
      meme = await step(ctx, meme, "approve_router", { chain: name }, 300);
      if (!meme) return null;
      continue;
    }
    if (usdc6 > 0n && meme.price && !meme.tc.signing) {
      meme = await step(ctx, meme, "buy_stock", { chain: name }, 300);
      if (!meme) return null;
    }
    // Send more cash only once the last lot has arrived and been spent.
    const cur = meme.tc.chains[i];
    const curUsdc6 = scaleAmount(cur.usdc, cur.config.usdc_decimals, USDC_DECIMALS);
    if (BigInt(cur.in_transit) === 0n && curUsdc6 < ctx.cfg.fundMin6 && meme.price) {
      const est = sendableEstimate({
        treasuryUsdc: meme.treasury.treasury_usdc,
        chains: meme.tc.chains,
        chain: name,
        price: meme.price,
        cashBufferBps: meme.params.cash_buffer_bps,
      });
      if (est >= ctx.cfg.fundMin6) {
        log.info(scope, `${name}: ${usd(est)} USDC above the cash buffer`);
        meme = await step(ctx, meme, "fund_chain", { chain: name }, 100);
        if (!meme) return null;
      }
    }
  }
  return meme;
}
