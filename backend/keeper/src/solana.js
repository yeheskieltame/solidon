// TODO(solana, PR B2): Solana treasury housekeeping and broadcasting. NOT IMPLEMENTED.
//
// The meme contract's Solana methods are landing in PR B2; this module deliberately calls nothing
// until their names and arguments are on main (no guessed method names). Expected flow per meme,
// once B2 is merged:
//
// 1. Accounts: if the meme has no Solana swap accounts yet, call `set_solana_accounts` with the
//    PDA bumps the contract cannot search for on NEAR (pool, vaults, observation, bitmap
//    extension, the treasury's associated token accounts), all derived off-chain from
//    contracts/stocks/solana-devnet.json exactly as backend/solana-spike/2_swap.js does
//    (PublicKey.findProgramAddressSync) and checked against the live pool account.
// 2. Buy: when the Solana ledger holds USDC, read a fresh `finalized` blockhash and the pool's
//    tick arrays (`tickArrayStarts` in logic.js, ported from 2_swap.js: the initialized arrays in
//    the swap direction from the pool's bitmap; one-sided pools need 2, pass up to 3, S25), then
//    call `buy_stock_solana(blockhash, tick_arrays)`. The contract builds the legacy message and
//    has the MPC sign it (EdDSA, domain 1, path `solana-treasury`).
// 3. Broadcast: read the signed transaction from the meme, send it base64 with
//    `sendTransaction` on Solana devnet (Alchemy), and poll `getSignatureStatuses` until
//    `finalized`, all within the blockhash window (~150 slots, ~60-90 s).
// 4. Expiry: if it has not landed and the blockhash expired, call `resign_solana` once 200 NEAR
//    blocks have passed since the request, which re-signs with a new blockhash.
// 5. Cash: Solana arrivals are reported for now (like Robinhood); the bridge memo would carry the
//    Solana treasury address, and the keeper wallet needs Circle devnet USDC (captcha faucet).
import { log } from "./log.js";

let warned = false;

export async function solanaStep() {
  if (warned) return;
  warned = true;
  log.warn("solana", "Solana treasury flow not implemented yet (waits for PR B2); see src/solana.js");
}
