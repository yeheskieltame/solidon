"""Spike S3: real cost of buying each listed bStock on BSC mainnet, from PancakeSwap's QuoterV2.

cost = 1 - (stock out * mid price) / USDT in, where mid price comes from the pool's slot0.
Run: python3 backend/spike/s3_quotes.py   (read-only eth_calls)
"""
import json
import urllib.request
from pathlib import Path

RPC = "https://bsc-rpc.publicnode.com"
QUOTER = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997"  # QuoterV2, developer.pancakeswap.finance
REG = json.loads((Path(__file__).parents[2] / "contracts/stocks/bsc-mainnet.json").read_text())
USDT = REG["usdt"].lower()
SIZES = [100, 500, 1_000, 5_000, 20_000]


def call(to, data):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                       "params": [{"to": to, "data": data}, "latest"]}).encode()
    req = urllib.request.Request(RPC, body, {"content-type": "application/json", "user-agent": "solidon-spike"})
    r = json.load(urllib.request.urlopen(req, timeout=30))
    return r.get("result"), r.get("error")


word = lambda v: format(v, "064x")
addr = lambda a: a.lower()[2:].rjust(64, "0")

print(f"{'stock':6} {'mid $':>9} " + " ".join(f"{s:>8,}$" for s in SIZES) + "   max size under 0.75% cost")
for s in REG["stocks"]:
    token, pool = s["bsc_token"].lower(), s["pancake_v3_pool"]
    sqrt = int(call(pool, "0x3850c7bd")[0][2:66], 16)   # slot0().sqrtPriceX96
    ratio = (sqrt / 2**96) ** 2                          # token1 per token0
    mid = ratio if token < USDT else 1 / ratio           # USDT per stock (both 18 decimals)
    costs = []
    for size in SIZES:
        # quoteExactInputSingle((tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96))
        data = "0xc6a5026a" + addr(USDT) + addr(token) + word(size * 10**18) + word(s["pool_fee"]) + word(0)
        res, err = call(QUOTER, data)
        if not res:
            costs.append(None)
            continue
        out = int(res[2:66], 16) / 1e18
        costs.append(1 - out * mid / size)
    ok = [size for size, c in zip(SIZES, costs) if c is not None and c < 0.0075]
    print(f"{s['ticker']:6} {mid:9.2f} " + " ".join(f"{c * 100:8.2f}%" if c is not None else "    fail " for c in costs)
          + f"   {max(ok) if ok else '< 100'}")
