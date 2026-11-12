#!/usr/bin/env node
// Re-peg the synthetic stock pools to the Chainlink price (src/repeg.js). One pass, then exit.
//   node repeg.js [--chain=base,robinhood,solana] [--ticker=NVDA,MSFT] [--dry-run]     (DRY_RUN=1 = --dry-run)
// Env: THRESHOLD_PCT (0.5), TARGET (0.995), DEPTH_USD (50000); EVM key and RPCs as the keeper (src/config.js);
// Solana: SOLANA_PAYER_KEYPAIR (else backend/solana-spike/.secrets/payer.json), SOLANA_SPIKE_STATE.
import { loadConfig, parseFlags } from "./src/config.js";
import { log, errMsg, setSecrets } from "./src/log.js";
import { keeperWallet } from "./src/evm.js";
import { REPEG_CHAINS, gapTable, repegAll } from "./src/repeg.js";

const list = (flag) => process.argv.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1].split(",").filter(Boolean);
const chains = list("chain") ?? REPEG_CHAINS;
const tickers = list("ticker")?.map((t) => t.toUpperCase()) ?? null;
const dryRun = process.argv.includes("--dry-run") || !!process.env.DRY_RUN;
if (process.argv.includes("--help")) {
  console.log("node repeg.js [--chain=base,robinhood,solana] [--ticker=NVDA,...] [--dry-run]");
  process.exit(0);
}

const cfg = loadConfig(parseFlags(dryRun ? ["--dry-run"] : []));
setSecrets(cfg.secrets);
const account = cfg.evmKey ? keeperWallet(cfg.evmKey) : null;
if (dryRun) process.env.DRY_RUN = "1";
try {
  const results = await repegAll(cfg, { account, dryRun, chains, tickers, opts: cfg.repeg });
  for (const line of gapTable(results)) console.log(line);
  for (const r of results) for (const t of r.txs ?? []) console.log(`${r.chain} ${r.ticker} ${t.label}: ${t.url}`);
} catch (e) {
  log.error("repeg", errMsg(e));
  process.exit(1);
}

