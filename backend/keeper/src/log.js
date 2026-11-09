// One line per event: `<iso time> <LEVEL> [<scope>] <message> key=value ...`.
// Everything goes through `redact`, so an RPC URL with an API key never reaches the output.
import { redact } from "./logic.js";

let secrets = [];
export const setSecrets = (list) => {
  secrets = list;
};

const fmt = (v) => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") return /\s/.test(v) ? JSON.stringify(v) : v;
  return JSON.stringify(v);
};

function write(level, scope, msg, fields = {}) {
  const kv = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${fmt(v)}`)
    .join(" ");
  const line = `${new Date().toISOString().slice(0, 19)}Z ${level.padEnd(5)} [${scope}] ${msg}${kv ? `  ${kv}` : ""}`;
  (level === "ERROR" || level === "WARN" ? console.error : console.log)(redact(line, secrets));
}

export const log = {
  info: (scope, msg, fields) => write("INFO", scope, msg, fields),
  warn: (scope, msg, fields) => write("WARN", scope, msg, fields),
  error: (scope, msg, fields) => write("ERROR", scope, msg, fields),
  /** A write the keeper skipped because of --dry-run. */
  dry: (scope, msg, fields) => write("DRY", scope, `would ${msg}`, fields),
};

/** Message of any error, redacted and cut to one line. */
export const errMsg = (e) => redact(String(e?.message ?? e).split("\n")[0].slice(0, 300), secrets);
