"""Spike S21: a NEAR account controls a Solana devnet address through the NEAR MPC (EdDSA).

1. derived_public_key(path, predecessor, domain 1) -> ed25519 key = Solana address
2. airdrop devnet SOL to it (if empty)
3. build a legacy System transfer, ask the MPC to sign the message bytes
4. broadcast to devnet and wait for confirmation

Signs with the NEAR keychain of SIGNER via near-cli-rs. Uses ALCHEMY_API_KEY from backend/.env.
Run: python3 backend/spike/s21_solana_mpc.py [signer.testnet]
"""
import base64, json, os, secrets, subprocess, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).parents[2]
for line in (ROOT / "backend/.env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
SIGNER = sys.argv[1] if len(sys.argv) > 1 else "creator.solidon.testnet"
MPC, PATH, DOMAIN = "v1.signer-prod.testnet", "solana-treasury", 1
SOL_RPC = f"https://solana-devnet.g.alchemy.com/v2/{os.environ['ALCHEMY_API_KEY']}"
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode(s):
    n = 0
    for c in s: n = n * 58 + B58.index(c)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return b"\0" * (len(s) - len(s.lstrip("1"))) + raw


def b58encode(b):
    n, out = int.from_bytes(b, "big"), ""
    while n: n, r = divmod(n, 58); out = B58[r] + out
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + out


def shortvec(n):
    out = bytearray()
    while True:
        b = n & 0x7F; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); return bytes(out)


def sol(method, params):
    req = urllib.request.Request(SOL_RPC, json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                 {"content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=30))
    if "error" in r: raise RuntimeError(r["error"])
    return r["result"]


def near(*args):
    out = subprocess.run(["near", *args], capture_output=True, text=True)
    return out.stdout.strip(), out.stderr


# 1. MPC-derived Solana address
key, _ = near("contract", "call-function", "as-read-only", MPC, "derived_public_key", "json-args",
              json.dumps({"path": PATH, "predecessor": SIGNER, "domain_id": DOMAIN}), "network-config", "testnet", "now")
pub = b58decode(json.loads(key).split(":")[1])
assert len(pub) == 32, key
addr = b58encode(pub)
print(f"MPC-derived Solana address for {SIGNER}/{PATH}: {addr}")

# 2. Fund it on devnet
bal = sol("getBalance", [addr])["value"]
if bal < 5_000_000:
    sig = sol("requestAirdrop", [addr, 100_000_000])
    print(f"airdrop requested: {sig}")
    for _ in range(30):
        time.sleep(2)
        bal = sol("getBalance", [addr])["value"]
        if bal >= 5_000_000: break
print(f"balance: {bal / 1e9} SOL")

# 3. Legacy message: System transfer of 0.001 SOL to a fresh address
to = secrets.token_bytes(32)
blockhash = b58decode(sol("getLatestBlockhash", [{"commitment": "finalized"}])["value"]["blockhash"])
system = bytes(32)
data = (2).to_bytes(4, "little") + (1_000_000).to_bytes(8, "little")
message = (bytes([1, 0, 1]) + shortvec(3) + pub + to + system + blockhash
           + shortvec(1) + bytes([2]) + shortvec(2) + bytes([0, 1]) + shortvec(len(data)) + data)
print(f"message {len(message)} bytes")

out, err = near("contract", "call-function", "as-transaction", MPC, "sign", "json-args",
                json.dumps({"request": {"path": PATH, "payload_v2": {"Eddsa": message.hex()}, "domain_id": DOMAIN}}),
                "prepaid-gas", "300.0 Tgas", "attached-deposit", "1 yoctoNEAR", "sign-as", SIGNER,
                "network-config", "testnet", "sign-with-keychain", "send")
tx_line = next((l for l in err.splitlines() if "Transaction ID" in l), "")
print(f"MPC sign NEAR tx: {tx_line.split()[-1] if tx_line else '?'}")
resp = json.loads(out)
s = resp["signature"]
sig_bytes = bytes(s) if isinstance(s, list) else bytes.fromhex(s) if all(c in "0123456789abcdef" for c in s.lower()) else b58decode(s)
assert len(sig_bytes) == 64, resp
print(f"MPC response scheme: {resp.get('scheme')}, signature {len(sig_bytes)} bytes")

# 4. Broadcast and confirm
tx = shortvec(1) + sig_bytes + message
txid = sol("sendTransaction", [base64.b64encode(tx).decode(), {"encoding": "base64", "preflightCommitment": "confirmed"}])
print(f"devnet tx: {txid}")
for _ in range(30):
    time.sleep(2)
    st = sol("getSignatureStatuses", [[txid]])["value"][0]
    if st and st.get("confirmationStatus") in ("confirmed", "finalized"):
        print(f"status: {st['confirmationStatus']}, err: {st['err']}")
        break
print(f"https://explorer.solana.com/tx/{txid}?cluster=devnet")
