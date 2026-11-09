"""Spike S11: tokenized stocks in 1Click, and minimum sizes for USDC on NEAR -> stablecoins per chain.
Run: python3 backend/spike/s11_oneclick_routes.py
"""
import json, re, time, urllib.error, urllib.request

API = "https://1click.chaindefuser.com/v0"
USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
EVM = "0xe15043b65217a97b43b81307e3fea2d51ec2d7e2"
RECIPIENT = {"sol": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "near": "wrap.near"}


def req(method, url, body=None):
    r = urllib.request.Request(url, json.dumps(body).encode() if body else None,
                               {"content-type": "application/json", "user-agent": "solidon-spike"}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "message": json.loads(e.read() or b"{}").get("message")}


tokens = req("GET", f"{API}/tokens")
print("chains:", sorted({t["blockchain"] for t in tokens}))
stock = re.compile(r"(NVDA|AAPL|MSFT|GOOG|AMZN|META|TSLA|SPCX|SPY|QQQ|COIN|HOOD|MSTR|CRCL)|xstock|bstock|tokenized|ondo", re.I)
hits = [t for t in tokens if stock.search(t["symbol"]) or stock.search(t.get("name") or "")]
print("stock-like tokens:", [(t["symbol"], t["blockchain"], t["assetId"][:40]) for t in hits] or "NONE")


def quote(dest, usd):
    chain = next(t["blockchain"] for t in tokens if t["assetId"] == dest)
    body = {"dry": True, "swapType": "EXACT_INPUT", "slippageTolerance": 100, "originAsset": USDC_NEAR,
            "depositType": "ORIGIN_CHAIN", "destinationAsset": dest, "amount": str(usd * 10**6),
            "refundTo": "wrap.near", "refundType": "ORIGIN_CHAIN", "recipient": RECIPIENT.get(chain, EVM),
            "recipientType": "DESTINATION_CHAIN",
            "deadline": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 3600))}
    r = req("POST", f"{API}/quote", body)
    return f"OK ~{r['quote'].get('timeEstimate')}s" if "quote" in r else f"{r.get('error')} {r.get('message')}"


print("\nUSDC on NEAR -> stablecoin on each chain")
for chain in ("sol", "base", "arb", "eth", "bsc", "pol", "avax", "op", "mantle"):
    for sym in ("USDC", "USDT"):
        dest = next((t["assetId"] for t in tokens if t["blockchain"] == chain and t["symbol"] == sym), None)
        if dest:
            print(f"  {chain:6} {sym}: " + " | ".join(f"${u}: {quote(dest, u)}" for u in (20, 200, 1000)))
