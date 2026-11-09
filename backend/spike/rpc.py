"""Tiny JSON-RPC helper for spikes: Alchemy URLs from backend/.env, retries on flaky
networks, and errors that never contain the API key."""
import json, os, time, urllib.error, urllib.request
from pathlib import Path

for _line in (Path(__file__).parents[2] / "backend/.env").read_text().splitlines():
    if "=" in _line and not _line.startswith("#"):
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

NETWORKS = {"base": "base-mainnet", "base-sepolia": "base-sepolia", "arb": "arb-mainnet",
            "hood": "robinhood-mainnet", "hood-testnet": "robinhood-testnet",
            "sol": "solana-mainnet", "sol-devnet": "solana-devnet"}


class RpcError(Exception):
    pass


def url(net):
    return f"https://{NETWORKS[net]}.g.alchemy.com/v2/{os.environ['ALCHEMY_API_KEY']}"


def call(net, method, params, retries=8):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url(net), body, {"content-type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=30))
            if "error" in r:
                raise RpcError(f"{net} {method}: {r['error'].get('message', '')[:160]}")
            return r["result"]
        except RpcError:
            raise
        except urllib.error.HTTPError as e:  # Alchemy returns reverts as HTTP 4xx with a JSON body
            try:
                msg = json.load(e).get("error", {}).get("message", "")
            except Exception:
                msg = ""
            if msg and e.code != 429:
                raise RpcError(f"{net} {method}: HTTP {e.code} {msg[:160]}")
            last = f"HTTP {e.code}"
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:  # network: retry, and never echo the URL
            last = type(e).__name__
            time.sleep(1.5 * (attempt + 1))
    raise RpcError(f"{net} {method}: network failure after {retries} tries ({last})")


def eth_call(net, to, data, sender=None, overrides=None):
    tx = {"to": to, "data": data}
    if sender:
        tx["from"] = sender
    params = [tx, "latest"] + ([overrides] if overrides else [])
    return call(net, "eth_call", params)
