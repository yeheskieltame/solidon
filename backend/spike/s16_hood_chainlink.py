"""Spike S16: find Chainlink feeds on Robinhood Chain purely on-chain.
Scans AnswerUpdated logs over recent blocks, reads description()/latestRoundData() of each emitter.
Run: python3 backend/spike/s16_hood_chainlink.py [hours]
"""
import json, sys, time, urllib.request

RPC = "https://4663.rpc.thirdweb.com"  # drpc free plan rejects log ranges; thirdweb allows 1000 blocks
TOPIC = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f"  # AnswerUpdated(int256,uint256,uint256)
hours = float(sys.argv[1]) if len(sys.argv) > 1 else 6


def rpc(method, params):
    for attempt in range(4):
        try:
            req = urllib.request.Request(RPC, json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                         {"content-type": "application/json", "user-agent": "solidon-spike"})
            r = json.load(urllib.request.urlopen(req, timeout=30))
            if "error" in r: raise RuntimeError(r["error"])
            return r["result"]
        except Exception as e:
            err = e
            time.sleep(1 + attempt)
    raise err


def text(h):
    b = bytes.fromhex(h[2:])
    return b[64:64 + int.from_bytes(b[32:64], "big")].decode(errors="replace") if len(b) >= 64 else "?"


head = int(rpc("eth_blockNumber", []), 16)
t_head = int(rpc("eth_getBlockByNumber", [hex(head), False])["timestamp"], 16)
t_old = int(rpc("eth_getBlockByNumber", [hex(head - 100000), False])["timestamp"], 16)
per_sec = 100000 / (t_head - t_old)
span = int(hours * 3600 * per_sec)
print(f"head {head}, {per_sec:.1f} blocks/s, scanning {span} blocks (~{hours} h)")
emitters, step, start = {}, 1000, head - span
while start < head:
    end = min(start + step - 1, head)
    try:
        for l in rpc("eth_getLogs", [{"topics": [TOPIC], "fromBlock": hex(start), "toBlock": hex(end)}]):
            emitters[l["address"].lower()] = int(l["blockNumber"], 16)
        start = end + 1
    except Exception as e:
        print('  log query failed at', start, e); start = end + 1
print(f"{len(emitters)} aggregators emitted AnswerUpdated")
rows = []
for a in emitters:
    desc = text(rpc("eth_call", [{"to": a, "data": "0x7284e416"}, "latest"]))
    rows.append((desc, a))
want = ("NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "SPCX", "SPY")
for desc, a in sorted(rows):
    if any(w in desc.upper() for w in want):
        r = rpc("eth_call", [{"to": a, "data": "0xfeaf968c"}, "latest"])[2:]
        dec = int(rpc("eth_call", [{"to": a, "data": "0x313ce567"}, "latest"]), 16)
        print(f"  {desc:28} aggregator {a}  answer {int(r[64:128], 16) / 10**dec:.4f}  updated {(time.time() - int(r[192:256], 16)) / 60:.1f} min ago")
print("other feeds:", sorted(d for d, _ in rows if not any(w in d.upper() for w in want))[:40])
