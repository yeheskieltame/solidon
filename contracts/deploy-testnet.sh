#!/usr/bin/env bash
# Deploys Solidon to NEAR testnet. Safe to re-run: existing accounts and mocks are
# kept. The factory can only be initialised once, so it needs an account without
# code: to redeploy it, delete the factory account and create it again first
# (see docs/DEPLOYMENTS.md).
#   usdc.<factory>     mock-ft, open-mint USDC stand-in (6 decimals)
#   pyth.<factory>     mock-pyth, Pyth read interface with settable prices
#   creator.<factory>  demo creator account
#   <factory>          factory listing every stock in stocks/bsc-mainnet.json
# No meme is launched: launch one from the launchpad (or `create_meme`).
#
# Signs with keys in the macOS keychain (near-cli-rs). No key is stored in the repo.
# Usage: contracts/deploy-testnet.sh [factory-account]   (default: solidon.testnet)
set -euo pipefail
cd "$(dirname "$0")"

FACTORY=${1:-solidon.testnet}
USDC=usdc.$FACTORY
PYTH=pyth.$FACTORY
CREATOR=creator.$FACTORY
NET=(network-config testnet)
RPC=https://rpc.testnet.near.org

rpc_view_account() { # account -> code hash, or "missing"
  curl -s "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" |
    python3 -c "import sys,json;r=json.load(sys.stdin);print(r['result']['code_hash'] if 'result' in r else 'missing')"
}
create() { # account, initial balance
  if [ "$(rpc_view_account "$1")" != missing ]; then echo "exists: $1"; return; fi
  near account create-account fund-myself "$1" "$2" autogenerate-new-keypair \
    --signature-scheme ed25519 save-to-keychain sign-as "$FACTORY" "${NET[@]}" sign-with-keychain send
}
deploy() { # account, wasm, init args
  near contract deploy "$1" use-file "target/near/$2/$2.wasm" with-init-call new json-args "$3" \
    prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${NET[@]}" sign-with-keychain send
}
deploy_once() { # account, wasm, init args: skips an account that already has code
  if [ "$(rpc_view_account "$1")" != 11111111111111111111111111111111 ]; then echo "has code: $1"; return; fi
  deploy "$@"
}
call() { # signer, contract, method, args, deposit
  near contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas '300.0 Tgas' attached-deposit "$5" sign-as "$1" "${NET[@]}" sign-with-keychain send
}
view() { # contract, method, args
  near contract call-function as-read-only "$1" "$2" json-args "$3" "${NET[@]}" now
}

./build.sh

create "$USDC" '2 NEAR'
create "$PYTH" '1.5 NEAR'
create "$CREATOR" '3.5 NEAR'

deploy_once "$USDC" mock_ft '{"name":"USD Coin (Solidon testnet mock)","symbol":"USDC","decimals":6}'
deploy_once "$PYTH" mock_pyth '{}'

# Stock list: tickers, Pyth feeds, decimals from the verified mainnet registry.
# ponytail: BSC testnet has no bStocks, so token addresses are placeholders 0x…01-0x…08
# until the Chain Signatures milestone deploys a mock token per ticker (and redeploys).
STOCKS=$(python3 -c "
import json
reg = json.load(open('stocks/bsc-mainnet.json'))
print(json.dumps([{'ticker': s['ticker'], 'price_id': s['price_id'], 'decimals': s['decimals'],
                   'bsc_token': '0x' + format(i + 1, '040x')} for i, s in enumerate(reg['stocks'])]))")
if [ "$(rpc_view_account "$FACTORY")" != 11111111111111111111111111111111 ]; then
  echo "$FACTORY already has code: delete and recreate the account to redeploy the factory" >&2
  exit 1
fi
deploy "$FACTORY" factory "{\"usdc\":\"$USDC\",\"oracle\":\"$PYTH\",\"stocks\":$STOCKS}"

# Mock prices (USD, Pyth style expo -8), from the PancakeSwap USDT pools on 9 Nov 2026.
while read -r ticker usd; do
  id=$(python3 -c "import json;print(next(s['price_id'] for s in json.load(open('stocks/bsc-mainnet.json'))['stocks'] if s['ticker']=='$ticker'))")
  price=$(python3 -c "print(round($usd * 10**8))")
  call "$CREATOR" "$PYTH" set_price "{\"price_id\":\"$id\",\"price\":\"$price\",\"expo\":-8}" '0 NEAR'
done <<'EOF'
NVDA 187.56
AAPL 342.24
MSFT 531.60
GOOGL 285.44
AMZN 260.30
META 612.26
TSLA 358.25
SPCX 135.32
EOF

view "$FACTORY" get_stocks '{}'
view "$FACTORY" launch_cost '{}'
