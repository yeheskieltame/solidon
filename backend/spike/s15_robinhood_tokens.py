"""Spike S15: Robinhood Chain (4663) stock tokens: on-chain metadata and common deployer.
Addresses from a third-party directory, verified here against the chain and Blockscout.
Run: python3 backend/spike/s15_robinhood_tokens.py
"""
import json, time, urllib.request

RPC = "https://robinhood.drpc.org"
SCOUT = "https://robinhoodchain.blockscout.com/api/v2"
TOKENS = {"NVDA": "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", "AAPL": "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9",
          "MSFT": "0xe93237c50d904957cf27e7b1133b510c669c2e74", "GOOGL": "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3",
          "AMZN": "0x12f190a9f9d7d37a250758b26824b97ce941bf54", "META": "0xc0d6457c16cc70d6790dd43521c899c87ce02f35",
          "TSLA": "0x322f0929c4625ed5bad873c95208d54e1c003b2d", "SPCX": "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea"}


def get(url, body=None):
    time.sleep(0.3)
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None,
                                 {"content-type": "application/json", "user-agent": "Mozilla/5.0 solidon-spike", "accept": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def call(to, data):
    return get(RPC, {"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": to, "data": data}, "latest"]}).get("result", "0x")


def text(h):
    b = bytes.fromhex(h[2:])
    return b[64:64 + int.from_bytes(b[32:64], "big")].decode(errors="replace") if len(b) >= 64 else "?"


print(f"chain id {int(get(RPC, {'jsonrpc': '2.0', 'id': 1, 'method': 'eth_chainId', 'params': []})['result'], 16)}")
for t, a in TOKENS.items():
    sym, name = text(call(a, "0x95d89b41")), text(call(a, "0x06fdde03"))
    dec = int(call(a, "0x313ce567"), 16)
    supply = int(call(a, "0x18160ddd"), 16) / 10 ** dec
    try:
        info = get(f"{SCOUT}/addresses/{a}")
        creator, impl = info.get("creator_address_hash"), [i.get("address_hash") or i.get("address") for i in info.get("implementations") or []]
        tok = get(f"{SCOUT}/tokens/{a}")
        holders = tok.get("holders_count") or tok.get("holders")
    except Exception as e:
        creator, impl, holders = f"blockscout error {e}", [], "?"
    print(f"{t:5} {a} symbol={sym} name={name!r} dec={dec} supply={supply:,.2f} holders={holders} creator={creator} impl={impl}")
