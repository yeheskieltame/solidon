"""Spike S17: minimum cost of one full treasury cycle per chain, from live data.
Gas price and native token price now; 1Click both directions at $1 and $10 (dry quotes).
Run: python3 backend/spike/s17_costs.py
"""
import json, time, urllib.error, urllib.request

API = "https://1click.chaindefuser.com/v0"
USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
EVM = "0xe15043b65217a97b43b81307e3fea2d51ec2d7e2"
SOL_ADDR = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
CHAINS = {  # 1Click chain, stable symbol, native symbol, RPC
    "bsc": ("bsc", "USDT", "BNB", "https://bsc-dataseed1.defibit.io"),
    "base": ("base", "USDC", "ETH", "https://base-rpc.publicnode.com"),
    "arbitrum": ("arb", "USDC", "ETH", "https://arb1.arbitrum.io/rpc"),
    "robinhood": ("hood", "ETH", "ETH", "https://robinhood.drpc.org"),
    "solana": ("sol", "USDC", "SOL", "https://api.mainnet-beta.solana.com"),
}
GAS_APPROVE, GAS_SWAP = 46_464, 210_313  # measured: BSC testnet approve; BSC mainnet-fork SPCXB buy (largest seen)


def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"content-type": "application/json", "user-agent": "solidon-spike"})
    for attempt in range(4):
        try:
            return json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            return {"http": e.code, "message": json.loads(e.read() or b"{}").get("message")}
        except OSError:  # flaky network: connection reset
            time.sleep(2 + 2 * attempt)
    return {"message": "network error after retries"}


tokens = json.load(urllib.request.urlopen(urllib.request.Request(f"{API}/tokens", headers={"user-agent": "solidon-spike"})))
tok = lambda chain, sym: next((t for t in tokens if t["blockchain"] == chain and t["symbol"] == sym), None)
near_usd = next(t["price"] for t in tokens if t["assetId"] == "nep141:wrap.near")


def quote(origin, dest, amount, recipient, refund):
    body = {"dry": True, "swapType": "EXACT_INPUT", "slippageTolerance": 100, "originAsset": origin, "depositType": "ORIGIN_CHAIN",
            "destinationAsset": dest, "amount": str(amount), "refundTo": refund, "refundType": "ORIGIN_CHAIN", "recipient": recipient,
            "recipientType": "DESTINATION_CHAIN", "deadline": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 3600))}
    return post(f"{API}/quote", body)


def leg(origin_tok, dest_tok, usd, recipient, refund):
    amount = int(usd / (origin_tok["price"] or 1) * 10 ** origin_tok["decimals"])
    r = quote(origin_tok["assetId"], dest_tok["assetId"], amount, recipient, refund)
    if "quote" not in r:
        return f"✗ {r.get('message')}"
    out_usd = float(r["quote"]["amountOutFormatted"]) * (dest_tok["price"] or 1)
    return f"${usd - out_usd:.3f} ({r['quote'].get('timeEstimate')}s)"


usdc = next(t for t in tokens if t["assetId"] == USDC_NEAR)
print(f"NEAR ${near_usd}; NEAR-side per MPC signature ≈ 0.0013 NEAR = ${0.0013 * near_usd:.4f} (measured on testnet)\n")
print(f"{'chain':10} {'gas price':>12} {'approve+swap gas':>17} | 1Click NEAR→chain $1 / $10 | chain→NEAR $1 / $10")
for name, (chain, stable, native, rpc) in CHAINS.items():
    native_tok = tok(chain, native) or tok(chain, "W" + native)
    if chain == "sol":
        gas = "5000 lamports + prio"
        fee_sol = 2 * 0.000005 + 0.00001  # 2 txs base fee + small priority (estimate)
        gas_usd = f"${fee_sol * (native_tok['price'] or 0):.4f} (est)"
    else:
        gp = int(post(rpc, {"jsonrpc": "2.0", "id": 1, "method": "eth_gasPrice", "params": []})["result"], 16)
        gas = f"{gp / 1e9:.4f} gwei"
        gas_usd = f"${(GAS_APPROVE + GAS_SWAP) * gp / 1e18 * (native_tok['price'] or 0):.4f}"
    dest = tok(chain, stable)
    recip = SOL_ADDR if chain == "sol" else EVM
    fwd = [leg(usdc, dest, u, recip, "wrap.near") for u in (1, 10)]
    back = [leg(dest, usdc, u, "wrap.near", recip) for u in (1, 10)]
    print(f"{name:10} {gas:>12} {gas_usd:>17} | {fwd[0]} / {fwd[1]} | {back[0]} / {back[1]}")
