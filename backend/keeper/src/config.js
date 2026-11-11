// Keeper configuration: CLI flags, env (backend/.env and contracts/.env, never printed), and the
// venue registries in contracts/stocks/. Every value has a testnet default except secrets.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../../..");
const STOCKS = path.join(REPO, "contracts/stocks");

/**
 * Official Chainlink proxies on Robinhood Chain mainnet (24/5 feeds, 8 decimals), the reference
 * prices of every synthetic testnet pool. Same list as STOCKS in
 * contracts/evm/deploy-testnet-stocks.py (docs/SPIKE.md S19); a test keeps the two in sync.
 */
export const CHAINLINK_PROXIES = {
  NVDA: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
  AAPL: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
  MSFT: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E",
  GOOGL: "0xF6f373a037c30F0e5010d854385cA89185AE638b",
  AMZN: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C",
  META: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1",
  TSLA: "0x4A1166a659A55625345e9515b32adECea5547C38",
  SPCX: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb",
};

/**
 * EVM treasury chains by their name in the factory's chains config (Solana: `cfg.solana`). The registry file holds the
 * venue list deploy-testnet.sh built the factory from; the RPC is Alchemy (the maintainer's ISP
 * blocks *.robinhood.com, docs/SPIKE.md S23) unless the env override is set.
 */
const CHAINS = {
  base: {
    registry: "base-sepolia.json",
    alchemy: "base-sepolia",
    rpcEnv: "BASE_SEPOLIA_RPC",
    publicRpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    // Mirrors deploy-testnet.sh, used only when the live factory predates `get_chains`.
    fallback: { priorityGwei: 0.001, proof: { Mpc: { foreign_chain: "Base", finality: "Latest" } } },
  },
  robinhood: {
    registry: "hood-testnet.json",
    alchemy: "robinhood-testnet",
    rpcEnv: "HOOD_TESTNET_RPC",
    publicRpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    fallback: { priorityGwei: 0.01, proof: "Relayer" },
  },
};

/** Parses KEY=VALUE lines; values already in `process.env` win. */
export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/(^|\s+)#.*$/, "");
  }
  return true;
}

export function parseFlags(argv) {
  const flags = { once: false, dryRun: false, memes: null, only: null, noApi: false };
  for (const a of argv) {
    if (a === "--once") flags.once = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--no-api") flags.noApi = true;
    else if (a.startsWith("--meme=")) flags.memes = a.slice(7).split(",").filter(Boolean);
    else if (a.startsWith("--only=")) flags.only = a.slice(7).split(",").filter(Boolean);
    else if (a === "--help" || a === "-h") flags.help = true;
    else throw new Error(`unknown flag ${a} (see --help)`);
  }
  return flags;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const num = (name, dflt) => {
  const v = process.env[name];
  if (v === undefined || v === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
};
/** Decimal string -> bigint raw units. */
export function toUnits(value, decimals) {
  const [int, frac = ""] = String(value).split(".");
  return BigInt(int || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** The key of the keeper's NEAR account: env, else a near-cli legacy credentials file. */
function nearKey(account) {
  if (process.env.KEEPER_NEAR_PRIVATE_KEY) return { key: process.env.KEEPER_NEAR_PRIVATE_KEY, source: "KEEPER_NEAR_PRIVATE_KEY" };
  const file = path.join(os.homedir(), ".near-credentials/testnet", `${account}.json`);
  if (fs.existsSync(file)) {
    const key = readJson(file).private_key;
    if (key) return { key, source: file };
  }
  return { key: null, source: null };
}

export function loadConfig(flags) {
  const backendEnv = process.env.SOLIDON_ENV || path.join(REPO, "backend/.env");
  const contractsEnv = process.env.SOLIDON_CONTRACTS_ENV || path.join(REPO, "contracts/.env");
  const envFiles = { backend: loadEnvFile(backendEnv), contracts: loadEnvFile(contractsEnv) };

  const factory = process.env.FACTORY || "solidon.testnet";
  const keeperAccount = process.env.KEEPER_ACCOUNT || `keeper.${factory}`;
  const alchemyKey = process.env.ALCHEMY_API_KEY || "";
  const alchemy = (net) => (alchemyKey ? `https://${net}.g.alchemy.com/v2/${alchemyKey}` : null);

  const chains = {};
  for (const [name, c] of Object.entries(CHAINS)) {
    const registry = readJson(path.join(STOCKS, c.registry));
    chains[name] = {
      name,
      registry,
      url: process.env[c.rpcEnv] || alchemy(c.alchemy) || c.publicRpc,
      explorer: c.explorer,
      fallback: c.fallback,
    };
  }

  const near = nearKey(keeperAccount);
  const evmKey = process.env.KEEPER_EVM_PRIVATE_KEY || process.env.EVM_DEPLOYER_PRIVATE_KEY || "";
  const secrets = [alchemyKey, evmKey, near.key, process.env.NEARBLOCKS_API_KEY, process.env.PYTH_API_KEY].filter(Boolean);
  for (const c of Object.values(CHAINS)) if (process.env[c.rpcEnv]) secrets.push(process.env[c.rpcEnv]);
  if (process.env.SOLANA_DEVNET_RPC) secrets.push(process.env.SOLANA_DEVNET_RPC);
  const sol = (name, dflt) => toUnits(process.env[name] || dflt, 9);

  return {
    flags,
    dryRun: flags.dryRun,
    envFiles,
    secrets,
    factory,
    keeperAccount,
    nearRpc: process.env.NEAR_RPC || "https://test.rpc.fastnear.com", // rpc.testnet.near.org is deprecated and rate-limits (-429)
    nearExplorer: "https://testnet.nearblocks.io",
    nearKey: near.key,
    nearKeySource: near.source,
    nearblocksApi: process.env.NEARBLOCKS_API || "https://api-testnet.nearblocks.io",
    nearblocksKey: process.env.NEARBLOCKS_API_KEY || "",
    evmKey: evmKey || null,
    evmExpectedAddress: process.env.KEEPER_EVM_ADDRESS || process.env.EVM_DEPLOYER_ADDRESS || null,
    chains,
    hoodMainnetUrl: process.env.HOOD_MAINNET_RPC || alchemy("robinhood-mainnet"),
    feeds: readJson(path.join(STOCKS, "feeds.json")).feeds,
    proxies: CHAINLINK_PROXIES,
    // Indexer + read API (src/indexer.js, src/api.js): history and events, no key needed.
    indexer: {
      port: num("INDEXER_PORT", 8788),
      dataDir: process.env.INDEXER_DATA || path.join(REPO, "backend/keeper/data"),
      txApi: process.env.FASTNEAR_TX_API || "https://tx.test.fastnear.com",
      pollSecs: num("INDEXER_POLL_SECS", 20),
      snapshotSecs: num("SNAPSHOT_SECS", num("LOOP_SECS", 60)),
    },
    statePath: process.env.KEEPER_STATE || path.join(REPO, "backend/keeper/state.json"),
    loopSecs: num("LOOP_SECS", 60),
    oracleIntervalSecs: num("ORACLE_INTERVAL_SECS", 300),
    // A 24/5 feed with a 24 h heartbeat older than this is broken or the market is shut for the
    // weekend: stop pushing it, so the contracts' 15-minute staleness brake applies.
    oracleMaxFeedAgeSecs: num("ORACLE_MAX_FEED_AGE_SECS", 25 * 3600),
    fundMin6: toUnits(process.env.FUND_MIN_USDC || "1", 6),
    treasuryGasMin: toUnits(process.env.TREASURY_GAS_MIN_ETH || "0.0002", 18),
    treasuryGasTopup: toUnits(process.env.TREASURY_GAS_TOPUP_ETH || "0.0005", 18),
    receiptTimeoutSecs: num("RECEIPT_TIMEOUT_SECS", 120),
    creditMaxAttempts: num("CREDIT_MAX_ATTEMPTS", 6),
    solana: {
      registry: readJson(path.join(STOCKS, "solana-devnet.json")),
      url: process.env.SOLANA_DEVNET_RPC || alchemy("solana-devnet") || "https://api.devnet.solana.com",
      explorer: "https://explorer.solana.com",
      cluster: "devnet",
      // Throwaway devnet keypair of the keeper (bridge deliveries, treasury SOL), created on
      // first run; git-ignored, never printed.
      keypairPath: process.env.KEEPER_SOLANA_KEYPAIR || path.join(REPO, "backend/keeper/.secrets/solana-keeper.json"),
      // The treasury pays its swap fees and the first stock token account rent (~0.002 SOL).
      treasuryMin: sol("TREASURY_SOL_MIN", "0.01"),
      treasuryTopup: sol("TREASURY_SOL_TOPUP", "0.02"),
      // Below this the keeper asks the devnet faucet (Alchemy requestAirdrop, 1 SOL a request).
      walletMin: sol("KEEPER_SOL_MIN", "0.1"),
      confirmTimeoutSecs: num("SOLANA_CONFIRM_SECS", 60),
      maxResigns: num("SOLANA_MAX_RESIGNS", 5),
    },
  };
}

export const HELP = `Solidon keeper (testnet)

  node keeper.js [--once] [--dry-run] [--no-api] [--meme=a.testnet,b.testnet] [--only=oracle,bridge,treasury,broadcast,solana]
  node indexer.js [--meme=...]   indexer + read API only, never signs

  --once      run one cycle and exit
  --dry-run   real reads, no writes: logs every transaction it would send (no key needed)
  --meme=     only these memes (default: every meme of the factory)
  --only=     only these steps (default: all)
  --no-api    do not start the indexer and its HTTP API (INDEXER_PORT, default 8788)

Env: see backend/.env.example (keeper section).`;
