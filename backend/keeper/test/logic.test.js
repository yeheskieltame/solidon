import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  chainlinkToPyth,
  decodeLatestRoundData,
  findTransferLog,
  fundTarget,
  noncesToBroadcast,
  owedToChain,
  parseFundMemo,
  rebalanceDue,
  redact,
  scaleAmount,
  sendableEstimate,
  stockValue,
  tickArrayStarts,
} from "../src/logic.js";
import { CHAINLINK_PROXIES, REPO, parseFlags, toUnits } from "../src/config.js";

const TREASURY = "0x680bcF5a2E3C07118991Adb3976d3dF077ed96EE";

test("parseFundMemo reads the memo fund_chain writes (cash.rs on_fund_price)", () => {
  assert.deepEqual(parseFundMemo(`solidon fund base ${TREASURY.toLowerCase()}`), {
    chain: "base",
    to: TREASURY.toLowerCase(),
  });
  assert.deepEqual(parseFundMemo(`solidon fund robinhood ${TREASURY}`), { chain: "robinhood", to: TREASURY.toLowerCase() });
  for (const bad of [
    null,
    undefined,
    "",
    "solidon fund base",
    `solidon fund base ${TREASURY} extra`,
    `solidon fund  base ${TREASURY}`,
    `solidon fund base 0x680bcf5a2e3c07118991adb3976d3df077ed96`, // 38 hex
    `solidon fund Base ${TREASURY}`,
    `xsolidon fund base ${TREASURY}`,
    `solidon fund base ${TREASURY}\n`,
  ]) {
    assert.equal(parseFundMemo(bad), null, String(bad));
  }
});

test("scaleAmount converts 6-decimal USDC to each chain's USDC and back", () => {
  assert.equal(scaleAmount(5_000_000n, 6, 6), 5_000_000n); // Base Sepolia Circle USDC
  assert.equal(scaleAmount(5_000_000n, 6, 18), 5_000_000_000_000_000_000n); // Robinhood testnet USDC
  assert.equal(scaleAmount("5000000000000000000", 18, 6), 5_000_000n);
  assert.equal(scaleAmount(1_999_999_999_999n, 18, 6), 1n); // floors
  assert.equal(scaleAmount(999_999_999_999n, 18, 6), 0n);
});

test("toUnits parses decimal strings", () => {
  assert.equal(toUnits("1", 6), 1_000_000n);
  assert.equal(toUnits("0.0005", 18), 500_000_000_000_000n);
  assert.equal(toUnits("2.5", 6), 2_500_000n);
  assert.equal(toUnits("0.1234567", 6), 123_456n);
});

test("latestRoundData decodes and maps to the mock's Pyth price", () => {
  const w = (n) => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, "0");
  const hex = `0x${w(42)}${w(17_756_000_000n)}${w(1_794_000_000)}${w(1_794_000_100)}${w(42)}`;
  const r = decodeLatestRoundData(hex);
  assert.equal(r.answer, 17_756_000_000n);
  assert.equal(r.updatedAt, 1_794_000_100);
  assert.deepEqual(chainlinkToPyth(r.answer, 8), { price: "17756000000", expo: -8 });

  const negative = decodeLatestRoundData(`0x${w(1)}${w(-5)}${w(0)}${w(0)}${w(1)}`);
  assert.equal(negative.answer, -5n);
  assert.equal(chainlinkToPyth(negative.answer, 8), null);
  assert.equal(chainlinkToPyth(0n, 8), null);
  assert.throws(() => decodeLatestRoundData("0x1234"));
});

test("findTransferLog returns credit_cash's log args (the S26 faucet transfer, cash.rs faucet_log)", () => {
  const receipt = {
    logs: [
      {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          "0x000000000000000000000000faec9cdc3ef75713b48f46057b98ba04885e3391",
          "0x000000000000000000000000680bcf5a2e3c07118991adb3976d3df077ed96ee",
        ],
        data: "0x0000000000000000000000000000000000000000000000000000000001312d00",
        blockHash: "0x8a50c1dd3825afc920ea387280ba631bbaf7a1107803da004466c8d181be0a43",
        blockNumber: "0x" + (56_635_495).toString(16),
        transactionIndex: "0x2",
        logIndex: "0x0",
      },
    ],
  };
  const found = findTransferLog(receipt, "0x036cbd53842c5426634e7929541ec2318f3dcf7e", TREASURY);
  assert.equal(found.logIndex, 0);
  assert.equal(found.position, 0);
  assert.equal(found.value, 20_000_000n);
  assert.deepEqual(found.log, {
    block_hash: "0x8a50c1dd3825afc920ea387280ba631bbaf7a1107803da004466c8d181be0a43",
    block_number: 56_635_495,
    transaction_index: 2,
    address: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x000000000000000000000000faec9cdc3ef75713b48f46057b98ba04885e3391",
      "0x000000000000000000000000680bcf5a2e3c07118991adb3976d3df077ed96ee",
    ],
    data: "0x0000000000000000000000000000000000000000000000000000000001312d00",
  });

  // Skips other tokens, other recipients and non-Transfer logs; keeps the receipt's logIndex.
  const other = { ...receipt.logs[0], address: "0x0000000000000000000000000000000000000001" };
  const toElse = { ...receipt.logs[0], topics: [receipt.logs[0].topics[0], receipt.logs[0].topics[1], receipt.logs[0].topics[1]] };
  const approval = { ...receipt.logs[0], topics: ["0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", ...receipt.logs[0].topics.slice(1)] };
  const late = { ...receipt.logs[0], logIndex: "0x7" };
  const r2 = findTransferLog({ logs: [other, toElse, approval, late] }, "0x036cbd53842c5426634e7929541ec2318f3dcf7e", TREASURY);
  assert.equal(r2.position, 3);
  assert.equal(r2.logIndex, 7);
  assert.equal(findTransferLog({ logs: [other, toElse, approval] }, "0x036cbd53842c5426634e7929541ec2318f3dcf7e", TREASURY), null);
  assert.equal(findTransferLog(null, "0x036cbd53842c5426634e7929541ec2318f3dcf7e", TREASURY), null);
});

test("noncesToBroadcast covers the gap between mined and signed", () => {
  assert.deepEqual(noncesToBroadcast(0, 0), []);
  assert.deepEqual(noncesToBroadcast(0, 2), [0, 1]);
  assert.deepEqual(noncesToBroadcast(3, 5), [3, 4]);
  assert.deepEqual(noncesToBroadcast(5, 5), []);
  assert.deepEqual(noncesToBroadcast(6, 5), []); // chain ahead: nothing to send
});

test("owedToChain never goes negative", () => {
  assert.equal(owedToChain(5_000_000n, 0n), 5_000_000n);
  assert.equal(owedToChain("5000000", "2000000"), 3_000_000n);
  assert.equal(owedToChain(5_000_000n, 5_000_000n), 0n);
  assert.equal(owedToChain(0n, 5_000_000n), 0n);
});

test("sendableEstimate mirrors the contract's sendable (cash above the 20% buffer, capped)", () => {
  const price = { price: "17756000000", expo: -8 }; // NVDA $177.56
  assert.equal(stockValue(10n ** 18n, price, 18), 177_560_000n);
  assert.equal(stockValue(100_000_000n, price, 8), 177_560_000n);
  const chains = [
    { config: { name: "base", usdc_decimals: 6, max_swap_usdc: "5000000" }, venue: { decimals: 8 }, usdc: "0", stock: "0", in_transit: "0" },
    {
      config: { name: "robinhood", usdc_decimals: 18, max_swap_usdc: "100000000000000000000" },
      venue: { decimals: 18 },
      usdc: "2000000000000000000",
      stock: "1000000000000000000",
      in_transit: "1000000",
    },
  ];
  // assets = 100 cash + 2 + 1 in transit + 177.56 stock = 280.56; buffer 56.112; above 43.888
  const args = { treasuryUsdc: "100000000", chains, price, cashBufferBps: 2000 };
  assert.equal(sendableEstimate({ ...args, chain: "base" }), 5_000_000n); // capped at max_swap_usdc
  assert.equal(sendableEstimate({ ...args, chain: "robinhood" }), 43_888_000n);
  // 50 cash: assets 230.56, buffer 46.112 -> 3.888 above; 40 cash: buffer 44.112 > 40 -> nothing
  assert.equal(sendableEstimate({ ...args, treasuryUsdc: "50000000", chain: "robinhood" }), 3_888_000n);
  assert.equal(sendableEstimate({ ...args, treasuryUsdc: "40000000", chain: "robinhood" }), 0n);
});

test("rebalanceDue follows the cooldown", () => {
  assert.equal(rebalanceDue({ last_rebalance: 0, next_rebalance: 3600 }, 10), true);
  assert.equal(rebalanceDue({ last_rebalance: 1000, next_rebalance: 4600 }, 4599), false);
  assert.equal(rebalanceDue({ last_rebalance: 1000, next_rebalance: 4600 }, 4600), true);
});

test("tickArrayStarts finds initialized arrays in the swap direction (2_swap.js)", () => {
  const bitmap = Array(16).fill(0n);
  const set = (start, spacing) => {
    const i = start / (60 * spacing) + 512;
    bitmap[i >> 6] |= 1n << BigInt(i & 63);
  };
  set(-600, 10);
  set(-1200, 10);
  set(1200, 10);
  assert.deepEqual(tickArrayStarts({ tickCurrent: 50, tickSpacing: 10, bitmap, zeroForOne: true }), [-600, -1200]);
  assert.deepEqual(tickArrayStarts({ tickCurrent: -650, tickSpacing: 10, bitmap, zeroForOne: false }), [-1200, -600, 1200]);
  assert.deepEqual(tickArrayStarts({ tickCurrent: -650, tickSpacing: 10, bitmap, zeroForOne: false, max: 2 }), [-1200, -600]);
  assert.deepEqual(tickArrayStarts({ tickCurrent: 5000, tickSpacing: 10, bitmap: Array(16).fill(0n), zeroForOne: true }), []);
});

test("redact hides keys and Alchemy URL paths", () => {
  assert.equal(redact("https://base-sepolia.g.alchemy.com/v2/abcDEF123456xyz failed"), "https://base-sepolia.g.alchemy.com/v2/*** failed");
  assert.equal(redact("key 0xdeadbeefcafe leaked", ["0xdeadbeefcafe"]), "key *** leaked");
  assert.equal(redact("short ab", ["ab"]), "short ab"); // too short to be a secret
});

test("parseFlags", () => {
  assert.deepEqual(parseFlags(["--once", "--dry-run", "--meme=a.testnet,b.testnet", "--only=oracle"]), {
    once: true,
    dryRun: true,
    memes: ["a.testnet", "b.testnet"],
    only: ["oracle"],
    noApi: false,
  });
  assert.equal(parseFlags(["--no-api"]).noApi, true);
  assert.throws(() => parseFlags(["--nope"]));
});

test("Chainlink proxies match contracts/evm/deploy-testnet-stocks.py", () => {
  const py = fs.readFileSync(path.join(REPO, "contracts/evm/deploy-testnet-stocks.py"), "utf8");
  const fromPy = Object.fromEntries([...py.matchAll(/\("([A-Z]+)", "[^"]+", "(0x[0-9a-fA-F]{40})"\)/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(fromPy, CHAINLINK_PROXIES);
  const feeds = JSON.parse(fs.readFileSync(path.join(REPO, "contracts/stocks/feeds.json"), "utf8")).feeds;
  assert.deepEqual(Object.keys(feeds).sort(), Object.keys(CHAINLINK_PROXIES).sort());
});

test("fundTarget picks the chain holding the fewest shares (e2e: Base had stock, Robinhood none)", () => {
  const price = { price: "17958000000", expo: -8 };
  const evm = (name, dec, stock, usdc = "0", inTransit = "0") => ({
    config: { name, usdc_decimals: dec }, venue: { decimals: name === "base" ? 8 : 18 }, stock, usdc, in_transit: inTransit,
  });
  const tc = {
    chains: [evm("base", 6, "1764120"), evm("robinhood", 18, "0")],
    solana: { config: { name: "solana", max_swap_usdc: "5000000" }, venue: { decimals: 8 }, stock: "2770371", usdc: "0", in_transit: "0" },
  };
  assert.equal(fundTarget(tc, price), "robinhood");
  // Cash already headed somewhere counts as the shares it will buy.
  tc.chains[1] = evm("robinhood", 18, "0", "0", "9000000");
  assert.equal(fundTarget(tc, price), "base");
});
