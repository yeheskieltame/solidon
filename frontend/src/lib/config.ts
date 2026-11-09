// Public, read-only configuration. Every value can be overridden at build time
// through NEXT_PUBLIC_* environment variables (see frontend/README.md).

export type NetworkId = "testnet" | "mainnet";

export const NETWORK: NetworkId =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const FACTORY = process.env.NEXT_PUBLIC_FACTORY || "solidon.testnet";

export const USDC = process.env.NEXT_PUBLIC_USDC || "usdc.solidon.testnet";

/** USDC on NEAR has 6 decimals (`mnav::USDC_DECIMALS` in the meme contract). */
export const USDC_DECIMALS = 6;
export const MEME_DECIMALS = 18;

/** NEAR JSON-RPC endpoints, tried in order. */
export const NEAR_RPCS = (
  process.env.NEXT_PUBLIC_NEAR_RPC ||
  (NETWORK === "mainnet"
    ? "https://rpc.mainnet.near.org,https://free.rpc.fastnear.com"
    : "https://test.rpc.fastnear.com,https://rpc.testnet.near.org")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const NEARBLOCKS =
  NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

export const NEARBLOCKS_API =
  process.env.NEXT_PUBLIC_NEARBLOCKS_API ||
  (NETWORK === "mainnet"
    ? "https://api.nearblocks.io"
    : "https://api-testnet.nearblocks.io");

/** Test USDC minted by the "Get test USDC" button: 1,000 USDC. */
export const FAUCET_USDC = 1_000n * 10n ** BigInt(USDC_DECIMALS);
