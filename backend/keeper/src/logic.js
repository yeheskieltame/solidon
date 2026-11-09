// Pure keeper logic: no I/O, so every rule here is unit-tested (test/logic.test.js).

/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** USDC decimals on NEAR and in every contract ledger that is "normalised". */
export const USDC_DECIMALS = 6;

/**
 * The memo `fund_chain` puts on its ft_transfer to the bridge (contracts/meme/src/cash.rs,
 * `on_fund_price`): `solidon fund <chain> <treasury>`, treasury = `0x` + 40 lowercase hex.
 * Returns `{ chain, to }` or `null` for anything else.
 */
export function parseFundMemo(memo) {
  if (typeof memo !== "string") return null;
  const m = /^solidon fund ([a-z0-9_-]{1,32}) (0x[0-9a-fA-F]{40})$/.exec(memo);
  return m ? { chain: m[1], to: m[2].toLowerCase() } : null;
}

/** Converts a raw token amount between decimals (bigint). Scaling down floors. */
export function scaleAmount(amount, fromDecimals, toDecimals) {
  const a = BigInt(amount);
  if (toDecimals >= fromDecimals) return a * 10n ** BigInt(toDecimals - fromDecimals);
  return a / 10n ** BigInt(fromDecimals - toDecimals);
}

/** `0x` + 64-hex word `i` of ABI-encoded return data, as a bigint (unsigned). */
function word(hex, i) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const w = h.slice(64 * i, 64 * (i + 1));
  if (w.length !== 64) throw new Error(`return data too short for word ${i}`);
  return BigInt(`0x${w}`);
}

/** Two's-complement int256 from an unsigned word. */
function int256(u) {
  return u >= 1n << 255n ? u - (1n << 256n) : u;
}

/** Decodes Chainlink `latestRoundData()` return data. */
export function decodeLatestRoundData(hex) {
  return {
    roundId: word(hex, 0),
    answer: int256(word(hex, 1)),
    startedAt: word(hex, 2),
    updatedAt: Number(word(hex, 3)),
  };
}

/**
 * A Chainlink answer as the Pyth-shaped price the mock oracle stores: `price` (I64 string)
 * with `expo` = -decimals. `null` for a non-positive answer (never pushed).
 */
export function chainlinkToPyth(answer, decimals) {
  const a = BigInt(answer);
  if (a <= 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  return { price: a.toString(), expo: -decimals };
}

/** Human price from a Pyth-shaped `{ price, expo }`, for logs only. */
export function priceToNumber(p) {
  return Number(p.price) * 10 ** p.expo;
}

/**
 * The USDC `Transfer` log to `to` in an `eth_getTransactionReceipt` result, shaped as the
 * `log` argument of the meme's `credit_cash` (`LogArgs` in cash.rs), or `null`.
 * `logIndex` is the receipt's `logIndex` (what backend/spike/s8 matched, and what cash.rs
 * hashes); `position` is the index in `receipt.logs`, returned so the caller can warn when
 * the two differ (see backend/README.md, keeper known gaps).
 */
export function findTransferLog(receipt, usdc, to) {
  const toTopic = `0x${"0".repeat(24)}${to.toLowerCase().replace(/^0x/, "")}`;
  const logs = receipt?.logs ?? [];
  for (let position = 0; position < logs.length; position++) {
    const l = logs[position];
    if (l.address.toLowerCase() !== usdc.toLowerCase()) continue;
    const topics = l.topics.map((t) => t.toLowerCase());
    if (topics.length !== 3 || topics[0] !== TRANSFER_TOPIC || topics[2] !== toTopic) continue;
    return {
      logIndex: Number(BigInt(l.logIndex)),
      position,
      value: BigInt(l.data),
      log: {
        block_hash: l.blockHash.toLowerCase(),
        block_number: Number(BigInt(l.blockNumber)),
        transaction_index: Number(BigInt(l.transactionIndex)),
        address: l.address.toLowerCase(),
        topics,
        data: l.data.toLowerCase(),
      },
    };
  }
  return null;
}

/**
 * Nonces whose signed transaction still has to reach the chain: from the treasury's mined
 * nonce up to (not including) the meme's next nonce to sign.
 */
export function noncesToBroadcast(mined, signed) {
  const out = [];
  for (let n = Number(mined); n < Number(signed); n++) out.push(n);
  return out;
}

/**
 * What the bridge still owes a chain, in 6-decimal USDC: the meme's cash in transit there
 * minus what the keeper already delivered and is waiting to have credited. Never negative.
 */
export function owedToChain(inTransit6, pendingDelivered6) {
  const owed = BigInt(inTransit6) - BigInt(pendingDelivered6);
  return owed > 0n ? owed : 0n;
}

/** `units × price` in 6-decimal USDC, as `stock_value` in contracts/meme/src/mnav.rs. */
export function stockValue(units, p, decimals) {
  if (BigInt(p.price) <= 0n || p.expo > 0 || p.expo < -18) return null;
  return (BigInt(units) * BigInt(p.price) * 10n ** 6n) / 10n ** BigInt(decimals - p.expo);
}

/**
 * Estimate of what `fund_chain(chain)` would send (the contract's `sendable`): NEAR cash above
 * the cash buffer (a share of all treasury assets), capped at one swap of that chain.
 * Inputs are the meme's views: `get_treasury().treasury_usdc`, `get_treasury_chains().chains`,
 * `get_params().cash_buffer_bps`, and an oracle price. 6-decimal USDC, bigint.
 */
export function sendableEstimate({ treasuryUsdc, chains, chain, price, cashBufferBps }) {
  let assets = BigInt(treasuryUsdc);
  for (const c of chains) {
    const scale = 10n ** BigInt(c.config.usdc_decimals - USDC_DECIMALS);
    assets += BigInt(c.usdc) / scale + BigInt(c.in_transit);
    if (c.venue) {
      const v = stockValue(c.stock, price, c.venue.decimals);
      if (v === null) return 0n;
      assets += v;
    }
  }
  const buffer = (assets * BigInt(cashBufferBps)) / 10_000n;
  const above = BigInt(treasuryUsdc) - buffer;
  if (above <= 0n) return 0n;
  const target = chains.find((c) => c.config.name === chain);
  const cap = BigInt(target.config.max_swap_usdc) / 10n ** BigInt(target.config.usdc_decimals - USDC_DECIMALS);
  return above < cap ? above : cap;
}

/** True when `rebalance()` would pass its cooldown check (`cooldown_over` in mnav.rs). */
export function rebalanceDue(treasuryView, nowSecs) {
  return treasuryView.last_rebalance === 0 || nowSecs >= treasuryView.next_rebalance;
}

/**
 * Raydium CLMM tick-array search from backend/solana-spike/2_swap.js: the start indexes of the
 * initialized tick arrays in the swap direction, read from the pool's 1024-bit default bitmap
 * (bit i <-> start (i - 512) * 60 * tickSpacing). One-sided pools need at least two (S25).
 * `bitmap` is 16 u64 words (bigint), little-endian bit order as in the pool account.
 */
export function tickArrayStarts({ tickCurrent, tickSpacing, bitmap, zeroForOne, max = 3 }) {
  const span = 60 * tickSpacing;
  const startOf = (tick) => Math.floor(tick / span) * span;
  const isSet = (start) => {
    const i = start / span + 512;
    return ((bitmap[i >> 6] >> BigInt(i & 63)) & 1n) === 1n;
  };
  const starts = [];
  for (let s = startOf(tickCurrent); Math.abs(s / span) < 512 && starts.length < max; s += zeroForOne ? -span : span) {
    if (isSet(s)) starts.push(s);
  }
  return starts;
}

/** Replaces every secret (and any Alchemy-style `/v2/<key>` path) in `text` with `***`. */
export function redact(text, secrets = []) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("***");
  return out.replace(/(\/v2\/)[A-Za-z0-9_-]{8,}/g, "$1***");
}
