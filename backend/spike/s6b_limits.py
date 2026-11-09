"""Spike S6b: 1Click dry-quote matrix for user entry routes into USDC on NEAR, by size.
Run: python3 backend/spike/s6b_limits.py
"""
import json, time, urllib.error, urllib.request

API = "https://1click.chaindefuser.com/v0"
import sys
RECIPIENT = sys.argv[1] if len(sys.argv) > 1 else "wrap.near"  # must be an existing NEAR account
USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"


def quote(origin, amount, refund):
    body = {"dry": True, "swapType": "EXACT_INPUT", "slippageTolerance": 100, "originAsset": origin,
            "depositType": "ORIGIN_CHAIN", "destinationAsset": USDC, "amount": str(amount), "refundTo": refund,
            "refundType": "ORIGIN_CHAIN", "recipient": RECIPIENT, "recipientType": "DESTINATION_CHAIN",
            "deadline": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 3600))}
    req = urllib.request.Request(f"{API}/quote", json.dumps(body).encode(),
                                 {"content-type": "application/json", "user-agent": "solidon-spike"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            q = json.loads(r.read())["quote"]
            return f"OK out {q['amountOutFormatted']} USDC in ~{q.get('timeEstimate')}s"
    except urllib.error.HTTPError as e:
        return f"{e.code} {json.loads(e.read()).get('message')}"


tokens = json.load(urllib.request.urlopen(urllib.request.Request(f"{API}/tokens", headers={"user-agent": "solidon-spike"})))
find = lambda chain, sym: next(t for t in tokens if t["blockchain"] == chain and t["symbol"] == sym)
routes = [("BTC", find("btc", "BTC"), "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"),
          ("SOL", find("sol", "SOL"), "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
          ("USDC on Base", find("base", "USDC"), "0xe15043b65217a97b43b81307e3fea2d51ec2d7e2"),
          ("NEAR", find("near", "wNEAR"), "wrap.near")]
for name, t, refund in routes:
    price = t.get("price") or 0
    for usd in (20, 200, 1500):
        amount = int(usd / price * 10 ** t["decimals"]) if price else 0
        print(f"{name:13} ${usd:>5} ({t['assetId'][:28]}…): {quote(t['assetId'], amount, refund)}")
