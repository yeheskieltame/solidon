#!/usr/bin/env node
// Solidon keeper (testnet). One cycle:
//   oracle     Chainlink (Robinhood Chain mainnet) -> mock Pyth on NEAR testnet, every ORACLE_INTERVAL_SECS
//   broadcast  signed treasury transactions -> Base Sepolia / Robinhood testnet
//   bridge     USDC sent by fund_chain to the keeper -> delivered to the treasury (EVM or Solana), then credited
//   treasury   init_treasury, approve_router, fund_chain, buy_stock, rebalance when due
//   solana     init_solana_treasury, set_solana_accounts, treasury SOL, buy_stock_solana + broadcast,
//              resign_solana for an expired buy, fund_chain("solana")
//   api        indexer + read API (src/indexer.js) on its own timers; --no-api disables it
// Usage: node keeper.js [--once] [--dry-run] [--no-api] [--meme=...] [--only=...]   (see --help)
import { HELP, loadConfig, parseFlags } from "./src/config.js";
import { log, errMsg, setSecrets } from "./src/log.js";
import { Near } from "./src/near.js";
import { keeperWallet } from "./src/evm.js";
import { State } from "./src/state.js";
import { discover, readMeme } from "./src/world.js";
import { pushPrices } from "./src/oracle.js";
import { broadcast } from "./src/broadcaster.js";
import { processTransfers, scanIncoming } from "./src/bridge.js";
import { housekeeping } from "./src/treasury.js";
import { solanaHousekeeping, solanaWalletReport } from "./src/solana.js";
import { SolanaRpc, keeperKeypair } from "./src/sol.js";
import { sleep } from "./src/net.js";
import { startReadService } from "./src/indexer.js";

const flags = parseFlags(process.argv.slice(2));
if (flags.help) {
  console.log(HELP);
  process.exit(0);
}
const cfg = loadConfig(flags);
setSecrets(cfg.secrets);
const runs = (name) => !flags.only || flags.only.includes(name);
const near = new Near(cfg);
const wallet = cfg.evmKey ? keeperWallet(cfg.evmKey) : null;
const solKey = keeperKeypair(cfg.solana.keypairPath);
const ctx = {
  cfg,
  near,
  wallet,
  sol: { rpc: new SolanaRpc(cfg.solana), keypair: solKey.keypair },
  state: new State(cfg.statePath, { readOnly: cfg.dryRun }),
  world: null,
};

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  log.info("keeper", "stopping after this step (Ctrl-C again to quit now)");
});

async function startup() {
  log.info("keeper", `start${cfg.dryRun ? " (dry run: reads only, no transaction is sent)" : ""}`, {
    factory: cfg.factory,
    keeper: cfg.keeperAccount,
    near_rpc: new URL(cfg.nearRpc).host,
    solana_rpc: new URL(cfg.solana.url).host,
    near_key: cfg.nearKey ? cfg.nearKeySource : "none",
    env: `backend:${cfg.envFiles.backend ? "loaded" : "missing"} contracts:${cfg.envFiles.contracts ? "loaded" : "missing"}`,
  });
  if (!(await near.accountExists(cfg.keeperAccount))) {
    const msg = `NEAR account ${cfg.keeperAccount} does not exist: create it (backend/README.md, keeper setup)`;
    if (!cfg.dryRun) throw new Error(msg);
    log.warn("keeper", msg);
  } else if (!cfg.dryRun && !cfg.nearKey) {
    throw new Error(`no key for ${cfg.keeperAccount}: set KEEPER_NEAR_PRIVATE_KEY or ~/.near-credentials/testnet/${cfg.keeperAccount}.json`);
  }
  if (!wallet) {
    log.warn("keeper", "no keeper EVM key (EVM_DEPLOYER_PRIVATE_KEY): bridge deliveries and treasury gas top-ups are off");
  } else if (cfg.evmExpectedAddress && cfg.evmExpectedAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`the EVM key does not belong to ${cfg.evmExpectedAddress}`);
  }
}

/** Keeper wallet balances, and its storage registration on USDC (needed to receive fund_chain). */
async function walletReport() {
  const reg = await near.tryView(ctx.world.usdc, "storage_balance_of", { account_id: cfg.keeperAccount });
  if (reg === null) {
    log.warn("keeper", `${cfg.keeperAccount} is not registered on ${ctx.world.usdc}: every fund_chain transfer would bounce`);
    await near
      .call("keeper", ctx.world.usdc, { method: "storage_deposit", args: { account_id: cfg.keeperAccount }, tgas: 30, deposit: 1_250_000_000_000_000_000_000n })
      .catch((e) => log.error("keeper", `storage_deposit failed: ${errMsg(e)}`));
  }
  await solanaWalletReport(ctx, solKey.created);
  if (!wallet) return;
  for (const evm of Object.values(ctx.world.evm)) {
    try {
      const [eth, usdc] = await Promise.all([evm.balance(wallet.address), evm.erc20Balance(evm.usdc, wallet.address)]);
      log.info(`wallet:${evm.name}`, wallet.address, {
        eth: (Number(eth) / 1e18).toFixed(6),
        usdc: (Number(usdc) / 10 ** evm.usdcDecimals).toFixed(4),
        explorer: `${evm.explorer}/address/${wallet.address}`,
      });
    } catch (e) {
      log.error(`wallet:${evm.name}`, errMsg(e));
    }
  }
}

let lastOracle = 0;
async function cycle(first) {
  ctx.world = await discover(cfg, near);
  if (first) await walletReport();

  if (runs("oracle") && Date.now() - lastOracle >= cfg.oracleIntervalSecs * 1000) {
    try {
      await pushPrices(cfg, near, ctx.world.oracle);
      lastOracle = Date.now();
    } catch (e) {
      log.error("oracle", errMsg(e));
    }
  }

  const ids = ctx.world.memes.filter((m) => !flags.memes || flags.memes.includes(m));
  log.info("keeper", `${ids.length} meme(s)`, { memes: ids.join(",") || "none" });
  const snapshots = new Map();
  for (const id of ids) {
    try {
      snapshots.set(id, await readMeme(near, id));
    } catch (e) {
      log.error(`meme:${id}`, `cannot read views: ${errMsg(e)}`);
    }
  }

  for (const meme of snapshots.values()) {
    if (stopping) return;
    if (runs("broadcast")) await broadcast(ctx, meme);
  }
  if (runs("bridge")) {
    await scanIncoming(ctx);
    await processTransfers(ctx, snapshots);
  }
  for (const meme of snapshots.values()) {
    if (stopping) return;
    if (runs("treasury")) {
      try {
        await housekeeping(ctx, meme);
      } catch (e) {
        log.error(`treasury:${meme.id}`, errMsg(e));
      }
    }
    // Land what housekeeping just signed without waiting a full cycle.
    if (runs("broadcast") && !cfg.dryRun) await broadcast(ctx, await readMeme(near, meme.id));
    if (runs("solana") && meme.tc?.solana) {
      try {
        await solanaHousekeeping(ctx, cfg.dryRun ? meme : await readMeme(near, meme.id));
      } catch (e) {
        log.error(`solana:${meme.id}`, errMsg(e));
      }
    }
  }
}

await startup();
// History and events run on their own timers: the treasury loop below never waits for them.
const readService = flags.noApi || flags.once ? null : startReadService(cfg, near, { memeFilter: flags.memes });
for (let first = true; !stopping; first = false) {
  const t0 = Date.now();
  try {
    await cycle(first);
  } catch (e) {
    log.error("keeper", `cycle failed: ${errMsg(e)}`);
  }
  if (flags.once) break;
  const wait = cfg.loopSecs * 1000 - (Date.now() - t0);
  for (let t = 0; t < wait && !stopping; t += 1000) await sleep(Math.min(1000, wait - t));
}
readService?.stop();
log.info("keeper", "stopped");
