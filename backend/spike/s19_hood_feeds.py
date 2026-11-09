"""Spike S19: official Chainlink proxies on Robinhood Chain (feeds-robinhood-mainnet.json),
checked on-chain: proxy -> aggregator, answer, age, heartbeat. Plus the sequencer uptime feed.
Run: python3 backend/spike/s19_hood_feeds.py
"""
import json, time, urllib.request

RPC = "https://robinhood.drpc.org"
WANT = ("NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "SPCX", "SPY")


def get(url, body=None):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, json.dumps(body).encode() if body else None,
                                         {"content-type": "application/json", "user-agent": "solidon-spike"})
            return json.load(urllib.request.urlopen(req, timeout=30))
        except OSError:
            time.sleep(2 + attempt)
    raise RuntimeError(url)


def call(to, data):
    return get(RPC, {"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": to, "data": data}, "latest"]}).get("result", "0x")


feeds = get("https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json")
print(f"{len(feeds)} feeds in Chainlink's Robinhood Chain directory")
for f in feeds:
    name = f.get("name", "")
    if not (any(name.upper().replace("RH", "").replace("ROBINHOOD ", "").startswith(w) for w in WANT) or "sequencer" in name.lower() or "uptime" in name.lower()):
        continue
    proxy = f.get("proxyAddress")
    if not proxy:
        print(f"  {name:32} (no proxy: {f.get('contractType')})"); continue
    agg = "0x" + call(proxy, "0x245a7bfc")[-40:]  # aggregator()
    r = call(proxy, "0xfeaf968c")[2:]
    dec = f.get("decimals") or 8
    age = (time.time() - int(r[192:256], 16)) / 60 if len(r) >= 320 else -1
    print(f"  {name:32} proxy {proxy} aggregator {agg} answer {int(r[64:128], 16) / 10**dec:.4f} age {age:.0f} min "
          f"heartbeat {f.get('heartbeat')}s deviation {f.get('threshold')}% hours {f.get('docs', {}).get('marketHours')}")
