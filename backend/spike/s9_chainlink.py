"""Spike S9: are there live Chainlink equity feeds on chains the NEAR MPC can verify?
Reads Chainlink's public feed directory, then latestRoundData() on-chain for freshness.
Run: python3 backend/spike/s9_chainlink.py
"""
import json, time, urllib.request

TICKERS = ("NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "SPCX")
CHAINS = {"bsc": ("feeds-bsc-mainnet-1.json", "https://bsc-dataseed1.defibit.io"),
          "base": ("feeds-ethereum-mainnet-base-1.json", "https://mainnet.base.org"),
          "arbitrum": ("feeds-ethereum-mainnet-arbitrum-1.json", "https://arb1.arbitrum.io/rpc"),
          "avalanche": ("feeds-avalanche-mainnet.json", "https://api.avax.network/ext/bc/C/rpc"),
          "polygon": ("feeds-matic-mainnet-1.json", "https://polygon-rpc.com")}


def get(url, body=None):
    req = urllib.request.Request(url, body, {"content-type": "application/json", "user-agent": "solidon-spike"})
    return json.load(urllib.request.urlopen(req, timeout=30))


now = time.time()
for chain, (file, rpc) in CHAINS.items():
    try:
        feeds = get(f"https://reference-data-directory.vercel.app/{file}")
    except Exception as e:
        print(f"{chain}: directory unavailable ({e})")
        continue
    hits = [f for f in feeds if any(f.get("name", "").upper().startswith(t + " ") or f.get("name", "").upper().startswith(t + "/")
                                    for t in TICKERS)]
    print(f"{chain}: {len(feeds)} feeds, {len(hits)} for listed stocks")
    for f in hits[:10]:
        addr = f.get("proxyAddress") or f.get("contractAddress")
        try:
            body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                               "params": [{"to": addr, "data": "0xfeaf968c"}, "latest"]}).encode()
            res = get(rpc, body)["result"][2:]
            answer, updated = int(res[64:128], 16), int(res[192:256], 16)
            print(f"   {f['name']:14} {addr} answer {answer / 10 ** f.get('decimals', 8):.2f} updated {(now - updated) / 3600:.1f} h ago")
        except Exception as e:
            print(f"   {f['name']:14} {addr} read failed: {e}")
