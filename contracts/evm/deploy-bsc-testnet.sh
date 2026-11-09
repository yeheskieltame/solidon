#!/usr/bin/env bash
# One-shot BSC testnet setup for the Chain Signatures flow:
#   mock USDT + one mock bStock per stock in ../stocks/bsc-mainnet.json,
#   a PancakeSwap v3 pool per stock (fee 0.25%, as on mainnet) at the reference
#   price with full-range liquidity of 100,000 USDT,
#   and ../stocks/bsc-testnet.json describing all of it.
# Needs ../.env with BSC_DEPLOYER_PRIVATE_KEY, BSC_DEPLOYER_ADDRESS, BSC_TESTNET_RPC.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ../.env; set +a

# OUT and RPC can be overridden for a dry run on an anvil fork.
OUT=${OUT:-../stocks/bsc-testnet.json}
[ -e "$OUT" ] && { echo "$OUT exists: this setup already ran" >&2; exit 1; }

RPC=${RPC:-$BSC_TESTNET_RPC}
PK=$BSC_DEPLOYER_PRIVATE_KEY
ME=$BSC_DEPLOYER_ADDRESS
# PancakeSwap v3 on BSC testnet (developer.pancakeswap.finance/contracts/v3/addresses)
FACTORY=0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865
NPM=0x427bF5b37357632377eCbEC9de3626C71A5396c1
SWAP_ROUTER=0x1b81D678ffb9C0263b24A97847620C99d213eB14
FEE=2500
TICK=887250 # full range, multiple of the 0.25% tier's tick spacing (50)
USDT_PER_POOL=100000
MAX=0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff

# Reference prices (USD) from the mainnet PancakeSwap USDT pools on 9 Nov 2026.
price_of() {
  case $1 in
    NVDA) echo 187.56 ;; AAPL) echo 342.24 ;; MSFT) echo 531.60 ;; GOOGL) echo 285.44 ;;
    AMZN) echo 260.30 ;; META) echo 612.26 ;; TSLA) echo 358.25 ;; SPCX) echo 135.32 ;;
    *) echo "no reference price for $1" >&2; exit 1 ;;
  esac
}

send() { cast send --rpc-url "$RPC" --private-key "$PK" "$@" >/dev/null; }
deploy() { # name symbol -> address
  forge create src/MockERC20.sol:MockERC20 --rpc-url "$RPC" --private-key "$PK" --broadcast \
    --json --constructor-args "$1" "$2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["deployedTo"])'
}
wei() { python3 -c "from decimal import Decimal as D;print(int(D('$1')*10**18))"; }

forge build >/dev/null
USDT=$(deploy "Tether USD (Solidon testnet mock)" USDT)
send "$USDT" "mint(address,uint256)" "$ME" "$(wei $((USDT_PER_POOL * 9)))"
send "$USDT" "approve(address,uint256)" "$NPM" "$MAX"
echo "USDT $USDT"

ROWS=""
for ticker in $(python3 -c "import json;print(' '.join(s['ticker'] for s in json.load(open('../stocks/bsc-mainnet.json'))['stocks']))"); do
  name=$(python3 -c "import json;print(next(s['name'] for s in json.load(open('../stocks/bsc-mainnet.json'))['stocks'] if s['ticker']=='$ticker'))")
  price=$(price_of "$ticker")
  token=$(deploy "$name (Solidon testnet mock)" "${ticker}B")
  stock_amount=$(python3 -c "from decimal import Decimal as D;print(int(D($USDT_PER_POOL)/D('$price')*10**18))")
  send "$token" "mint(address,uint256)" "$ME" "$stock_amount"
  send "$token" "approve(address,uint256)" "$NPM" "$MAX"

  # token0 < token1 by address; price is token1 per token0 (both 18 decimals).
  read -r t0 t1 a0 a1 sqrt < <(python3 -c "
from decimal import Decimal as D, getcontext
getcontext().prec = 80
stock, usdt, p = '$token'.lower(), '$USDT'.lower(), D('$price')
s_amt, u_amt = $stock_amount, $(wei $USDT_PER_POOL)
if stock < usdt: t0, t1, a0, a1, ratio = stock, usdt, s_amt, u_amt, p
else:            t0, t1, a0, a1, ratio = usdt, stock, u_amt, s_amt, 1 / p
print(t0, t1, a0, a1, int(ratio.sqrt() * 2**96))")

  send "$NPM" "createAndInitializePoolIfNecessary(address,address,uint24,uint160)" "$t0" "$t1" "$FEE" "$sqrt"
  deadline=$(( $(date +%s) + 1200 ))
  send "$NPM" "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))" \
    "($t0,$t1,$FEE,-$TICK,$TICK,$a0,$a1,0,0,$ME,$deadline)"
  pool=$(cast call --rpc-url "$RPC" "$FACTORY" "getPool(address,address,uint24)(address)" "$t0" "$t1" "$FEE")

  # Check: the pool's price is within 1% of the reference price.
  slot0=$(cast call --rpc-url "$RPC" "$pool" "slot0()(uint160,int24,uint16,uint16,uint16,uint32,bool)" | head -1 | awk '{print $1}')
  python3 -c "
from decimal import Decimal as D
r = (D($slot0) / 2**96) ** 2
got = r if '$token'.lower() < '$USDT'.lower() else 1 / r
assert abs(got / D('$price') - 1) < D('0.01'), ('$ticker', got)
print(f'$ticker ${ticker}B $token pool $pool price {got:.2f}')"
  ROWS+="{\"ticker\":\"$ticker\",\"name\":\"$name\",\"bsc_token\":\"$token\",\"bsc_symbol\":\"${ticker}B\",\"decimals\":18,\"ref_price_usd\":\"$price\",\"pancake_v3_pool\":\"$pool\",\"pool_fee\":$FEE},"
done

ROWS="[${ROWS%,}]" python3 - "$OUT" <<EOF
import json, os, sys
mainnet = {s["ticker"]: s for s in json.load(open("../stocks/bsc-mainnet.json"))["stocks"]}
stocks = json.loads(os.environ["ROWS"])
for s in stocks:
    s["price_id"] = mainnet[s["ticker"]]["price_id"]
doc = {
    "_comment": "BSC testnet (chain 97) mocks for the Chain Signatures flow, written by contracts/evm/deploy-bsc-testnet.sh. Mock tokens: owner-only mint by the deployer. Not bStocks.",
    "chain_id": 97,
    "usdt": "$USDT",
    "pancake_v3_factory": "$FACTORY",
    "pancake_v3_position_manager": "$NPM",
    "pancake_v3_swap_router": "$SWAP_ROUTER",
    "deployer": "$ME",
    "stocks": stocks,
}
json.dump(doc, open(sys.argv[1], "w"), indent=2)
open(sys.argv[1], "a").write("\n")
EOF
echo "wrote $OUT"
