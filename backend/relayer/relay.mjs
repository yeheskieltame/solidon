// Broadcasts the BSC transactions a Solidon meme has signed through Chain Signatures.
// Holds no key and trusts nothing: it reads signed raw transactions from the meme
// contract by nonce and sends them to BSC. Anyone can run it; running it twice is safe.
//
// Usage: node backend/relayer/relay.mjs <meme-account> [--network testnet|mainnet]
// Env:   NEAR_RPC, BSC_RPC override the default RPC URLs.

const [meme, ...rest] = process.argv.slice(2);
const network = rest.includes("--network") ? rest[rest.indexOf("--network") + 1] : "testnet";
if (!meme) {
  console.error("usage: node relay.mjs <meme-account> [--network testnet|mainnet]");
  process.exit(2);
}
const NEAR_RPC = process.env.NEAR_RPC ?? `https://rpc.${network}.near.org`;
const BSC_RPC =
  process.env.BSC_RPC ??
  (network === "mainnet" ? "https://bsc-rpc.publicnode.com" : "https://bsc-testnet-rpc.publicnode.com");

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "solidon-relayer" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

async function view(method, args) {
  const r = await rpc(NEAR_RPC, "query", {
    request_type: "call_function",
    finality: "final",
    account_id: meme,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  if (r.error || r.result.error) throw new Error(JSON.stringify(r.error ?? r.result.error));
  return JSON.parse(Buffer.from(r.result.result).toString());
}

// A transaction the chain already has is not an error: another relayer sent it.
const ALREADY = /already known|nonce too low|known transaction/i;

const { address, nonce } = await view("get_bsc_treasury", {});
if (!address) {
  console.log(`${meme}: treasury not initialised, nothing to relay`);
  process.exit(0);
}
const onChain = Number((await rpc(BSC_RPC, "eth_getTransactionCount", [address, "latest"])).result);
console.log(`${meme}: treasury ${address}, signed ${nonce}, mined ${onChain}`);

for (let n = onChain; n < nonce; n++) {
  const raw = await view("get_signed_tx", { nonce: n });
  const r = await rpc(BSC_RPC, "eth_sendRawTransaction", [raw]);
  if (r.result) console.log(`nonce ${n}: sent ${r.result}`);
  else if (ALREADY.test(r.error?.message ?? "")) console.log(`nonce ${n}: already on chain`);
  else {
    console.error(`nonce ${n}: ${r.error?.message}`);
    process.exit(1); // later nonces cannot land before this one
  }
}
