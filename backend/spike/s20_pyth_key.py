"""Spike S20: Pyth Hermes with an API key: are the 8 equity feeds served and fresh?
Reads PYTH_API_KEY from backend/.env. Never prints the key.
Run: python3 backend/spike/s20_pyth_key.py
"""
import json, os, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).parents[2]
for line in (ROOT / "backend/.env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
KEY = os.environ["PYTH_API_KEY"]
FEEDS = {s["ticker"]: s["price_id"] for s in json.loads((ROOT / "contracts/stocks/bsc-mainnet.json").read_text())["stocks"]}


def get(url):
    req = urllib.request.Request(url, headers={"authorization": f"Bearer {KEY}", "user-agent": "solidon-spike"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


ids = "&".join(f"ids[]={i}" for i in FEEDS.values())
for host in ("https://hermes.pyth.network", "https://pyth.dourolabs.app/hermes", "https://hermes-beta.pyth.network"):
    code, body = get(f"{host}/v2/updates/price/latest?{ids}&parsed=true&encoding=hex")
    if code != 200:
        print(f"{host}: HTTP {code} {body}"); continue
    now = time.time()
    by_id = {p["id"]: p["price"] for p in body["parsed"]}
    vaa = body["binary"]["data"][0]
    print(f"{host}: HTTP 200, {len(by_id)}/8 feeds, update data {len(vaa) // 2} bytes")
    for t, i in FEEDS.items():
        p = by_id.get(i)
        print(f"   {t:5} " + (f"{int(p['price']) * 10 ** p['expo']:.2f} age {(now - p['publish_time']) / 60:.1f} min" if p else "missing"))
