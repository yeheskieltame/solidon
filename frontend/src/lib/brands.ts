// Real logos for the listed stocks, the treasury chains and the infrastructure Solidon uses.
// Files live in public/logos (sources in public/logos/SOURCES.md). They are trademarks of their
// owners and only identify the asset or network.

export type BrandLogo = {
  src: string;
  /** Accessible name, e.g. "NVIDIA". */
  name: string;
  /** Tile background behind the mark; white when omitted. */
  tile?: string;
  /** Mark size inside its tile, as a share of the tile (0..1). */
  scale?: number;
};

export const STOCK_LOGOS: Record<string, BrandLogo> = {
  NVDA: { src: "/logos/stocks/nvidia.svg", name: "NVIDIA", scale: 0.62 },
  AAPL: { src: "/logos/stocks/apple.svg", name: "Apple", scale: 0.56 },
  MSFT: { src: "/logos/stocks/microsoft.svg", name: "Microsoft", scale: 0.52 },
  GOOGL: { src: "/logos/stocks/google.svg", name: "Alphabet", scale: 0.56 },
  AMZN: { src: "/logos/stocks/amazon.svg", name: "Amazon", scale: 0.6 },
  META: { src: "/logos/stocks/meta.svg", name: "Meta", scale: 0.64 },
  TSLA: { src: "/logos/stocks/tesla.svg", name: "Tesla", scale: 0.56 },
  SPCX: { src: "/logos/stocks/spacex.svg", name: "SpaceX", scale: 0.82 },
};

export const CHAIN_LOGOS: Record<string, BrandLogo> = {
  near: { src: "/logos/chains/near.svg", name: "NEAR", scale: 0.52 },
  base: { src: "/logos/chains/base.svg", name: "Base", scale: 1, tile: "#0000ff" },
  robinhood: { src: "/logos/chains/robinhood.svg", name: "Robinhood Chain", scale: 0.6, tile: "#ccff00" },
  solana: { src: "/logos/chains/solana.svg", name: "Solana", scale: 0.56, tile: "#0b1020" },
  bitcoin: { src: "/logos/chains/bitcoin.svg", name: "Bitcoin", scale: 0.7 },
  ethereum: { src: "/logos/chains/ethereum.svg", name: "Ethereum", scale: 0.56 },
  arbitrum: { src: "/logos/chains/arbitrum.svg", name: "Arbitrum", scale: 0.78 },
};

export const PLATFORM_LOGOS = {
  chainSignatures: { src: "/logos/chains/near.svg", name: "NEAR Chain Signatures", scale: 0.52 },
  intents: { src: "/logos/chains/near.svg", name: "NEAR Intents", scale: 0.52 },
  uniswap: { src: "/logos/platforms/uniswap.svg", name: "Uniswap", scale: 0.72 },
  raydium: { src: "/logos/platforms/raydium.svg", name: "Raydium", scale: 0.6, tile: "#0b1020" },
  chainlink: { src: "/logos/platforms/chainlink.svg", name: "Chainlink", scale: 0.56 },
  usdc: { src: "/logos/platforms/usdc.svg", name: "Circle USDC", scale: 0.7 },
} satisfies Record<string, BrandLogo>;

export function stockLogo(ticker: string | null | undefined): BrandLogo | null {
  return ticker ? (STOCK_LOGOS[ticker.toUpperCase()] ?? null) : null;
}

export function chainLogo(key: string | null | undefined): BrandLogo | null {
  return key ? (CHAIN_LOGOS[key] ?? null) : null;
}
