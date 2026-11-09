"""Spike S6: what NEAR Intents / 1Click actually serve today (live, read-only, dry quotes).
Run: python3 backend/spike/s6_intents.py
"""
import base64
import json
import time
import urllib.error
import urllib.request

API = "https://1click.chaindefuser.com/v0"
USDC_NEAR = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"


def http(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data, {"content-type": "application/json", "user-agent": "solidon-spike"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


code, tokens = http("GET", f"{API}/tokens")
print("GET /tokens ->", code, f"{len(tokens)} tokens" if isinstance(tokens, list) else tokens)
pick = lambda pred: [t for t in tokens if pred(t)]
for label, pred in (("USDC on NEAR", lambda t: t["blockchain"] == "near" and t["symbol"] == "USDC"),
                    ("USDT on BSC", lambda t: t["blockchain"] == "bsc" and t["symbol"] in ("USDT", "BSC-USD")),
                    ("any BSC token", lambda t: t["blockchain"] == "bsc"),
                    ("BTC native", lambda t: t["blockchain"] == "btc"),
                    ("SOL native", lambda t: t["blockchain"] == "sol" and t["symbol"] == "SOL")):
    found = pick(pred)
    print(f"  {label:14}", [(t["assetId"], t.get("contractAddress")) for t in found][:3] or "NONE")

usdt_bsc = next((t["assetId"] for t in pick(lambda t: t["blockchain"] == "bsc" and t["symbol"] in ("USDT", "BSC-USD"))), None)
btc = next((t["assetId"] for t in pick(lambda t: t["blockchain"] == "btc")), None)
deadline = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 3600))
base = {"dry": True, "swapType": "EXACT_INPUT", "slippageTolerance": 100, "depositType": "ORIGIN_CHAIN",
        "refundType": "ORIGIN_CHAIN", "recipientType": "DESTINATION_CHAIN", "deadline": deadline}
quotes = {
    "user entry: BTC -> USDC on NEAR": dict(base, originAsset=btc, destinationAsset=f"nep141:{USDC_NEAR}",
        amount="100000", refundTo="bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", recipient="solidon.near"),
    "treasury leg: USDC NEAR -> USDT BSC": dict(base, originAsset=f"nep141:{USDC_NEAR}", destinationAsset=usdt_bsc,
        amount="10000000", refundTo="solidon.near", recipient="0xe15043b65217a97b43b81307e3fea2d51ec2d7e2"),
}
for label, q in quotes.items():
    code, res = http("POST", f"{API}/quote", q)
    if isinstance(res, dict) and "quote" in res:
        print(f"POST /quote {label} -> {code} amountOut {res['quote'].get('amountOutFormatted')} "
              f"time {res['quote'].get('timeEstimate')}s signature {'yes' if res.get('signature') else 'no'}")
    else:
        print(f"POST /quote {label} -> {code} {res}")


def view(account, method, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query", "params": {"request_type": "call_function",
           "finality": "final", "account_id": account, "method_name": method,
           "args_base64": base64.b64encode(json.dumps(args).encode()).decode()}}).encode()
    r = json.load(urllib.request.urlopen(urllib.request.Request("https://rpc.mainnet.near.org", body,
                                                                 {"content-type": "application/json"}), timeout=30))
    if "error" in r: return "RPC ERROR " + str(r["error"])[:100]
    if "error" in r["result"]: return "ERR " + r["result"]["error"][:90]
    return json.loads(bytes(r["result"]["result"]).decode() or "null")


print("== intents.near view methods (mainnet)")
for m, a in (("mt_balance_of", {"account_id": "solidon.near", "token_id": f"nep141:{USDC_NEAR}"}),
             ("public_keys_of", {"account_id": "solidon.near"}),
             ("fee", {}), ("current_salt", {}), ("is_nonce_used", {"account_id": "solidon.near", "nonce": "A" * 43 + "="})):
    print(f"  {m}: {str(view('intents.near', m, a))[:110]}")
