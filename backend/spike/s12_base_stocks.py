"""Spike S12: Coinbase tokenized stocks on Base: real buy cost by size (KyberSwap aggregator, public API)
and pool price vs Chainlink (Arbitrum). Read-only.
Run: python3 backend/spike/s12_base_stocks.py
"""
import json, time, urllib.request

USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
TOKENS = {"NVDA": "0xb20000000000000000000078ee7ce2fe4908108c", "AAPL": "0xb200000000000000000000c2e324d24d7eecd1fb",
          "MSFT": "0xb200000000000000000000ab99cfa739e253872b", "GOOGL": "0xb2000000000000000000002d0ba3164cc74f58b7",
          "AMZN": "0xb200000000000000000000d9192b6b456483c2e8", "META": "0xb2000000000000000000008bc8786b856e61707c",
          "TSLA": "0xb2000000000000000000001e800a7f5189430cd0", "SPCX": "0xb2000000000000000000007b9fcbd005511acbd5"}
CHAINLINK_ARB = {"NVDA": "0x4881A4418b5F2460B21d6F08CD5aA0678a7f262F", "AAPL": "0x8d0CC5f38f9E802475f2CFf4F9fc7000C2E1557c",
                 "MSFT": "0xDde33fb9F21739602806580bdd73BAd831DcA867", "GOOGL": "0x1D1a83331e9D255EB1Aaf75026B60dFD00A252ba",
                 "AMZN": "0xd6a77691f071E98Df7217BED98f38ae6d2313EBA", "META": "0xcd1bd86fDc33080DCF1b5715B6FCe04eC6F85845",
                 "TSLA": "0x3609baAa0a9b1f0FE4d6CC01884585d0e191C3E3"}


def get(url, body=None):
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None,
                                 {"content-type": "application/json", "user-agent": "solidon-spike", "x-client-id": "solidon-spike"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def chainlink(addr):
    r = get("https://arb1.arbitrum.io/rpc", {"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                                             "params": [{"to": addr, "data": "0xfeaf968c"}, "latest"]})["result"][2:]
    return int(r[64:128], 16) / 1e8


def quote(token, usd):
    r = get(f"https://aggregator-api.kyberswap.com/base/api/v1/routes?tokenIn={USDC}&tokenOut={token}&amountIn={usd * 10**6}")
    s = r["data"]["routeSummary"]
    return int(s["amountOut"]) / 1e8, {h["exchange"] for path in s["route"] for h in path}


print(f"{'stock':6} {'oracle':>8} {'$100 px':>9} {'gap':>7} {'$1k cost':>9} {'$5k cost':>9}  venues")
for t, addr in TOKENS.items():
    try:
        out100, venues = quote(addr, 100)
        px = 100 / out100
        costs = []
        for usd in (1000, 5000):
            out, _ = quote(addr, usd)
            costs.append(1 - out * px / usd)
            time.sleep(0.5)
        oracle = chainlink(CHAINLINK_ARB[t]) if t in CHAINLINK_ARB else None
        gap = f"{(px / oracle - 1) * 100:+.2f}%" if oracle else "n/a"
        print(f"{t:6} {oracle or 0:8.2f} {px:9.2f} {gap:>7} {costs[0] * 100:8.2f}% {costs[1] * 100:8.2f}%  {sorted(venues)}")
    except Exception as e:
        print(f"{t:6} error {e}")
    time.sleep(0.5)
