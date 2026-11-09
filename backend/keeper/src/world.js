// What the keeper works on: the factory's config and memes, and one snapshot of views per meme.
// Handles contracts deployed before the multichain treasury (no `get_chains` /
// `get_treasury_chains`): those memes only get `rebalance()`.
import { Evm } from "./evm.js";
import { log } from "./log.js";

/** The factory's chains config as deploy-testnet.sh builds it, for a factory without `get_chains`. */
function fallbackChains(cfg) {
  const gwei = 10n ** 9n;
  return {
    mpc: "v1.signer-prod.testnet",
    bridge: cfg.keeperAccount,
    relayer: cfg.keeperAccount,
    evm: Object.values(cfg.chains).map((c) => ({
      name: c.name,
      chain_id: c.registry.chain_id,
      usdc: c.registry.usdc,
      usdc_decimals: c.registry.usdc_decimals,
      swap_router: c.registry.uniswap_v3.swap_router02,
      max_swap_usdc: (5n * 10n ** BigInt(c.registry.usdc_decimals)).toString(),
      max_fee_per_gas: (gwei / 10n).toString(),
      max_priority_fee_per_gas: String(Number(gwei) * c.fallback.priorityGwei),
      proof: c.fallback.proof,
    })),
  };
}

export async function discover(cfg, near) {
  const f = cfg.factory;
  let chains = await near.tryView(f, "get_chains");
  const legacyFactory = chains === undefined;
  if (legacyFactory) {
    log.warn("world", `${f} runs pre-multichain code (no get_chains): using the chains of contracts/stocks/ for the keeper wallet only`);
    chains = fallbackChains(cfg);
  }
  const usdc = (await near.tryView(f, "get_usdc")) ?? `usdc.${f}`;
  const oracle = (await near.tryView(f, "get_oracle")) ?? `pyth.${f}`;

  const memes = [];
  for (let from = 0; ; from += 50) {
    const page = await near.view(f, "get_memes", { from_index: from, limit: 50 });
    memes.push(...page);
    if (page.length < 50) break;
  }

  for (const role of ["bridge", "relayer"]) {
    if (!legacyFactory && chains[role] !== cfg.keeperAccount) {
      log.warn("world", `factory ${role} is ${chains[role]}, not the keeper ${cfg.keeperAccount}: ${role} duties will fail`);
    }
  }

  const evm = {};
  for (const c of chains.evm) {
    const local = cfg.chains[c.name];
    if (!local) {
      log.warn("world", `chain ${c.name} has no RPC/explorer entry in backend/keeper/src/config.js: skipped`);
      continue;
    }
    if (local.registry.chain_id !== c.chain_id) {
      log.warn("world", `chain ${c.name}: factory chain_id ${c.chain_id} != registry ${local.registry.chain_id}`);
    }
    evm[c.name] = Object.assign(new Evm({ name: c.name, url: local.url, explorer: local.explorer, chainId: c.chain_id }), {
      usdc: c.usdc,
      usdcDecimals: c.usdc_decimals,
      proof: c.proof,
    });
  }
  return { legacyFactory, chains, usdc, oracle, memes, evm };
}

/**
 * One meme's state: `info`, `params`, `treasury` (`get_treasury`), `tc` (`get_treasury_chains`,
 * `undefined` on pre-multichain code) and the oracle `price` (`null` when stale).
 */
export async function readMeme(near, id) {
  const [info, params, treasury, tc] = await Promise.all([
    near.view(id, "get_info"),
    near.view(id, "get_params"),
    near.view(id, "get_treasury"),
    near.tryView(id, "get_treasury_chains"),
  ]);
  const price = await near.view(info.oracle, "get_price_no_older_than", {
    price_id: info.stock.price_id,
    age: params.oracle_max_age_secs,
  });
  return { id, info, params, treasury, tc, price };
}
