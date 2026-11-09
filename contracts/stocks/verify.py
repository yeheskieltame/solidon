"""Re-verify contracts/stocks/bsc-mainnet.json against BNB Smart Chain and Pyth.

For every stock: on-chain symbol and decimals, the PancakeSwap v3 pool was
created by the official factory, holds exactly {bStock, USDT}, and has the
listed fee; the Pyth feed ID is the Hermes listing for Equity.US.<ticker>/USD.
Also checks the USDT token and that the swap router points at the same factory.

Run:  python3 contracts/stocks/verify.py [registry.json]   (default bsc-mainnet.json;
      BSC_RPC overrides the RPC URL, e.g. a BSC testnet RPC for bsc-testnet.json)
Exits non-zero on any mismatch. Python 3.10+, standard library only.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

RPC = os.environ.get("BSC_RPC", "https://bsc-rpc.publicnode.com")
HERMES = "https://hermes.pyth.network/v2/price_feeds?asset_type=equity"
REGISTRY = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("bsc-mainnet.json")


def fetch(url, body=None):
    req = urllib.request.Request(url, body, {"content-type": "application/json", "user-agent": "solidon-verify"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def call(to, selector, arg=""):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                       "params": [{"to": to, "data": selector + arg}, "latest"]}).encode()
    return fetch(RPC, body)["result"]


def address(word):
    return "0x" + word[-40:].lower()


def string(word):
    raw = bytes.fromhex(word[2:])
    return raw[64:64 + int.from_bytes(raw[32:64], "big")].decode()


def main():
    reg = json.loads(REGISTRY.read_text())
    factory, usdt = reg["pancake_v3_factory"].lower(), reg["usdt"].lower()
    feeds = {f["id"]: f["attributes"]["symbol"] for f in fetch(HERMES)}
    failures = []

    def check(label, ok):
        if not ok:
            failures.append(label)
        return "ok" if ok else "FAIL"

    print(f"USDT symbol: {check('usdt symbol', string(call(usdt, '0x95d89b41')) == 'USDT')}")
    router_factory = address(call(reg["pancake_v3_swap_router"], "0xc45a0155"))
    print(f"SwapRouter factory: {check('router factory', router_factory == factory)}")

    for s in reg["stocks"]:
        t, token, pool = s["ticker"], s["bsc_token"].lower(), s["pancake_v3_pool"]
        results = [
            check(f"{t} symbol", string(call(token, "0x95d89b41")) == s["bsc_symbol"]),
            check(f"{t} decimals", int(call(token, "0x313ce567"), 16) == s["decimals"]),
            check(f"{t} pool factory", address(call(pool, "0xc45a0155")) == factory),
            check(f"{t} pool tokens",
                  {address(call(pool, "0x0dfe1681")), address(call(pool, "0xd21220a7"))} == {token, usdt}),
            check(f"{t} pool fee", int(call(pool, "0xddca3f43"), 16) == s["pool_fee"]),
            check(f"{t} pyth feed", feeds.get(s["price_id"]) == f"Equity.US.{t}/USD"),
        ]
        print(f"{t:5} {s['bsc_symbol']:7} {'OK' if all(r == 'ok' for r in results) else 'FAIL ' + ' '.join(results)}")

    print("all stocks verified" if not failures else f"FAILED: {', '.join(failures)}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
