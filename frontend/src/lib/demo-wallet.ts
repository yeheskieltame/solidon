// Demo wallet (testnet only): an ed25519 key generated in this browser, its implicit account
// (the hex of the public key) funded by the faucet. It signs locally and sends through RPC,
// so no extension and no popups. The secret key sits in localStorage on this origin: anyone
// with access to this browser profile can use it. Fine for free test tokens, never for value.

import type { FnCall } from "./wallet";
import { NEAR_RPCS, NETWORK } from "./config";

/** localStorage key that holds the demo wallet. */
export const DEMO_STORAGE_KEY = "solidon-demo-wallet-testnet";

export type DemoWallet = {
  accountId: string;
  /** "ed25519:<base58 secret key>" */
  secretKey: string;
  /** False after "Disconnect": the key is kept so the same account can be resumed. */
  active: boolean;
};

export const DEMO_ENABLED = NETWORK === "testnet";

export function loadDemo(): DemoWallet | null {
  if (!DEMO_ENABLED) return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DemoWallet;
    return /^[0-9a-f]{64}$/.test(d.accountId) && d.secretKey?.startsWith("ed25519:") ? d : null;
  } catch {
    return null;
  }
}

export function saveDemo(d: DemoWallet) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(d));
}

export function forgetDemo() {
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing to forget.
  }
}

/** Generates a fresh key and its implicit account id. */
export async function createDemoKey(): Promise<DemoWallet> {
  const { KeyPair, keyToImplicitAddress } = await import("near-api-js");
  const kp = KeyPair.fromRandom("ed25519");
  return { accountId: keyToImplicitAddress(kp.getPublicKey()), secretKey: kp.toString(), active: true };
}

const TGAS = 1_000_000_000_000n;

/** Signs and sends each call as its own transaction, in order. Returns the transaction hashes. */
export async function sendWithDemo(demo: DemoWallet, calls: FnCall[]): Promise<string[]> {
  const { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions } = await import("near-api-js");
  const provider = new FailoverRpcProvider(NEAR_RPCS.map((url) => new JsonRpcProvider({ url })));
  const account = new Account(
    demo.accountId,
    provider,
    KeyPairSigner.fromSecretKey(demo.secretKey as `ed25519:${string}`),
  );
  const hashes: string[] = [];
  for (const call of calls) {
    const r = await account.signAndSendTransaction({
      receiverId: call.receiverId,
      actions: [actions.functionCall(call.methodName, call.args, BigInt(call.gas) * TGAS, BigInt(call.deposit))],
    });
    hashes.push(r.transaction?.hash ?? r.transaction_outcome?.id ?? "");
  }
  return hashes;
}
