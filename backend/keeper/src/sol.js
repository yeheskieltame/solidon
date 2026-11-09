// Solana devnet access: JSON-RPC reads and sends through net.js (retries; the URL holds the
// Alchemy key and is never logged), and the keeper's own throwaway devnet wallet, which signs
// only its own transfers (bridge USDC deliveries, treasury SOL top-ups). The treasury's swaps
// are signed by the MPC through the meme contract; this module only broadcasts them.
import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { jsonRpc, RpcError, sleep } from "./net.js";
import { base58 } from "./logic.js";

export const LAMPORTS = 1_000_000_000n;
export const fmtSol = (lamports) => (Number(lamports) / 1e9).toFixed(4);

export class SolanaRpc {
  constructor({ url, explorer, cluster }) {
    this.url = url;
    this.explorer = explorer;
    this.cluster = cluster;
  }

  txUrl(sig) {
    return `${this.explorer}/tx/${sig}?cluster=${this.cluster}`;
  }

  addressUrl(a) {
    return `${this.explorer}/address/${a}?cluster=${this.cluster}`;
  }

  rpc(method, params = []) {
    return jsonRpc(this.url, method, params, `solana ${method}`);
  }

  /** Raw account data, or `null` if the account does not exist. */
  async accountData(address) {
    const r = await this.rpc("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
    return r.value ? Buffer.from(r.value.data[0], "base64") : null;
  }

  async balance(address) {
    return BigInt((await this.rpc("getBalance", [address, { commitment: "confirmed" }])).value);
  }

  /** Raw token amount of a token account, or `null` if it does not exist. */
  async tokenBalance(account) {
    try {
      return BigInt((await this.rpc("getTokenAccountBalance", [account, { commitment: "confirmed" }])).value.amount);
    } catch (e) {
      if (e instanceof RpcError && /could not find account|not a Token account|Invalid param/i.test(e.message)) return null;
      throw e;
    }
  }

  async latestBlockhash() {
    return (await this.rpc("getLatestBlockhash", [{ commitment: "confirmed" }])).value;
  }

  async blockhashValid(blockhash) {
    return (await this.rpc("isBlockhashValid", [blockhash, { commitment: "confirmed" }])).value;
  }

  async blockHeight(commitment = "finalized") {
    return this.rpc("getBlockHeight", [{ commitment }]);
  }

  /** Signature status including old transactions (without history Alchemy forgets them), or null. */
  async status(signature) {
    return (await this.rpc("getSignatureStatuses", [[signature], { searchTransactionHistory: true }])).value[0];
  }

  /** `sendTransaction` of a base64 wire transaction with preflight; returns its signature. */
  async send(base64) {
    return this.rpc("sendTransaction", [base64, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" }]);
  }

  /** Polls until confirmed/finalized or failed; the last status (null if never seen). */
  async confirm(signature, timeoutSecs) {
    let s = null;
    for (const t0 = Date.now(); Date.now() - t0 < timeoutSecs * 1000; await sleep(2000)) {
      s = await this.status(signature);
      if (s?.err || ["confirmed", "finalized"].includes(s?.confirmationStatus)) return s;
    }
    return s;
  }

  requestAirdrop(address, lamports) {
    return this.rpc("requestAirdrop", [address, Number(lamports), { commitment: "confirmed" }]);
  }
}

/** The keeper's devnet keypair at `file`, created (mode 600) if missing. */
export function keeperKeypair(file) {
  let created = false;
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify([...Keypair.generate().secretKey]), { mode: 0o600 });
    created = true;
  }
  return { keypair: Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")))), created };
}

function signed(keypair, blockhash, instructions) {
  const tx = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: blockhash }).add(...instructions);
  tx.sign(keypair);
  return { signature: base58(tx.signature), raw: tx.serialize().toString("base64") };
}

/** The keeper's USDC token account (associated, SPL Token). */
export const keeperUsdcAccount = (keypair, usdcMint) =>
  getAssociatedTokenAddressSync(new PublicKey(usdcMint), keypair.publicKey, false, TOKEN_PROGRAM_ID).toBase58();

/**
 * Keeper -> treasury USDC transfer: creates the treasury's USDC associated token account if
 * missing (idempotent, rent paid by the keeper), then `TransferChecked` (6 decimals).
 */
export function signUsdcDelivery({ keypair, blockhash, usdcMint, treasury, treasuryAccount, amount }) {
  const mint = new PublicKey(usdcMint);
  const dest = new PublicKey(treasuryAccount);
  const source = new PublicKey(keeperUsdcAccount(keypair, usdcMint));
  return signed(keypair, blockhash, [
    createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, dest, new PublicKey(treasury), mint, TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(source, mint, dest, keypair.publicKey, BigInt(amount), 6, [], TOKEN_PROGRAM_ID),
  ]);
}

/** Keeper -> `to` SOL transfer. */
export function signSolTransfer({ keypair, blockhash, to, lamports }) {
  return signed(keypair, blockhash, [
    SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: new PublicKey(to), lamports: BigInt(lamports) }),
  ]);
}
