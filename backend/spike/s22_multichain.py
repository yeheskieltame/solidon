"""Spike S22: the open questions for a Base + Solana + Robinhood treasury, answered live.

1. Base: can the MPC treasury address buy NVDAc / SPCXc through the Aero CL router?
   (eth_call with a USDC balance + allowance state override, so no funds are needed)
2. Base: does the Aero SPCXc pool track the official Chainlink SPCX/USD feed on Robinhood Chain?
3. Solana: are there Pyth push (PriceUpdateV2) accounts for the 8 equities, and are they fresh?
4. Solana: does Jupiter find a direct pool for every xStock?

Uses ALCHEMY_API_KEY from backend/.env (via rpc.py, which never prints it).
Run: python3 backend/spike/s22_multichain.py
"""
import base64, hashlib, json, struct, subprocess, time, urllib.error, urllib.request
from pathlib import Path

import rpc

ROOT = Path(__file__).parents[2]
TREASURY = "0x680bcF5a2E3C07118991Adb3976d3dF077ed96EE"  # MPC: creator.solidon.testnet / evm-treasury
USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  # FiatToken: balances slot 9, allowances slot 10
AERO_ROUTER = "0x9ee35bf1bd69a03c6f0393582030fce8bb93d418"
AERO_FACTORY = "0x9cb220581b91b0c83223012fe69688b92ad07a76"
BASE_POOLS = {"NVDAc": ("0xb20000000000000000000078ee7ce2fe4908108c", "0xF668e21993f0ACd7ab00BB1cFbAeD0df28A3C8EC"),
              "SPCXc": ("0xb2000000000000000000007b9fcbd005511acbd5", "0x880dB7Dda4407D99508574E680d067D1164B3cFE")}
HOOD_SPCX_FEED = "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb"
PYTH_PUSH = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def pad(x):
    return format(x, "064x") if isinstance(x, int) else x[2:].lower().rjust(64, "0")


def keccak(h):
    return subprocess.run(["cast", "keccak", h], capture_output=True, text=True, check=True).stdout.strip()


def word(h, i):
    return int(h[2 + 64 * i: 2 + 64 * (i + 1)], 16)


def b58d(s):
    n = 0
    for c in s: n = n * 58 + B58.index(c)
    return b"\0" * (len(s) - len(s.lstrip("1"))) + n.to_bytes((n.bit_length() + 7) // 8, "big")


def b58e(b):
    n, out = int.from_bytes(b, "big"), ""
    while n: n, r = divmod(n, 58); out = B58[r] + out
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + out


P = 2 ** 255 - 19
D = -121665 * pow(121666, P - 2, P) % P


def on_curve(b):
    y = int.from_bytes(b, "little") & ((1 << 255) - 1)
    if y >= P: return False
    x2 = (y * y - 1) * pow(D * y * y + 1, P - 2, P) % P
    return x2 == 0 or pow(x2, (P - 1) // 2, P) == 1


def pda(seeds, program):
    prog = b58d(program)
    for bump in range(255, -1, -1):
        h = hashlib.sha256(b"".join(seeds) + bytes([bump]) + prog + b"ProgramDerivedAddress").digest()
        if not on_curve(h): return b58e(h)


# 1. Base swap from the MPC treasury
print("== 1. Base: MPC treasury buys through Aero")
assert "0x" + rpc.eth_call("base", AERO_ROUTER, "0xc45a0155")[-40:] == AERO_FACTORY, "router is not wired to the Aero CL factory"
amount = 1000 * 10 ** 6
override = {USDC_BASE: {"stateDiff": {
    keccak("0x" + pad(TREASURY) + pad(9)): "0x" + pad(amount),
    keccak("0x" + pad(AERO_ROUTER) + keccak("0x" + pad(TREASURY) + pad(10))[2:]): "0x" + pad(amount)}}}
for name, (token, pool) in BASE_POOLS.items():
    spacing = int(rpc.eth_call("base", pool, "0xd0c93a7c"), 16)  # tickSpacing()
    calldata = subprocess.run(["cast", "calldata", "exactInputSingle((address,address,int24,address,uint256,uint256,uint256,uint160))",
                               f"({USDC_BASE},{token},{spacing},{TREASURY},99999999999,{amount},1,0)"],
                              capture_output=True, text=True, check=True).stdout.strip()
    out = int(rpc.eth_call("base", AERO_ROUTER, calldata, sender=TREASURY, overrides=override), 16)
    print(f"   1000 USDC -> {out / 1e8:.4f} {name}  (tickSpacing {spacing}, effective ${1000 / (out / 1e8):.2f})")

# 2. SPCX: Base pool vs official Chainlink feed on Robinhood Chain
print("== 2. SPCX: Aero pool on Base vs Chainlink on Robinhood Chain")
r = rpc.eth_call("hood", HOOD_SPCX_FEED, "0xfeaf968c")  # latestRoundData()
feed = word(r, 1) / 10 ** int(rpc.eth_call("hood", HOOD_SPCX_FEED, "0x313ce567"), 16)
sqrt_price = word(rpc.eth_call("base", BASE_POOLS["SPCXc"][1], "0x3850c7bd"), 0)  # slot0()
pool = 1 / ((sqrt_price / 2 ** 96) ** 2 * 10 ** (6 - 8))  # token0 USDC (6 dp), token1 SPCXc (8 dp)
print(f"   Chainlink {feed:.2f} (age {(time.time() - word(r, 3)) / 60:.0f} min), pool {pool:.2f}, gap {abs(pool / feed - 1) * 100:.2f}%")

# 3. Pyth push accounts on Solana for the 8 equities
print("== 3. Solana: Pyth push accounts for equities")
feeds = json.loads((ROOT / "contracts/stocks/feeds.json").read_text())["feeds"]
assert pda([struct.pack("<H", 0), bytes.fromhex("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d")], PYTH_PUSH) \
    == "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE", "PDA derivation does not reproduce the known SOL/USD account"
for ticker, fid in feeds.items():
    addr = pda([struct.pack("<H", 0), bytes.fromhex(fid)], PYTH_PUSH)
    acc = rpc.call("sol", "getAccountInfo", [addr, {"encoding": "base64"}])["value"]
    if not acc:
        print(f"   {ticker:5} {addr}: no account"); continue
    data = base64.b64decode(acc["data"][0])
    off = 41 if data[40] == 1 else 42  # VerificationLevel: Full is 1 byte, Partial is 2
    price, _, expo, published = struct.unpack_from("<qQiq", data, off + 32)
    print(f"   {ticker:5} {addr}: {price * 10 ** expo:.2f}, last update {(time.time() - published) / 86400:.0f} days ago")

# 4. Jupiter direct pools for every xStock: best pool, then Raydium CLMM only (one program to build in-contract)
mints = json.loads((Path(__file__).parent / "solana-mints.json").read_text())["xStocks"]
for label, extra in (("best direct pool", ""), ("Raydium CLMM only", "&dexes=Raydium%20CLMM")):
    print(f"== 4. Solana: 1000 USDC -> xStock, {label}")
    for ticker, mint in mints.items():
        url = (f"https://lite-api.jup.ag/swap/v1/quote?inputMint={USDC_SOL}&outputMint={mint}"
               f"&amount=1000000000&slippageBps=100&onlyDirectRoutes=true{extra}")
        for attempt in range(6):
            try:
                q = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "solidon-spike"}), timeout=30))
                hop = q["routePlan"][0]["swapInfo"]
                print(f"   {ticker:5} {hop['label']:14} pool {hop['ammKey']}  impact {float(q['priceImpactPct']) * 100:.3f}%")
                break
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    print(f"   {ticker:5} HTTP {e.code}"); break
                time.sleep(5 * (attempt + 1))
        time.sleep(2)
