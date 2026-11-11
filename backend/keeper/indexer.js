#!/usr/bin/env node
// Solidon indexer + read API, without the keeper: price history and the event log of every meme,
// served over HTTP (src/api.js). Loads no key and sends no transaction, so it can run as a hosted
// read-only deployment next to (or instead of) a keeper.
// Usage: node indexer.js [--meme=a.testnet,b.testnet]   (env: backend/.env.example, indexer section)
import { HELP, loadConfig, parseFlags } from "./src/config.js";
import { log, setSecrets } from "./src/log.js";
import { Near } from "./src/near.js";
import { startReadService } from "./src/indexer.js";

const flags = parseFlags(process.argv.slice(2));
if (flags.help) {
  console.log(HELP);
  process.exit(0);
}
const cfg = loadConfig({ ...flags, dryRun: true });
cfg.dryRun = true; // Near.call only logs: this process never signs
cfg.nearKey = null;
setSecrets(cfg.secrets);
log.info("indexer", "start (read-only, no key)", { factory: cfg.factory, near_rpc: new URL(cfg.nearRpc).host });
const service = startReadService(cfg, new Near(cfg), { memeFilter: flags.memes });

let stopping = false;
const stop = () => {
  if (stopping) process.exit(130);
  stopping = true;
  log.info("indexer", "stopping");
  service.stop();
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
