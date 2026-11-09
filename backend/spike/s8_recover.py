"""Spike S8b: which key signed an MPC foreign-tx response (pure-Python secp256k1 recover).
Run: python3 backend/spike/s8_recover.py <payload_hash> <big_r 33B hex> <s hex> <recovery_id> <mpc-account> <network>
"""
import base64, json, sys, urllib.request

P = 2**256 - 2**32 - 977
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
     0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)


def add(a, b):
    if a is None: return b
    if b is None: return a
    if a[0] == b[0] and (a[1] + b[1]) % P == 0: return None
    l = ((3 * a[0] * a[0]) * pow(2 * a[1], -1, P) if a == b else (b[1] - a[1]) * pow(b[0] - a[0], -1, P)) % P
    x = (l * l - a[0] - b[0]) % P
    return x, (l * (a[0] - x) - a[1]) % P


def mul(k, pt):
    r = None
    while k:
        if k & 1: r = add(r, pt)
        pt, k = add(pt, pt), k >> 1
    return r


h, big_r, s, rec, mpc, net = sys.argv[1:7]
z, r, s = int(h, 16), int(big_r[2:], 16), int(s, 16)
y = pow(r ** 3 + 7, (P + 1) // 4, P)
if y % 2 != int(rec) % 2: y = P - y
R = (r, y)
rinv = pow(r, -1, N)
Q = add(mul(s * rinv % N, R), mul((-z * rinv) % N, G))
recovered = Q[0].to_bytes(32, "big") + Q[1].to_bytes(32, "big")

body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query", "params": {"request_type": "call_function",
       "finality": "final", "account_id": mpc, "method_name": "state", "args_base64": base64.b64encode(b"{}").decode()}}).encode()
state = json.loads(bytes(json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://rpc.{net}.near.org", body, {"content-type": "application/json"}), timeout=30))["result"]["result"]))
A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
for d in state["Running"]["keyset"]["domains"]:
    key = d["key"].get("Secp256k1", {}).get("near_public_key")
    if not key: continue
    n = 0
    for c in key.split(":")[1]: n = n * 58 + A.index(c)
    root = n.to_bytes(64, "big")
    print(f"domain {d['domain_id']} root key: {'SIGNED BY THIS KEY' if root == recovered else 'not the signer'}")
print("recovered", recovered.hex()[:32] + "…")
