// NEAR access: views and receipts over plain JSON-RPC (with retries), writes signed by the keeper
// account through near-api-js. With --dry-run no key is loaded and no transaction is sent.
import { Account, JsonRpcProvider, actions } from "near-api-js";
import { log, errMsg } from "./log.js";
import { jsonRpc } from "./net.js";

const TGAS = 10n ** 12n;

export class MissingMethod extends Error {}

export class Near {
  constructor(cfg) {
    this.cfg = cfg;
    this.account = null;
  }

  txUrl(hash) {
    return `${this.cfg.nearExplorer}/txns/${hash}`;
  }

  query(params, label) {
    return jsonRpc(this.cfg.nearRpc, "query", { finality: "final", ...params }, label);
  }

  /** Calls a view method. Throws MissingMethod if the deployed code does not have it. */
  async view(contract, method, args = {}) {
    const label = `${contract}.${method}`;
    const r = await this.query(
      {
        request_type: "call_function",
        account_id: contract,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
      label,
    );
    if (r.error) {
      if (/MethodNotFound/.test(r.error)) throw new MissingMethod(`${label}: not in the deployed code`);
      throw new Error(`${label}: ${String(r.error).slice(0, 300)}`);
    }
    const text = Buffer.from(r.result).toString();
    return text ? JSON.parse(text) : null;
  }

  /** `undefined` when the method does not exist (older contract code). */
  async tryView(contract, method, args = {}) {
    try {
      return await this.view(contract, method, args);
    } catch (e) {
      if (e instanceof MissingMethod) return undefined;
      throw e;
    }
  }

  async accountExists(account) {
    try {
      await this.query({ request_type: "view_account", account_id: account }, `view_account ${account}`);
      return true;
    } catch (e) {
      if (/UNKNOWN_ACCOUNT|does not exist/i.test(errMsg(e)) || e.data?.cause?.name === "UNKNOWN_ACCOUNT") return false;
      throw e;
    }
  }

  /** An action receipt by id (`EXPERIMENTAL_receipt`). */
  receipt(id) {
    return jsonRpc(this.cfg.nearRpc, "EXPERIMENTAL_receipt", { receipt_id: id }, `receipt ${id}`);
  }

  signer() {
    if (this.account) return this.account;
    if (!this.cfg.nearKey) {
      throw new Error(
        `no key for ${this.cfg.keeperAccount}: set KEEPER_NEAR_PRIVATE_KEY or create ~/.near-credentials/testnet/${this.cfg.keeperAccount}.json`,
      );
    }
    const provider = new JsonRpcProvider({ url: this.cfg.nearRpc }, { retries: 6, wait: 500, backoff: 2 });
    this.account = new Account(this.cfg.keeperAccount, provider, this.cfg.nearKey);
    return this.account;
  }

  /**
   * Sends one transaction with function calls to `contract`: `calls` = [{ method, args, tgas,
   * deposit }]. Returns `{ hash, value }` (the decoded return value of the transaction), or
   * `null` under --dry-run (the call is logged instead).
   */
  async call(scope, contract, calls) {
    const list = Array.isArray(calls) ? calls : [calls];
    if (this.cfg.dryRun) {
      const what =
        list.length > 1 && list.every((c) => c.method === list[0].method)
          ? `${list.length} x ${list[0].method} in one transaction`
          : list.map((c) => `${c.method}(${JSON.stringify(c.args ?? {})})`).join(" + ");
      log.dry(scope, `call ${contract}.${what}`, { tgas: list.reduce((s, c) => s + (c.tgas ?? 100), 0) });
      return null;
    }
    const acts = list.map((c) =>
      actions.functionCall(c.method, c.args ?? {}, BigInt(c.tgas ?? 100) * TGAS, BigInt(c.deposit ?? 0)),
    );
    const r = await this.signer().signAndSendTransaction({ receiverId: contract, actions: acts });
    const hash = r.transaction_outcome?.id ?? r.transaction?.hash;
    const ok = r.status?.SuccessValue;
    let value = null;
    if (ok) {
      const text = Buffer.from(ok, "base64").toString();
      try {
        value = JSON.parse(text);
      } catch {
        value = text;
      }
    }
    log.info(scope, `${contract}.${list.map((c) => c.method).join("+")}`, { result: value, tx: this.txUrl(hash) });
    return { hash, value };
  }
}

/** Decoded args of an action receipt's first FunctionCall, or null. */
export function functionCallOf(receipt) {
  const fc = receipt?.receipt?.Action?.actions?.[0]?.FunctionCall;
  if (!fc) return null;
  try {
    return { method: fc.method_name, args: JSON.parse(Buffer.from(fc.args, "base64").toString()) };
  } catch {
    return null;
  }
}
