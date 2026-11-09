// EVM access over JSON-RPC (with retries; the URL is never logged) and the keeper's own testnet
// wallet, signed locally with viem. The meme treasury never signs here: its transactions come
// signed from the meme contract (Chain Signatures) and are only broadcast.
import { encodeFunctionData, erc20Abi, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { jsonRpc, RpcError, sleep } from "./net.js";

/** A node already has this transaction or a later one with the same nonce: not an error. */
const ALREADY = /already known|nonce too low|known transaction|already imported/i;

export class Evm {
  /** `c` = { name, url, explorer, chainId }. */
  constructor(c) {
    Object.assign(this, c);
  }

  rpc(method, params) {
    return jsonRpc(this.url, method, params, `${this.name} ${method}`);
  }

  txUrl(hash) {
    return `${this.explorer}/tx/${hash}`;
  }

  async chainIdOnline() {
    return Number(BigInt(await this.rpc("eth_chainId", [])));
  }

  async nonce(address, tag = "latest") {
    return Number(BigInt(await this.rpc("eth_getTransactionCount", [address, tag])));
  }

  async balance(address) {
    return BigInt(await this.rpc("eth_getBalance", [address, "latest"]));
  }

  async erc20Balance(token, address) {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [address] });
    return BigInt(await this.rpc("eth_call", [{ to: token, data }, "latest"]));
  }

  async ethCall(to, data) {
    return this.rpc("eth_call", [{ to, data }, "latest"]);
  }

  receipt(hash) {
    return this.rpc("eth_getTransactionReceipt", [hash]);
  }

  /** Sends a raw transaction. Returns its hash, also when a node already had it. */
  async sendRaw(raw) {
    const hash = keccak256(raw);
    try {
      await this.rpc("eth_sendRawTransaction", [raw]);
    } catch (e) {
      if (!(e instanceof RpcError) || !ALREADY.test(e.message)) throw e;
    }
    return hash;
  }

  /** Polls for the receipt; `null` after `timeoutSecs`. */
  async waitReceipt(hash, timeoutSecs) {
    const until = Date.now() + timeoutSecs * 1000;
    while (Date.now() < until) {
      const r = await this.receipt(hash);
      if (r) return r;
      await sleep(2000);
    }
    return null;
  }

  /** EIP-1559 fees: 2 x base fee + tip (the tip from the node, at least 1 wei). */
  async fees() {
    const block = await this.rpc("eth_getBlockByNumber", ["latest", false]);
    const base = BigInt(block.baseFeePerGas ?? 0);
    let tip = 1n;
    try {
      tip = BigInt(await this.rpc("eth_maxPriorityFeePerGas", []));
    } catch {
      // some testnets do not implement it
    }
    if (tip < 1n) tip = 1n;
    return { maxPriorityFeePerGas: tip, maxFeePerGas: base * 2n + tip };
  }
}

/** The keeper's own EVM account (testnet only). */
export function keeperWallet(privateKey) {
  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(pk);
}

/**
 * Signs (does not send) a transaction from the keeper wallet: an ERC-20 `transfer` when `token`
 * is set, else a plain ETH transfer of `value`. Returns `{ raw, hash, nonce }` so the caller can
 * persist the hash before broadcasting.
 */
export async function signFromWallet(evm, wallet, { token, to, amount, value = 0n }) {
  const data = token ? encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }) : "0x";
  const target = token ?? to;
  const txValue = token ? 0n : value;
  const [nonce, fees, gasHex] = await Promise.all([
    evm.nonce(wallet.address, "pending"),
    evm.fees(),
    evm.rpc("eth_estimateGas", [{ from: wallet.address, to: target, data, value: `0x${txValue.toString(16)}` }]),
  ]);
  const raw = await wallet.signTransaction({
    type: "eip1559",
    chainId: evm.chainId,
    nonce,
    to: target,
    data,
    value: txValue,
    gas: (BigInt(gasHex) * 12n) / 10n,
    ...fees,
  });
  return { raw, hash: keccak256(raw), nonce };
}

/** `0x` + raw hex -> keccak tx hash. */
export const txHash = (raw) => keccak256(raw);
