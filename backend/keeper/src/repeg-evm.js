// Re-peg a synthetic stock pool (Uniswap v3, Base Sepolia / Robinhood testnet) to the Chainlink price.
//
// contracts/evm/deploy-testnet-stocks.py put one-sided stock liquidity in [ref, ~2x ref], ref = the Chainlink price
// at creation. When the stock falls, a buy still fills at the range edge, above the oracle, and the treasury swap
// (minAmountOut = oracle - 1%) reverts with "Too little received". Per pool whose next buy would fill more than
// THRESHOLD (0.5%) above the oracle, the deployer (MockERC20 owner) does:
//
//   1. mint stock to itself (swap budget + DEPTH_USD of new liquidity);
//   2. a USDC "sentinel" position, the one tick spacing that contains the target price, when nothing else has
//      liquidity there: SwapRouter02 rejects a swap that moves only through empty ticks (both deltas 0), so the swap
//      must end inside some liquidity;
//   3. sell stock with sqrtPriceLimitX96 at TARGET x oracle (0.995): it returns the buyers' USDC from the old range,
//      crosses the empty ticks for free and stops inside the sentinel;
//   4. a one-sided stock position from the sentinel's edge to the nearest existing liquidity edge (the old range),
//      so the liquidity is contiguous and a buy fills at about the oracle.
//
// When the pool price already sits on the oracle's side of the target (no buy since creation, slot0 outside the
// range), only step 4 is needed. When the target lies inside existing liquidity, only step 3.
// Stateless: every input (current price, initialized ticks, liquidity) is read from the pool, so a re-run after a
// partial failure simply plans again from what is on-chain. A pool below the oracle is left alone (buys are cheaper).
import { createPublicClient, createWalletClient, http, maxUint256, parseAbi } from "viem";
import { decodeLatestRoundData } from "./logic.js";
import { log, errMsg } from "./log.js";

const Q96 = 2 ** 96;
const LN_TICK = Math.log(1.0001);
const MIN_TICK = -887272;
const MAX_TICK = 887272;

const POOL = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function tickBitmap(int16) view returns (uint256)",
  "function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256, uint256, int56, uint160, uint32, bool initialized)",
]);
const TOKEN = parseAbi([
  "function owner() view returns (address)",
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
]);
const ROUTER = parseAbi([
  "struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(P params) payable returns (uint256 amountOut)",
]);
const NPM = parseAbi([
  "struct M { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(M params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

// ---- pure price math (unit-tested) ----------------------------------------------------------------------------
// `m` = { stockIs0, sDec, uDec }. Uniswap prices are token1 raw per token0 raw; "usd" is USDC per whole stock.

export const usdOfRaw = (raw, m) => (m.stockIs0 ? raw * 10 ** (m.sDec - m.uDec) : 10 ** (m.sDec - m.uDec) / raw);
export const rawOfUsd = (usd, m) => (m.stockIs0 ? usd / 10 ** (m.sDec - m.uDec) : 10 ** (m.sDec - m.uDec) / usd);
export const usdOfSqrtX96 = (sqrtX96, m) => usdOfRaw((Number(sqrtX96) / Q96) ** 2, m);
export const usdOfTick = (tick, m) => usdOfRaw(1.0001 ** tick, m);
/** Fractional tick of a USD price. */
export const tickOfUsd = (usd, m) => Math.log(rawOfUsd(usd, m)) / LN_TICK;
export const sqrtX96OfUsd = (usd, m) => BigInt(Math.floor(Math.sqrt(rawOfUsd(usd, m)) * Q96));
const floorTo = (t, step) => Math.floor(t / step) * step;

/** Initialized ticks of one tickBitmap word (`word` a bigint), ascending. */
export function ticksOfWord(wordPos, word, spacing) {
  const out = [];
  for (let b = 0; b < 256; b++) if ((word >> BigInt(b)) & 1n) out.push((wordPos * 256 + b) * spacing);
  return out;
}
/** Bitmap word index of a tick (compressed tick >> 8, rounding toward -infinity). */
export const wordOfTick = (tick, spacing) => Math.floor(Math.floor(tick / spacing) / 256);

/**
 * Price at which the next buy fills: the pool price when it sits in liquidity, else the first initialized tick in
 * the buy direction (a buy raises the tick when the stock is token0, lowers it when token1). Infinity: no liquidity.
 */
export function fillUsd({ m, tick, sqrtPriceX96, liquidity, ticks }) {
  if (liquidity > 0n) return usdOfSqrtX96(sqrtPriceX96, m);
  const next = m.stockIs0 ? ticks.find((t) => t.tick > tick) : ticks.findLast((t) => t.tick <= tick);
  return next ? usdOfTick(next.tick, m) : Infinity;
}

/**
 * Decides the re-peg of one pool. `ticks` = initialized ticks around the price, ascending, `{ tick, net }` with
 * net = liquidityNet (bigint). Returns `{ action: "none" | "repeg", poolUsd, fillUsd, gap, ... }`; for "repeg":
 * `swap` (sell stock to `limitSqrtX96`), `sentinel` / `position` tick ranges or null.
 */
export function planRepeg({ m, spacing, tick, sqrtPriceX96, liquidity, ticks, oracleUsd, threshold = 0.005, target = 0.995, spanTicks = 6960 }) {
  const poolUsd = usdOfSqrtX96(sqrtPriceX96, m);
  const fill = fillUsd({ m, tick, sqrtPriceX96, liquidity, ticks });
  const gap = fill / oracleUsd - 1;
  const base = { poolUsd, fillUsd: fill, oracleUsd, gap };
  if (!(oracleUsd > 0)) return { ...base, action: "none", reason: "no oracle price" };
  if (gap <= threshold) return { ...base, action: "none", reason: gap < 0 ? "pool below oracle" : "within threshold" };

  const targetUsd = oracleUsd * target;
  const targetTick = tickOfUsd(targetUsd, m);
  if (!(targetTick > MIN_TICK + spacing && targetTick < MAX_TICK - spacing)) throw new Error(`target tick ${targetTick} out of range`);
  const limitSqrtX96 = sqrtX96OfUsd(targetUsd, m);
  const s = floorTo(targetTick, spacing); // the spacing [s, s + spacing] contains the target
  // Selling stock moves the tick down when the stock is token0 (zeroForOne), up when it is token1.
  const swap = m.stockIs0 ? sqrtPriceX96 > limitSqrtX96 : sqrtPriceX96 < limitSqrtX96;
  let covered = false;
  if (swap) {
    // Active liquidity at the target: cross every initialized tick between the price and the target.
    let l = liquidity;
    for (const t of ticks) {
      if (m.stockIs0 && t.tick <= tick && t.tick > targetTick) l -= t.net;
      if (!m.stockIs0 && t.tick > tick && t.tick <= targetTick) l += t.net;
    }
    covered = l > 0n;
  }
  let position = null;
  if (!covered) {
    // New stock liquidity from the spacing next to the target to the nearest existing edge in the buy direction.
    if (m.stockIs0) {
      const lo = s + spacing;
      const edge = ticks.find((t) => t.tick >= lo)?.tick ?? lo + floorTo(spanTicks, spacing);
      if (edge > lo) position = [lo, edge];
    } else {
      const edge = ticks.findLast((t) => t.tick <= s)?.tick ?? s - floorTo(spanTicks, spacing);
      if (edge < s) position = [edge, s];
    }
  }
  if (!swap && !position) return { ...base, action: "none", reason: "target next to the liquidity edge" };
  return {
    ...base,
    action: "repeg",
    targetUsd,
    targetTick,
    limitSqrtX96,
    swap,
    covered,
    sentinel: swap && !covered ? [s, s + spacing] : null,
    position,
  };
}

// ---- chain access ---------------------------------------------------------------------------------------------

const LATEST_ROUND_DATA = "0xfeaf968c";

/** Chainlink price (Robinhood Chain mainnet proxy, 8 decimals) and its age. */
export async function chainlinkUsd(cfg, ticker) {
  if (!cfg.hoodMainnetUrl) throw new Error("ALCHEMY_API_KEY (or HOOD_MAINNET_RPC) is needed to read Chainlink");
  const hood = createPublicClient({ transport: http(cfg.hoodMainnetUrl, { retryCount: 5 }) });
  const r = decodeLatestRoundData(await hood.request({ method: "eth_call", params: [{ to: cfg.proxies[ticker], data: LATEST_ROUND_DATA }, "latest"] }));
  return { usd: Number(r.answer) / 1e8, ageSecs: Math.floor(Date.now() / 1000) - r.updatedAt };
}

/** Everything planRepeg needs, from the pool. */
export async function readPool(pc, pool, stock, opts = {}) {
  const read = (functionName, args) => pc.readContract({ address: pool, abi: POOL, functionName, args });
  const [slot0, liquidity, token0, fee, spacing] = await Promise.all([read("slot0"), read("liquidity"), read("token0"), read("fee"), read("tickSpacing")]);
  const spacingN = Number(spacing);
  const tick = Number(slot0[1]);
  // Ticks within `words` bitmap words around the price and the target (one word = 256 spacings, 15,360 ticks).
  const around = [tick, ...(opts.alsoTick !== undefined ? [Math.round(opts.alsoTick)] : [])];
  const words = opts.words ?? 2;
  const lo = wordOfTick(Math.min(...around), spacingN) - words;
  const hi = wordOfTick(Math.max(...around), spacingN) + words;
  const wordIds = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((w) => w >= -32768 && w <= 32767);
  const bitmaps = await Promise.all(wordIds.map((w) => read("tickBitmap", [w])));
  const initialized = wordIds.flatMap((w, i) => ticksOfWord(w, bitmaps[i], spacingN));
  const ticks = await Promise.all(initialized.map(async (t) => ({ tick: t, net: (await read("ticks", [t]))[1] })));
  return {
    sqrtPriceX96: slot0[0],
    tick,
    liquidity,
    fee: Number(fee),
    spacing: spacingN,
    stockIs0: token0.toLowerCase() === stock.toLowerCase(),
    ticks: ticks.sort((a, b) => a.tick - b.tick),
  };
}

/** viem clients for one keeper chain (`cfg.chains[name]`). */
export async function clientsFor(chain, account) {
  const transport = http(chain.url, { retryCount: 5, retryDelay: 1000 });
  const pc = createPublicClient({ transport });
  const id = await pc.getChainId();
  const vchain = { id, name: chain.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [chain.url] } } };
  return { pc, wc: account ? createWalletClient({ account, chain: vchain, transport }) : null };
}

const units = (x, dec) => BigInt(Math.floor(x * 10 ** dec));
const fmtUsd = (x) => (Number.isFinite(x) ? `$${x.toFixed(4)}` : "none");
export const pct = (x) => `${(x * 100).toFixed(2)}%`;

/**
 * Plans and (unless dryRun) executes the re-peg of one ticker on one EVM chain. `account` = viem account of the
 * MockERC20 owner (the deployer). Returns the plan plus `txs` (explorer links) and `after` (fill price after).
 */
export async function repegEvm(cfg, chainName, ticker, { account, dryRun, depthUsd = 50_000, threshold = 0.005, target = 0.995 }) {
  const chain = cfg.chains[chainName];
  const reg = chain.registry;
  const row = reg.stocks.find((s) => s.ticker === ticker);
  if (!row) throw new Error(`${ticker} not in ${chainName} registry`);
  if (!row.synthetic) return { action: "none", reason: "official token (not mintable)" };
  const scope = `repeg:${chainName}:${ticker}`;
  const { pc, wc } = await clientsFor(chain, dryRun ? null : account);
  const me = account?.address;
  // Uniswap orders the pair by address.
  const m = { stockIs0: BigInt(row.token) < BigInt(reg.usdc), sDec: row.decimals, uDec: reg.usdc_decimals };

  const oracle = await chainlinkUsd(cfg, ticker);
  const P = await readPool(pc, row.pool, row.token, { alsoTick: tickOfUsd(oracle.usd * target, m) });
  if (P.stockIs0 !== m.stockIs0) throw new Error(`${row.pool}: token0 is not what the address order says`);
  const plan = planRepeg({ m, spacing: P.spacing, tick: P.tick, sqrtPriceX96: P.sqrtPriceX96, liquidity: P.liquidity, ticks: P.ticks, oracleUsd: oracle.usd, threshold, target });
  const summary = { pool: fmtUsd(plan.poolUsd), fill: fmtUsd(plan.fillUsd), oracle: fmtUsd(oracle.usd), gap: pct(plan.gap), tick: P.tick, feed_age_s: oracle.ageSecs };
  if (plan.action === "none") {
    log.info(scope, `nothing to do (${plan.reason})`, summary);
    return { ...plan, chain: chainName, ticker };
  }

  const usdcRaw = await pc.readContract({ address: reg.usdc, abi: TOKEN, functionName: "balanceOf", args: [row.pool] });
  const sentinelUsdc = 10n ** BigInt(reg.usdc_decimals - 2); // 0.01 USDC
  const sentinelStock = units((0.02 / oracle.usd), row.decimals); // only used if the sentinel straddles the price
  const depth = plan.position ? units(depthUsd / oracle.usd, row.decimals) : 0n;
  // Every unit sold fetches at least the target price, and the pool cannot pay out more USDC than it holds.
  const budget = plan.swap ? units(((Number(usdcRaw) / 10 ** reg.usdc_decimals + 0.02) / plan.targetUsd) * 1.05, row.decimals) + 1n : 0n;
  const steps = {
    target: fmtUsd(plan.targetUsd),
    swap: plan.swap ? `sell <= ${budget} raw stock to sqrtPriceLimitX96 ${plan.limitSqrtX96}` : "none",
    sentinel: plan.sentinel?.join("..") ?? "none",
    position: plan.position ? `${plan.position.join("..")} with ${depth} raw stock` : "none",
  };
  if (dryRun) {
    log.dry(scope, "re-peg", { ...summary, ...steps });
    return { ...plan, chain: chainName, ticker, steps };
  }
  log.info(scope, "re-peg", { ...summary, ...steps });

  const owner = await pc.readContract({ address: row.token, abi: TOKEN, functionName: "owner" });
  if (owner.toLowerCase() !== me.toLowerCase()) throw new Error(`${me} is not the owner of ${row.symbol} (${owner}): cannot mint`);
  const npm = reg.uniswap_v3.position_manager;
  const router = reg.uniswap_v3.swap_router02;
  const [t0, t1] = m.stockIs0 ? [row.token, reg.usdc] : [reg.usdc, row.token];
  const txs = [];
  const send = async (label, req) => {
    const gas = await pc.estimateContractGas({ ...req, account });
    const hash = await wc.writeContract({ ...req, gas: (gas * 3n) / 2n });
    const r = await pc.waitForTransactionReceipt({ hash, timeout: (cfg.receiptTimeoutSecs ?? 120) * 1000 });
    const url = `${chain.explorer}/tx/${hash}`;
    if (r.status !== "success") throw new Error(`${label} reverted: ${url}`);
    log.info(scope, label, { tx: url });
    txs.push({ label, url });
  };
  const bal = (token) => pc.readContract({ address: token, abi: TOKEN, functionName: "balanceOf", args: [me] });
  const approve = async (token, spender, need) => {
    if (need === 0n) return;
    const a = await pc.readContract({ address: token, abi: TOKEN, functionName: "allowance", args: [me, spender] });
    if (a < need) await send(`approve ${token === reg.usdc ? "USDC" : row.symbol}`, { address: token, abi: TOKEN, functionName: "approve", args: [spender, maxUint256] });
  };
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1200);
  const mintPosition = (label, [lo, hi], stockAmt, usdcAmt) =>
    send(label, {
      address: npm,
      abi: NPM,
      functionName: "mint",
      args: [{
        token0: t0, token1: t1, fee: P.fee, tickLower: lo, tickUpper: hi,
        amount0Desired: m.stockIs0 ? stockAmt : usdcAmt, amount1Desired: m.stockIs0 ? usdcAmt : stockAmt,
        amount0Min: 0n, amount1Min: 0n, recipient: me, deadline: deadline(),
      }],
    });

  // 1. stock for the swap, the sentinel and the new position
  const needStock = budget + (plan.sentinel ? sentinelStock : 0n) + depth;
  const have = await bal(row.token);
  if (have < needStock) await send(`mint ${needStock - have} raw ${row.symbol}`, { address: row.token, abi: TOKEN, functionName: "mint", args: [me, needStock - have] });
  await approve(row.token, router, budget);
  await approve(row.token, npm, depth + (plan.sentinel ? sentinelStock : 0n));

  // 2. sentinel
  if (plan.sentinel) {
    const usdcHave = await bal(reg.usdc);
    if (usdcHave < sentinelUsdc) throw new Error(`deployer holds ${usdcHave} raw USDC < ${sentinelUsdc} for the sentinel`);
    await approve(reg.usdc, npm, sentinelUsdc);
    await mintPosition(`sentinel ${plan.sentinel.join("..")}`, plan.sentinel, sentinelStock, sentinelUsdc);
  }
  // 3. sell stock to the limit
  if (plan.swap) {
    await send("swap to target", {
      address: router,
      abi: ROUTER,
      functionName: "exactInputSingle",
      args: [{ tokenIn: row.token, tokenOut: reg.usdc, fee: P.fee, recipient: me, amountIn: budget, amountOutMinimum: 0n, sqrtPriceLimitX96: plan.limitSqrtX96 }],
    });
    const now = await readPool(pc, row.pool, row.token, { words: 0 });
    const at = usdOfSqrtX96(now.sqrtPriceX96, m);
    if (Math.abs(at / plan.targetUsd - 1) > 0.002) throw new Error(`pool at ${fmtUsd(at)} after the swap, target ${fmtUsd(plan.targetUsd)}`);
  }
  // 4. contiguous stock liquidity
  if (plan.position) await mintPosition(`position ${plan.position.join("..")}`, plan.position, depth, 0n);

  const after = await readPool(pc, row.pool, row.token);
  const fillAfter = fillUsd({ m, ...after });
  log.info(scope, "done", { pool: fmtUsd(usdOfSqrtX96(after.sqrtPriceX96, m)), fill: fmtUsd(fillAfter), oracle: fmtUsd(oracle.usd), gap: pct(fillAfter / oracle.usd - 1) });
  return { ...plan, chain: chainName, ticker, steps, txs, fillAfter, gapAfter: fillAfter / oracle.usd - 1 };
}

export { errMsg };
