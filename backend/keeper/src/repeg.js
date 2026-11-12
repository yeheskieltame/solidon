// Re-peg every synthetic stock pool to the Chainlink price: EVM pools in-process (src/repeg-evm.js, the keeper's
// EVM key = the MockERC20 owner), Solana pools through backend/solana-spike/3_repeg.js in a child process (it needs
// the Raydium SDK and the devnet payer = mint authority, SOLANA_PAYER_KEYPAIR). Used by repeg.js and, every
// REPEG_EVERY_MIN minutes, by keeper.js.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./config.js";
import { log, errMsg } from "./log.js";
import { pct, repegEvm } from "./repeg-evm.js";

export const REPEG_CHAINS = ["base", "robinhood", "solana"];
const SOLANA_SCRIPT = path.join(REPO, "backend/solana-spike/3_repeg.js");

/** Runs 3_repeg.js; its lines go to the keeper log under [repeg:solana]. Resolves to the exit code. */
export function repegSolana(cfg, { tickers, dryRun }) {
  if (!fs.existsSync(path.join(path.dirname(SOLANA_SCRIPT), "node_modules/@raydium-io"))) {
    log.error("repeg:solana", "backend/solana-spike has no node_modules (npm ci --legacy-peer-deps there): skipped");
    return Promise.resolve(1);
  }
  const env = { ...process.env, ...(tickers ? { ONLY: tickers.join(",") } : {}), ...(dryRun ? { DRY_RUN: "1" } : {}) };
  if (!dryRun) delete env.DRY_RUN;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SOLANA_SCRIPT], { cwd: path.dirname(SOLANA_SCRIPT), env, stdio: ["ignore", "pipe", "pipe"] });
    const pipe = (stream, level) => {
      let buf = "";
      stream.on("data", (d) => {
        buf += d;
        for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) if (buf.slice(0, i).trim()) log[level]("repeg:solana", buf.slice(0, i));
      });
      stream.on("end", () => buf.trim() && log[level]("repeg:solana", buf));
    };
    pipe(child.stdout, "info");
    pipe(child.stderr, "warn"); // includes harmless SDK notices (bigint bindings); a failure shows in the exit code
    const timer = setTimeout(() => child.kill("SIGTERM"), 15 * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code) log.error("repeg:solana", `3_repeg.js exited with ${code}`);
      resolve(code ?? 1);
    });
  });
}

/**
 * One re-peg pass. `chains` / `tickers` limit it (default: all chains, every ticker of each registry).
 * Returns the EVM results (plans, gaps, tx links). A failure on one pool is logged and the pass goes on.
 */
export async function repegAll(cfg, { account, dryRun, chains = REPEG_CHAINS, tickers = null, opts = {} }) {
  const results = [];
  for (const chain of chains.filter((c) => c !== "solana")) {
    if (!cfg.chains[chain]) {
      log.error("repeg", `unknown chain ${chain}`);
      continue;
    }
    if (!dryRun && !account) {
      log.error(`repeg:${chain}`, "no EVM key (KEEPER_EVM_PRIVATE_KEY): skipped");
      continue;
    }
    for (const row of cfg.chains[chain].registry.stocks) {
      if (tickers && !tickers.includes(row.ticker)) continue;
      try {
        results.push(await repegEvm(cfg, chain, row.ticker, { account, dryRun, ...opts }));
      } catch (e) {
        log.error(`repeg:${chain}:${row.ticker}`, errMsg(e));
        results.push({ chain, ticker: row.ticker, error: errMsg(e) });
      }
    }
  }
  if (chains.includes("solana")) await repegSolana(cfg, { tickers, dryRun });
  return results;
}

/** One line per EVM pool: chain, ticker, fill price gap before (and after a re-peg). */
export function gapTable(results) {
  return results.map((r) =>
    r.error
      ? `${r.chain.padEnd(9)} ${r.ticker.padEnd(5)} error: ${r.error}`
      : `${r.chain.padEnd(9)} ${r.ticker.padEnd(5)} gap ${pct(r.gap).padStart(7)}  ${r.action}${r.gapAfter !== undefined ? ` -> ${pct(r.gapAfter)}` : ""}`,
  );
}
