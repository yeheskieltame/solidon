#!/usr/bin/env python3
"""Testnet stock venues for one EVM chain, written to ../stocks/<chain>.json.

For each of the 8 listed stocks:
- if the chain has an official testnet token (Robinhood testnet faucet: TSLA, AMZN), use it and
  its existing Uniswap v3 USDC pool;
- otherwise deploy a synthetic MockERC20 (mainnet decimals of that chain's real stock tokens)
  and create a Uniswap v3 pool against the chain's official testnet USDC, priced at the live
  Chainlink feed on Robinhood Chain mainnet.

Synthetic pools hold one-sided liquidity: stock tokens only, in the range [price, 2 x price],
with the pool initialised just below it. Buying the stock with USDC moves into the range, so
the deployer needs no USDC. (The treasury only ever buys.)

Needs ../.env with EVM_DEPLOYER_ADDRESS and EVM_DEPLOYER_PRIVATE_KEY, and backend/.env with
ALCHEMY_API_KEY (reference prices). Refuses to run twice.
Run: python3 contracts/evm/deploy-testnet-stocks.py base-sepolia | hood-testnet
"""
import json, math, os, subprocess, sys, time
from decimal import Decimal as D, getcontext
from pathlib import Path

getcontext().prec = 80
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1] / "backend/spike"))
import rpc  # noqa: E402  (Alchemy helper; never prints the key)

CHAINS = {
    "base-sepolia": {
        "chain_id": 84532, "rpc": "https://sepolia.base.org", "stock_decimals": 8, "suffix": "c",
        "usdc": ("0x036CbD53842c5426634e7929541eC2318f3dCF7e", 6),  # Circle
        # Uniswap v3, developers.uniswap.org Base Sepolia deployments; factory() checked on-chain
        "factory": "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
        "router": "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
        "npm": "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
        "official": {},
    },
    "hood-testnet": {
        "chain_id": 46630, "rpc": "https://rpc.testnet.chain.robinhood.com", "stock_decimals": 18, "suffix": "",
        "usdc": ("0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F", 18),  # pairs with the faucet stocks
        # Uniswap v3 of the testnet, found on-chain (docs/SPIKE.md S23): router/NPM factory() checked
        "factory": "0x911b4000d3422f482f4062a913885f7b035382df",
        "router": "0x3ce954107b1a675826b33bf23060dd655e3758fe",
        "npm": "0x54A0EF7da351cb8fD1998E7945cc51E5825fB233",
        # Robinhood testnet faucet Stock Tokens (contract 0x8762…17be, verified source)
        "official": {"TSLA": "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
                     "AMZN": "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02"},
    },
}
# Official Chainlink proxies on Robinhood Chain mainnet (docs/SPIKE.md S19)
STOCKS = [("NVDA", "NVIDIA", "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15"),
          ("AAPL", "Apple", "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0"),
          ("MSFT", "Microsoft", "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E"),
          ("GOOGL", "Alphabet", "0xF6f373a037c30F0e5010d854385cA89185AE638b"),
          ("AMZN", "Amazon", "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C"),
          ("META", "Meta Platforms", "0x7C38C00C30BEe9378381E7B6135d7283356D71b1"),
          ("TSLA", "Tesla", "0x4A1166a659A55625345e9515b32adECea5547C38"),
          ("SPCX", "SpaceX", "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb")]
FEE, SPACING = 3000, 60
DEPTH_USD = 50_000  # stock value placed in each synthetic pool

net = sys.argv[1]
cfg = CHAINS[net]
out = Path(os.environ.get("OUT", HERE.parent / f"stocks/{net}.json"))  # OUT/RPC: dry run on an anvil fork
if out.exists():
    sys.exit(f"{out} exists: this setup already ran")
env = dict(l.split("=", 1) for l in (HERE.parent / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
ME, PK = env["EVM_DEPLOYER_ADDRESS"].strip(), env["EVM_DEPLOYER_PRIVATE_KEY"].strip()
RPC = os.environ.get("RPC", cfg["rpc"])
assert int(subprocess.run(["cast", "chain-id", "--rpc-url", RPC], capture_output=True, text=True).stdout) == cfg["chain_id"]


def run(cmd, **kw):  # retry flaky connections; every step here is safe to repeat
    for attempt in range(6):
        r = subprocess.run(cmd, capture_output=True, text=True, **kw)
        if r.returncode == 0 or not any(w in r.stderr for w in ("connection", "error sending request", "timed out")):
            return r
        time.sleep(5 * (attempt + 1))
    return r


def cast(*args):
    r = run(["cast", *args, "--rpc-url", RPC])
    if r.returncode:
        raise SystemExit(f"cast {args[0]} {args[1] if len(args) > 1 else ''} failed: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


def send(to, sig, *args):
    r = run(["cast", "send", "--rpc-url", RPC, "--private-key", PK, "--json", "--gas-limit", "8000000", to, sig, *args],  # estimates run out of gas on NPM calls (pool creation ~5M)
               )
    if r.returncode or json.loads(r.stdout)["status"] != "0x1":
        why = subprocess.run(["cast", "call", "--rpc-url", RPC, "--from", ME, to, sig, *args], capture_output=True, text=True)
        raise SystemExit(f"send {sig} to {to} failed: {(why.stderr or r.stderr).strip()[:300]} tx {json.loads(r.stdout or "{}").get("transactionHash")} gas {json.loads(r.stdout or "{}").get("gasUsed")}")


def deploy(name, symbol, decimals):
    r = run(["forge", "create", "src/MockERC20.sol:MockERC20", "--rpc-url", RPC, "--private-key", PK,
             "--broadcast", "--json", "--constructor-args", name, symbol, str(decimals)], cwd=HERE)
    if r.returncode:
        raise SystemExit(f"deploy {symbol} failed: {r.stderr.strip()[:300]}")
    return json.loads(r.stdout)["deployedTo"]


def chainlink(proxy):
    answer = int(rpc.eth_call("hood", proxy, "0xfeaf968c")[66:130], 16)  # latestRoundData().answer
    return D(answer) / D(10) ** int(rpc.eth_call("hood", proxy, "0x313ce567"), 16)


def tick_of(raw_price):  # raw token1-per-token0 price -> tick, rounded down to the spacing
    return math.floor(math.log(raw_price) / math.log(1.0001)) // SPACING * SPACING


def sqrt_x96(tick):
    return int((D("1.0001") ** tick).sqrt() * 2 ** 96)


def pool_price_usd(pool, stock, s_dec):  # USD per stock from slot0
    r = (D(int(cast("call", pool, "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)").split()[0])) / 2 ** 96) ** 2
    raw = r if stock.lower() < usdc.lower() else 1 / r  # USDC raw per stock raw
    return raw * D(10) ** s_dec / D(10) ** u_dec


subprocess.run(["forge", "build"], cwd=HERE, capture_output=True, check=True)
usdc, u_dec = cfg["usdc"]
s_dec = cfg["stock_decimals"]
rows = []
for ticker, name, proxy in STOCKS:
    price = chainlink(proxy)
    if ticker in cfg["official"]:
        token = cfg["official"][ticker]
        dec = int(cast("call", token, "decimals()(uint8)"))
        pool = cast("call", cfg["factory"], "getPool(address,address,uint24)(address)", token, usdc, str(FEE))
        rows.append({"ticker": ticker, "name": name, "token": token, "symbol": ticker, "decimals": dec, "synthetic": False,
                     "pool": pool, "pool_fee": FEE, "pool_price_usd": f"{pool_price_usd(pool, token, dec):.6f}",
                     "ref_price_usd": f"{price:.2f}"})
        print(f"{ticker:5} official {token} pool {pool} pool price ${D(rows[-1]['pool_price_usd']):.4f} (ref ${price:.2f})")
        continue

    symbol = ticker + cfg["suffix"]
    token = deploy(f"{name} (Solidon synthetic, testnet)", symbol, s_dec)
    amount = int(D(DEPTH_USD) / price * D(10) ** s_dec)
    send(token, "mint(address,uint256)", ME, str(amount))
    send(token, "approve(address,uint256)", cfg["npm"], str(amount))

    raw = price * D(10) ** u_dec / D(10) ** s_dec  # USDC raw per stock raw
    if token.lower() < usdc.lower():  # stock is token0: price = raw; range above, start below it
        t0, t1, a0, a1 = token, usdc, amount, 0
        lo = tick_of(raw)  # range starts at most one spacing (0.6%) below the reference
        hi, start = lo + 7000 // SPACING * SPACING, lo - SPACING // 2  # 1.0001^6960 ~ 2.0
    else:  # stock is token1: price = 1/raw; range below, start above it
        t0, t1, a0, a1 = usdc, token, 0, amount
        hi = tick_of(1 / raw) + SPACING
        lo, start = hi - 7000 // SPACING * SPACING, hi + SPACING // 2
    send(cfg["npm"], "createAndInitializePoolIfNecessary(address,address,uint24,uint160)", t0, t1, str(FEE), str(sqrt_x96(start)))
    send(cfg["npm"], "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))",
         f"({t0},{t1},{FEE},{lo},{hi},{a0},{a1},0,0,{ME},{int(time.time()) + 1200})")
    pool = cast("call", cfg["factory"], "getPool(address,address,uint24)(address)", t0, t1, str(FEE))

    # Check: the pool holds the liquidity, and the range starts within 1% of the reference price.
    # (pool.liquidity() is 0 by design: the range starts just past the current price)
    assert int(cast("call", token, "balanceOf(address)(uint256)", pool).split()[0]) > amount * 99 // 100, f"{ticker}: no liquidity"
    edge = D("1.0001") ** (lo if t0 == token else -hi) * D(10) ** s_dec / D(10) ** u_dec
    assert abs(edge / price - 1) < D("0.01"), f"{ticker}: range starts at {edge}, ref {price}"
    rows.append({"ticker": ticker, "name": name, "token": token, "symbol": symbol, "decimals": s_dec, "synthetic": True,
                 "pool": pool, "pool_fee": FEE, "ref_price_usd": f"{price:.2f}", "liquidity_range_ticks": [lo, hi]})
    print(f"{ticker:5} synthetic {symbol} {token} pool {pool} ref ${price:.2f}")

doc = {
    "_comment": f"Testnet stock venues on {net}, written by contracts/evm/deploy-testnet-stocks.py. "
                "synthetic=true: Solidon MockERC20 (owner-only mint), one-sided liquidity at the reference price. "
                "synthetic=false: the chain's official testnet token and its existing pool.",
    "network": net, "chain_id": cfg["chain_id"], "usdc": usdc, "usdc_decimals": u_dec,
    "uniswap_v3": {"factory": cfg["factory"], "swap_router02": cfg["router"], "position_manager": cfg["npm"]},
    "deployer": ME, "stocks": rows,
}
out.write_text(json.dumps(doc, indent=2) + "\n")
print(f"wrote {out}")
