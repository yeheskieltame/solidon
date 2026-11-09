#!/usr/bin/env python3
"""Derives and checks the Raydium CLMM accounts of every Solana devnet venue.

The meme contract signs swaps against each pool's vaults, observation and tick-array
bitmap extension, taken as locked factory config (solana-devnet.json). This script derives
them the way the CLMM program does (find_program_address), reads the chain, and asserts:
- each pool account is owned by the CLMM program and its own amm_config, mints, vaults and
  observation (PoolState offsets of backend/solana-spike/2_swap.js) equal the derived ones;
- each bitmap extension exists, is owned by the CLMM program and names the pool;
- USDC is an SPL Token mint, every stock a Token-2022 mint.

  python3 stocks/solana-accounts.py           check solana-devnet.json against devnet (deploy-testnet.sh)
  python3 stocks/solana-accounts.py --write   derive, check, write the accounts into solana-devnet.json

Read-only. RPC: $SOLANA_RPC, default https://api.devnet.solana.com.
"""
import base64
import hashlib
import json
import os
import sys
import urllib.request

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "solana-devnet.json")
RPC = os.environ.get("SOLANA_RPC", "https://api.devnet.solana.com")
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
ACCOUNTS = ("usdc_vault", "stock_vault", "observation", "bitmap_extension")


def b58decode(s):
    n = 0
    for c in s:
        n = n * 58 + ALPHABET.index(c)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return b"\0" * (len(s) - len(s.lstrip("1"))) + raw


def b58encode(b):
    n, out = int.from_bytes(b, "big"), ""
    while n:
        n, r = divmod(n, 58)
        out = ALPHABET[r] + out
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + out


def key(s):
    b = b58decode(s)
    assert len(b) == 32, s
    return b


def on_curve(b):
    """Whether 32 bytes decompress to an ed25519 point (PDAs must not)."""
    p = 2**255 - 19
    d = -121665 * pow(121666, p - 2, p) % p
    y = int.from_bytes(b, "little") & ((1 << 255) - 1)
    if y >= p:
        return False
    u, v = (y * y - 1) % p, (d * y * y + 1) % p
    x2 = u * pow(v, p - 2, p) % p
    return x2 == 0 or pow(x2, (p - 1) // 2, p) == 1


def find_pda(seeds, program):
    for bump in range(255, -1, -1):
        h = hashlib.sha256(b"".join(seeds) + bytes([bump]) + program + b"ProgramDerivedAddress").digest()
        if not on_curve(h):
            return h
    raise ValueError("no bump")


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, body, {"content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    if "error" in r:
        raise RuntimeError(r["error"])
    return r["result"]


def accounts(addresses):
    """address -> (owner, data) for each address; missing accounts fail."""
    out = {}
    for i in range(0, len(addresses), 100):
        chunk = addresses[i : i + 100]
        values = rpc("getMultipleAccounts", [chunk, {"encoding": "base64", "commitment": "finalized"}])["value"]
        for a, v in zip(chunk, values):
            assert v is not None, f"account {a} does not exist on devnet"
            out[a] = (v["owner"], base64.b64decode(v["data"][0]))
    return out


def main():
    write = "--write" in sys.argv[1:]
    reg = json.load(open(PATH))
    clmm_s, config_s = reg["raydium_clmm"]["program"], reg["raydium_clmm"]["amm_config"]
    clmm, config, usdc = key(clmm_s), key(config_s), key(reg["usdc"])
    derived = {}
    for s in reg["stocks"]:
        pool, stock = key(s["pool"]), key(s["token"])
        mint0, mint1 = sorted([usdc, stock])
        assert find_pda([b"pool", config, mint0, mint1], clmm) == pool, f"{s['ticker']}: pool is not the PDA of its mints"
        derived[s["ticker"]] = {
            "usdc_vault": b58encode(find_pda([b"pool_vault", pool, usdc], clmm)),
            "stock_vault": b58encode(find_pda([b"pool_vault", pool, stock], clmm)),
            "observation": b58encode(find_pda([b"observation", pool], clmm)),
            "bitmap_extension": b58encode(find_pda([b"pool_tick_array_bitmap_extension", pool], clmm)),
        }
        if not write:
            got = {k: s.get(k) for k in ACCOUNTS}
            assert got == derived[s["ticker"]], f"{s['ticker']}: registry {got} != derived {derived[s['ticker']]}"

    wanted = [s["pool"] for s in reg["stocks"]] + [d["bitmap_extension"] for d in derived.values()]
    wanted += [reg["usdc"]] + [s["token"] for s in reg["stocks"]]
    chain = accounts(wanted)
    assert chain[reg["usdc"]][0] == reg["usdc_token_program"], "USDC is not an SPL Token mint"
    for s in reg["stocks"]:
        t, d = s["ticker"], derived[s["ticker"]]
        assert chain[s["token"]][0] == reg["stock_token_program"], f"{t}: stock is not a Token-2022 mint"
        owner, data = chain[s["pool"]]
        assert owner == clmm_s, f"{t}: pool not owned by the CLMM program"
        at = lambda o: b58encode(data[o : o + 32])  # noqa: E731
        usdc_is_0 = at(73) == reg["usdc"]
        assert at(9) == config_s and {at(73), at(105)} == {reg["usdc"], s["token"]}, f"{t}: pool config or mints differ"
        vaults = (at(137), at(169)) if usdc_is_0 else (at(169), at(137))
        assert vaults == (d["usdc_vault"], d["stock_vault"]), f"{t}: vaults differ from the pool account"
        assert at(201) == d["observation"], f"{t}: observation differs from the pool account"
        owner, data = chain[d["bitmap_extension"]]
        assert owner == clmm_s and b58encode(data[8:40]) == s["pool"], f"{t}: bitmap extension is not the pool's"
        print(f"{t}: pool, vaults, observation, bitmap extension match devnet")
        if write:
            s.update(d)
    if write:
        with open(PATH, "w") as f:
            json.dump(reg, f, indent=2)
            f.write("\n")
        print(f"wrote {PATH}")


if __name__ == "__main__":
    main()
