import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fillUsd,
  planRepeg,
  rawOfUsd,
  sqrtX96OfUsd,
  tickOfUsd,
  ticksOfWord,
  usdOfRaw,
  usdOfSqrtX96,
  usdOfTick,
  wordOfTick,
} from "../src/repeg-evm.js";

// Registry shapes: Base Sepolia (stock 8 dp is token1 vs Circle USDC 6 dp), Robinhood testnet (18/18, NVDA token0).
const BASE = { stockIs0: false, sDec: 8, uDec: 6 };
const HOOD = { stockIs0: true, sDec: 18, uDec: 18 };
const sqrtAtTick = (t) => BigInt(Math.floor(Math.sqrt(1.0001 ** t) * 2 ** 96));
const ORACLE_NVDA = 163.87192843; // Chainlink NVDA on 12 Nov 2026, the live re-peg's input
const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a / b - 1) < rel, `${a} vs ${b}`);

test("USD <-> raw price <-> tick <-> sqrtPriceX96 round-trip in both token orders", () => {
  for (const m of [BASE, HOOD]) {
    for (const usd of [0.5, 163.87, 642.58, 12_345]) {
      close(usdOfRaw(rawOfUsd(usd, m), m), usd);
      close(usdOfTick(tickOfUsd(usd, m), m), usd);
      close(usdOfSqrtX96(sqrtX96OfUsd(usd, m), m), usd, 1e-12);
    }
  }
  // deploy-testnet-stocks.py: Base NVDA range upper -5700 is the $177.56 reference (within one spacing).
  assert.ok(Math.abs(usdOfTick(-5700, BASE) / 177.56 - 1) < 0.006);
  // Robinhood NVDA (token0): range lower 51780 is the same reference.
  assert.ok(Math.abs(usdOfTick(51780, HOOD) / 177.56 - 1) < 0.006);
  // A higher stock price is a lower tick when the stock is token1, a higher one when it is token0.
  assert.ok(tickOfUsd(200, BASE) < tickOfUsd(100, BASE));
  assert.ok(tickOfUsd(200, HOOD) > tickOfUsd(100, HOOD));
});

test("tick bitmap words decode to initialized ticks (negative words included)", () => {
  assert.equal(wordOfTick(-5700, 60), -1); // compressed -95
  assert.equal(wordOfTick(-12660, 60), -1); // compressed -211
  assert.equal(wordOfTick(51780, 60), 3); // compressed 863
  assert.equal(wordOfTick(-15361, 60), -2);
  const word = (1n << BigInt(256 - 95)) | (1n << BigInt(256 - 211));
  assert.deepEqual(ticksOfWord(-1, word, 60), [-12660, -5700]);
  assert.deepEqual(ticksOfWord(3, 1n << 95n, 60), [51780]);
  assert.deepEqual(ticksOfWord(0, 0n, 60), []);
});

test("fill price: pool price inside liquidity, else the first initialized tick in the buy direction", () => {
  const ticks = [{ tick: -23880, net: 1n }, { tick: -16920, net: -1n }];
  // Base MSFT before any buy: slot0 half a spacing above the range, a buy fills from the range edge
  const fill = fillUsd({ m: BASE, tick: -16891, sqrtPriceX96: sqrtAtTick(-16890), liquidity: 0n, ticks });
  close(fill, usdOfTick(-16920, BASE));
  assert.ok(fill > usdOfSqrtX96(sqrtAtTick(-16890), BASE));
  close(fillUsd({ m: BASE, tick: -17000, sqrtPriceX96: sqrtAtTick(-17000), liquidity: 5n, ticks }), usdOfTick(-17000, BASE), 1e-6);
  assert.equal(fillUsd({ m: HOOD, tick: 100, sqrtPriceX96: sqrtAtTick(100), liquidity: 0n, ticks: [] }), Infinity);
});

test("plan: Base NVDA (token1) 7.9% above Chainlink -> sentinel, sell to 0.995x, position back to the old range", () => {
  const L = 127410301717n;
  const p = planRepeg({
    m: BASE, spacing: 60, tick: -5702, sqrtPriceX96: sqrtAtTick(-5701.5), liquidity: L,
    ticks: [{ tick: -12660, net: L }, { tick: -5700, net: -L }], oracleUsd: ORACLE_NVDA,
  });
  assert.equal(p.action, "repeg");
  assert.ok(p.gap > 0.07 && p.gap < 0.09);
  close(p.targetUsd, ORACLE_NVDA * 0.995);
  assert.equal(p.swap, true);
  assert.equal(p.covered, false);
  assert.deepEqual(p.sentinel, [-4920, -4860]); // the spacing that holds the target tick
  assert.ok(p.targetTick > -4920 && p.targetTick < -4860);
  assert.deepEqual(p.position, [-5700, -4920]); // contiguous: old range upper -> sentinel lower
  assert.ok(p.limitSqrtX96 > sqrtAtTick(-5702)); // selling token1 raises the price
});

test("plan: Robinhood NVDA (token0) -> same steps mirrored", () => {
  const L = 12757600642302092746895n;
  const p = planRepeg({
    m: HOOD, spacing: 60, tick: 51780, sqrtPriceX96: sqrtAtTick(51780.2), liquidity: L,
    ticks: [{ tick: 51780, net: L }, { tick: 58740, net: -L }], oracleUsd: ORACLE_NVDA,
  });
  assert.equal(p.action, "repeg");
  assert.equal(p.swap, true);
  assert.deepEqual(p.sentinel, [50940, 51000]);
  assert.deepEqual(p.position, [51000, 51780]);
  assert.ok(p.limitSqrtX96 < sqrtAtTick(51780)); // selling token0 lowers the price
});

test("plan: Base MSFT never bought (slot0 outside the range, L = 0) still re-pegs from the range edge", () => {
  const p = planRepeg({
    m: BASE, spacing: 60, tick: -16891, sqrtPriceX96: sqrtAtTick(-16890), liquidity: 0n,
    ticks: [{ tick: -23880, net: 9n }, { tick: -16920, net: -9n }], oracleUsd: 520.3158,
  });
  assert.equal(p.action, "repeg");
  assert.deepEqual(p.sentinel, [-16500, -16440]);
  assert.deepEqual(p.position, [-16920, -16500]);
});

test("plan: target inside existing liquidity -> swap only, no sentinel, no new position", () => {
  const p = planRepeg({
    m: BASE, spacing: 60, tick: -6000, sqrtPriceX96: sqrtAtTick(-6000), liquidity: 100n,
    ticks: [{ tick: -12660, net: 100n }, { tick: -5000, net: -100n }], oracleUsd: usdOfTick(-5500, BASE) / 0.995,
  });
  assert.equal(p.action, "repeg");
  assert.equal(p.swap, true);
  assert.equal(p.covered, true);
  assert.equal(p.sentinel, null);
  assert.equal(p.position, null);
});

test("plan: price already past the target (empty ticks) -> new position only, no swap", () => {
  const p = planRepeg({
    m: BASE, spacing: 60, tick: -16000, sqrtPriceX96: sqrtAtTick(-16000), liquidity: 0n,
    ticks: [{ tick: -23880, net: 9n }, { tick: -16920, net: -9n }], oracleUsd: 530,
  });
  assert.equal(p.action, "repeg");
  assert.equal(p.swap, false);
  assert.equal(p.sentinel, null);
  assert.deepEqual(p.position, [-16920, -16680]);
});

test("plan: below the oracle or within the threshold -> nothing to do", () => {
  const args = {
    m: HOOD, spacing: 60, tick: 51000, sqrtPriceX96: sqrtX96OfUsd(ORACLE_NVDA * 0.995, HOOD), liquidity: 1n,
    ticks: [{ tick: 50940, net: 1n }], oracleUsd: ORACLE_NVDA,
  };
  assert.equal(planRepeg(args).action, "none");
  assert.equal(planRepeg(args).reason, "pool below oracle");
  const within = planRepeg({ ...args, sqrtPriceX96: sqrtX96OfUsd(ORACLE_NVDA * 1.004, HOOD) });
  assert.equal(within.action, "none");
  assert.equal(within.reason, "within threshold");
  assert.equal(planRepeg({ ...args, sqrtPriceX96: sqrtX96OfUsd(ORACLE_NVDA * 1.006, HOOD) }).action, "repeg");
});
