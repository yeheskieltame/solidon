// Pure keeper logic: no I/O, so every rule here is unit-tested (test/logic.test.js).
// The Solana helpers use @solana/web3.js only for PDA math (sha256 + curve check), no network.
import { PublicKey } from "@solana/web3.js";

/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** USDC decimals on NEAR and in every contract ledger that is "normalised". */
export const USDC_DECIMALS = 6;

/**
 * The memo `fund_chain` puts on its ft_transfer to the bridge (contracts/meme/src/cash.rs,
 * `on_fund_price`): `solidon fund <chain> <treasury>`, treasury = `0x` + 40 hex on EVM chains
 * (returned lowercase) or a base58 Solana address (32 bytes, case kept).
 * Returns `{ chain, to }` or `null` for anything else.
 */
export function parseFundMemo(memo) {
  if (typeof memo !== "string") return null;
  const m = /^solidon fund ([a-z0-9_-]{1,32}) (0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(memo);
  if (!m) return null;
  if (m[2].startsWith("0x")) return { chain: m[1], to: m[2].toLowerCase() };
  return isSolanaAddress(m[2]) ? { chain: m[1], to: m[2] } : null;
}

/** True for a base58 string that decodes to exactly 32 bytes. */
export function isSolanaAddress(s) {
  try {
    return new PublicKey(s).toBase58() === s;
  } catch {
    return false;
  }
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

/**
 * Every chain ledger of `get_treasury_chains()` in the EVM `ChainView` shape (`config.name`,
 * `config.usdc_decimals`, `config.max_swap_usdc`, `venue`, `usdc`, `stock`, `in_transit`): the
 * EVM chains plus the Solana chain (6-decimal USDC), as the contract's NAV counts them all.
 */
export function ledgerChains(tc) {
  const out = [...(tc?.chains ?? [])];
  const s = tc?.solana;
  if (s) {
    out.push({
      config: { name: s.config.name, usdc_decimals: USDC_DECIMALS, max_swap_usdc: s.config.max_swap_usdc },
      venue: s.venue,
      usdc: s.usdc,
      stock: s.stock,
      in_transit: s.in_transit,
    });
  }
  return out;
}

/**
 * The chain the next `fund_chain` should go to: the one holding the fewest shares (USDC already
 * there or in transit counts as shares it will buy), so the treasury spreads over all chains
 * instead of always topping up the first one in config order. Ties keep config order. EVM chains
 * whose router is not approved yet are skipped.
 */
export function fundTarget(tc, price) {
  const p = price ? Number(price.price) * 10 ** price.expo : 0;
  let best = null;
  for (const c of ledgerChains(tc)) {
    if (!c.venue || c.approved === false) continue; // an EVM chain can't buy before its approval
    const shares = Number(c.stock) / 10 ** c.venue.decimals
      + (p > 0 ? (Number(c.usdc) / 10 ** c.config.usdc_decimals + Number(c.in_transit) / 1e6) / p : 0);
    if (!best || shares < best.shares) best = { name: c.config.name, shares };
  }
  return best?.name ?? null;
}

// --- Solana -------------------------------------------------------------------------------

export const SOLANA = {
  ATA_PROGRAM: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  TOKEN_PROGRAM: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  TOKEN_2022_PROGRAM: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  /** NEAR blocks after a Solana signature before `resign_solana` is allowed (solana_treasury.rs). */
  RESIGN_AFTER_BLOCKS: 200,
  /** `buy_stock_solana` / `resign_solana` take 1 to 3 tick arrays. */
  MAX_TICK_ARRAYS: 3,
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (Bitcoin alphabet) of any byte string, e.g. a 64-byte Solana transaction signature. */
export function base58(bytes) {
  const b = Uint8Array.from(bytes);
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (let i = 0; i < b.length && b[i] === 0; i++) out = `1${out}`;
  return out;
}

/** The associated token account of `owner` for `mint` under `tokenProgram`, with its canonical bump. */
export function associatedTokenAccount(owner, tokenProgram, mint) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBuffer(), new PublicKey(tokenProgram).toBuffer(), new PublicKey(mint).toBuffer()],
    new PublicKey(SOLANA.ATA_PROGRAM),
  );
  return { address: address.toBase58(), bump };
}

/**
 * The bumps `set_solana_accounts` takes: the treasury's USDC (SPL Token) and stock (Token-2022)
 * associated token accounts, derived exactly as solana.rs `associated_token_address` does.
 */
export function solanaTokenAccounts({ treasury, usdcMint, stockMint }) {
  return {
    usdc: associatedTokenAccount(treasury, SOLANA.TOKEN_PROGRAM, usdcMint),
    stock: associatedTokenAccount(treasury, SOLANA.TOKEN_2022_PROGRAM, stockMint),
  };
}

/**
 * The fields of a Raydium CLMM `PoolState` account the keeper needs (offsets from 2_swap.js,
 * after the 8-byte discriminator): mints, vaults, tick spacing, current tick, and the default
 * 1024-bit tick-array bitmap (16 little-endian u64 at 904).
 */
export function parseClmmPool(data) {
  const d = Buffer.from(data);
  if (d.length < 904 + 128) throw new Error(`not a CLMM pool account (${d.length} bytes)`);
  const pk = (o) => new PublicKey(d.subarray(o, o + 32)).toBase58();
  return {
    ammConfig: pk(9),
    mint0: pk(73),
    mint1: pk(105),
    vault0: pk(137),
    vault1: pk(169),
    observation: pk(201),
    tickSpacing: d.readUInt16LE(235),
    tickCurrent: d.readInt32LE(269),
    bitmap: Array.from({ length: 16 }, (_, i) => d.readBigUInt64LE(904 + 8 * i)),
  };
}

/** `[start_index, bump]` of a pool's tick array: PDA of ["tick_array", pool, i32 BE start]. */
export function tickArrayBump(clmm, pool, start) {
  const be = Buffer.alloc(4);
  be.writeInt32BE(start);
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), new PublicKey(pool).toBuffer(), be],
    new PublicKey(clmm),
  );
  return { start, bump, address: address.toBase58() };
}

/**
 * The live inputs of `buy_stock_solana` / `resign_solana` except the blockhash: the pool's
 * initialized tick arrays in the USDC -> stock direction, nearest first, up to 3, as
 * `[start, bump]`. The pool must pair `usdcMint` with `stockMint` (and match the venue's vaults
 * when given). Throws if no initialized array is in the default bitmap (the extension would be
 * needed, which the contract does not pass).
 */
export function planSolanaSwap({ pool, poolData, clmm, usdcMint, stockMint, venue = null, max = SOLANA.MAX_TICK_ARRAYS }) {
  const p = parseClmmPool(poolData);
  const zeroForOne = p.mint0 === usdcMint;
  const [inMint, outMint] = zeroForOne ? [p.mint0, p.mint1] : [p.mint1, p.mint0];
  if (inMint !== usdcMint || outMint !== stockMint) throw new Error(`pool ${pool} does not pair USDC with ${stockMint}`);
  if (venue) {
    const [usdcVault, stockVault] = zeroForOne ? [p.vault0, p.vault1] : [p.vault1, p.vault0];
    if (venue.usdc_vault !== usdcVault || venue.stock_vault !== stockVault || venue.observation !== p.observation) {
      throw new Error(`pool ${pool} accounts differ from the meme's venue config`);
    }
  }
  const starts = tickArrayStarts({ tickCurrent: p.tickCurrent, tickSpacing: p.tickSpacing, bitmap: p.bitmap, zeroForOne, max });
  if (!starts.length) throw new Error(`pool ${pool}: no initialized tick array in the default bitmap`);
  const arrays = starts.map((s) => tickArrayBump(clmm, pool, s));
  return {
    zeroForOne,
    tickCurrent: p.tickCurrent,
    tickArrays: arrays.map((a) => [a.start, a.bump]),
    addresses: arrays.map((a) => a.address),
  };
}

/** Reads a Solana compact-u16 at `o`: `[value, nextOffset]`. */
function shortvec(b, o) {
  let v = 0;
  for (let i = 0; i < 3; i++) {
    const x = b[o + i];
    v |= (x & 0x7f) << (7 * i);
    if (!(x & 0x80)) return [v, o + i + 1];
  }
  throw new Error("bad compact-u16");
}

/**
 * A signed legacy transaction (`get_signed_tx("solana", seq)`, base64 `[n] ‖ sigs ‖ message`):
 * its id (first signature, base58) and the recent blockhash in its message.
 */
export function parseSolanaTx(base64) {
  const b = Buffer.from(base64, "base64");
  const [nSigs, o] = shortvec(b, 0);
  if (nSigs < 1 || b.length < o + 64 * nSigs + 3) throw new Error("not a signed Solana transaction");
  const msg = o + 64 * nSigs;
  const [nKeys, k] = shortvec(b, msg + 3);
  const bh = k + 32 * nKeys;
  if (b.length < bh + 32) throw new Error("truncated Solana message");
  return {
    signature: base58(b.subarray(o, o + 64)),
    blockhash: new PublicKey(b.subarray(bh, bh + 32)).toBase58(),
  };
}

/**
 * What to do with the meme's last signed Solana buy, from its signature status
 * (`getSignatureStatuses` with history, `null` if unknown), whether its blockhash is still valid,
 * and the NEAR block height:
 * - `landed`: confirmed or finalized without error.
 * - `pending`: seen but only processed; check again.
 * - `broadcast`: unknown and its blockhash is still valid: (re)send it.
 * - `resign`: it can no longer land (expired unknown, or landed with an error, which moves
 *   nothing) and 200 NEAR blocks have passed since it was signed: `resign_solana`.
 * - `wait-resign`: same, but the contract's 200-block wait is not over.
 */
export function solanaBuyAction({ status, blockhashValid, nearHeight, signedAt }) {
  if (status && !status.err && ["confirmed", "finalized"].includes(status.confirmationStatus)) return "landed";
  if (status && !status.err) return "pending";
  if (!status && blockhashValid) return "broadcast";
  return nearHeight >= Number(signedAt) + SOLANA.RESIGN_AFTER_BLOCKS ? "resign" : "wait-resign";
}

/** Lamports to send so a treasury holding `balance` is back at `topup` once below `min` (else 0). */
export function solTopup(balance, min, topup) {
  const b = BigInt(balance);
  if (b >= BigInt(min)) return 0n;
  return BigInt(topup) > b ? BigInt(topup) - b : 0n;
}

/** Replaces every secret (and any Alchemy-style `/v2/<key>` path) in `text` with `***`. */
export function redact(text, secrets = []) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("***");
  return out.replace(/(\/v2\/)[A-Za-z0-9_-]{8,}/g, "$1***");
}
