// Loads everything the UI shows about one meme. Each view is independent: a view
// missing on older contract code leaves its field null instead of failing the page.

import { tryView, view, oraclePrice, DEFAULT_PARAMS, ViewError } from "./near";
import type {
  FtMetadata,
  MemeInfo,
  Params,
  PoolView,
  PythPrice,
  TreasuryChainsRaw,
  TreasuryView,
} from "./near";

export type MemeSnapshot = {
  account: string;
  metadata: FtMetadata;
  info: MemeInfo | null;
  pool: PoolView | null;
  treasury: TreasuryView | null;
  params: Params;
  paramsFromContract: boolean;
  chains: TreasuryChainsRaw | null;
  /** Why `chains` is null: older contract code, or an RPC failure. */
  chainsNote: string | null;
  price: PythPrice | null;
  /** Unix seconds when this snapshot was read. */
  fetchedAt: number;
};

export async function loadMeme(account: string, withChains = true): Promise<MemeSnapshot> {
  // ft_metadata is part of every meme version; if it fails, the account is not a meme.
  const metadata = await view<FtMetadata>(account, "ft_metadata");
  const [info, pool, treasury, params, chainsResult] = await Promise.all([
    tryView<MemeInfo>(account, "get_info"),
    tryView<PoolView>(account, "get_pool"),
    tryView<TreasuryView>(account, "get_treasury"),
    tryView<Params>(account, "get_params"),
    withChains
      ? view<TreasuryChainsRaw>(account, "get_treasury_chains").then(
          (v) => ({ v, note: null as string | null }),
          (e: unknown) => ({
            v: null,
            note:
              e instanceof ViewError && e.missingMethod
                ? "This meme runs earlier contract code without a multichain treasury view. Memes launched after the factory redeploy report every chain."
                : e instanceof Error
                  ? e.message
                  : "Treasury view unavailable",
          }),
        )
      : Promise.resolve({ v: null, note: null }),
  ]);
  const price = info ? await oraclePrice(info.oracle, info.stock.price_id) : null;
  return {
    account,
    metadata,
    info,
    pool,
    treasury,
    params: params ?? DEFAULT_PARAMS,
    paramsFromContract: !!params,
    chains: chainsResult.v,
    chainsNote: chainsResult.note,
    price,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}
