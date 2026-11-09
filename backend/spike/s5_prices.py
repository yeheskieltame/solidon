"""Spike S5: which price sources actually serve the listed stock feeds.

Calls every Hermes endpoint variant and every Pyth-compatible oracle contract on
NEAR mainnet and testnet for the 8 listed feeds. Read-only.
Run: python3 backend/spike/s5_prices.py
"""
import base64
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

REG = json.loads((Path(__file__).parents[2] / "contracts/stocks/bsc-mainnet.json").read_text())
FEEDS = {s["ticker"]: s["price_id"] for s in REG["stocks"]}
NVDA = FEEDS["NVDA"]


def get(url, body=None, timeout=20):
    req = urllib.request.Request(url, body, {"content-type": "application/json", "user-agent": "solidon-spike"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:  # network errors are results too
        return None, str(e).encode()


def near_view(network, account, method, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query", "params": {
        "request_type": "call_function", "finality": "final", "account_id": account,
        "method_name": method, "args_base64": base64.b64encode(json.dumps(args).encode()).decode()}}).encode()
    _, raw = get(f"https://rpc.{network}.near.org", body)
    r = json.loads(raw)
    if "error" in r:
        return "ERROR " + json.dumps(r["error"].get("cause", r["error"]))[:120]
    if "error" in r["result"]:
        return "ERROR " + r["result"]["error"][:120]
    return json.loads(bytes(r["result"]["result"]).decode() or "null")


print("== Hermes HTTP endpoints (NVDA feed)")
for host in ("hermes.pyth.network", "hermes-beta.pyth.network"):
    for path in (f"/v2/price_feeds?query=NVDA&asset_type=equity",
                 f"/v2/updates/price/latest?ids[]={NVDA}",
                 f"/v2/updates/price/latest?ids[]={NVDA}&parsed=true&encoding=hex",
                 f"/api/latest_price_feeds?ids[]={NVDA}",
                 f"/api/latest_vaas?ids[]={NVDA}",
                 f"/v2/updates/price/{int(time.time()) - 3600}?ids[]={NVDA}"):
        code, raw = get(f"https://{host}{path}")
        print(f"  {code}  {host}{path.split('?')[0]}  {raw[:70]!r}")

print("== NEAR oracle contracts")
for network, accounts in (("mainnet", ("pyth-oracle.near", "price-oracle.near")),
                          ("testnet", ("pyth-oracle.testnet", "price-oracle.testnet"))):
    for acc in accounts:
        exists = {t: near_view(network, acc, "price_feed_exists", {"price_identifier": f}) for t, f in FEEDS.items()}
        price = near_view(network, acc, "get_price_unsafe", {"price_identifier": NVDA})
        print(f"  {network} {acc}: feeds {exists} | NVDA get_price_unsafe -> {str(price)[:100]}")
    # Is the oracle alive at all? BTC/USD is the most common feed.
    btc = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
    acc = accounts[0]
    print(f"  {network} {acc} BTC/USD get_price_unsafe -> {str(near_view(network, acc, 'get_price_unsafe', {'price_identifier': btc}))[:120]}")
