// Testnet oracle: copies the official Chainlink prices on Robinhood Chain mainnet into the mock
// Pyth contract on NEAR testnet (contracts/mock-pyth, `set_price(price_id, price, expo)`), all
// 8 stocks in one transaction. `publish_time` is left to the mock (block time): the contracts'
// 15-minute staleness rule then means "the keeper is alive", and a feed older than
// ORACLE_MAX_FEED_AGE_SECS (weekend, broken feed) is not pushed, so the brake still applies.
import { chainlinkToPyth, decodeLatestRoundData, priceToNumber } from "./logic.js";
import { log, errMsg } from "./log.js";
import { Evm } from "./evm.js";

const LATEST_ROUND_DATA = "0xfeaf968c";
const DECIMALS = "0x313ce567";
/** Real Pyth receivers: the keeper must never try to write to them. */
const REAL_PYTH = /^pyth-oracle\.(near|testnet)$/;

export async function readChainlink(cfg) {
  if (!cfg.hoodMainnetUrl) throw new Error("ALCHEMY_API_KEY (or HOOD_MAINNET_RPC) is needed to read Chainlink");
  const hood = new Evm({ name: "robinhood-mainnet", url: cfg.hoodMainnetUrl });
  const now = Math.floor(Date.now() / 1000);
  const feeds = Object.entries(cfg.feeds).filter(([ticker]) => {
    if (!cfg.proxies[ticker]) log.warn("oracle", `no Chainlink proxy for ${ticker}`);
    return cfg.proxies[ticker];
  });
  return Promise.all(
    feeds.map(async ([ticker, priceId]) => {
      const proxy = cfg.proxies[ticker];
      const [round, dec] = await Promise.all([hood.ethCall(proxy, LATEST_ROUND_DATA), hood.ethCall(proxy, DECIMALS)]);
      const r = decodeLatestRoundData(round);
      return { ticker, priceId, pyth: chainlinkToPyth(r.answer, Number(BigInt(dec))), ageSecs: now - r.updatedAt };
    }),
  );
}

export async function pushPrices(cfg, near, oracleAccount) {
  if (REAL_PYTH.test(oracleAccount) || !oracleAccount.endsWith(".testnet")) {
    log.error("oracle", `refusing to write prices to ${oracleAccount}: only the testnet mock is set by the keeper`);
    return;
  }
  const feeds = await readChainlink(cfg);
  const mock = await Promise.all(
    feeds.map((f) =>
      near.view(oracleAccount, "get_price_unsafe", { price_identifier: f.priceId }).catch((e) => {
        log.warn("oracle", `read ${f.ticker} from ${oracleAccount} failed`, { error: errMsg(e) });
        return null;
      }),
    ),
  );
  const calls = [];
  for (const [i, f] of feeds.entries()) {
    const current = mock[i];
    const fields = {
      chainlink: f.pyth ? priceToNumber(f.pyth).toFixed(2) : "invalid",
      mock: current ? priceToNumber({ price: current.price, expo: current.expo }).toFixed(2) : "unset",
      feed_age_min: Math.round(f.ageSecs / 60),
    };
    if (!f.pyth) {
      log.warn("oracle", `${f.ticker}: non-positive Chainlink answer, not pushed`, fields);
      continue;
    }
    if (f.ageSecs > cfg.oracleMaxFeedAgeSecs) {
      log.warn("oracle", `${f.ticker}: Chainlink feed too old, not pushed (mNAV actions pause on staleness)`, fields);
      continue;
    }
    log.info("oracle", f.ticker, fields);
    calls.push({ method: "set_price", args: { price_id: f.priceId, price: f.pyth.price, expo: f.pyth.expo }, tgas: 15 });
  }
  if (!calls.length) return;
  await near.call("oracle", oracleAccount, calls);
}
