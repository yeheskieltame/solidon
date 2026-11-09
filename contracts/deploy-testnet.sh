#!/usr/bin/env bash
# Deploys Solidon to NEAR testnet. Safe to re-run: existing accounts and mocks are
# kept. The factory can only be initialised once, so it needs an account without
# code: to redeploy it, delete the factory account and create it again first
# (see docs/DEPLOYMENTS.md).
#   usdc.<factory>     mock-ft, open-mint USDC stand-in (6 decimals)
#   pyth.<factory>     mock-pyth, Pyth read interface with settable prices
#   creator.<factory>  demo creator account
#   <factory>          factory listing every stock in stocks/bsc-testnet.json
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

# Stock list: BSC testnet mock tokens with the real Pyth feed IDs, written by
# evm/deploy-bsc-testnet.sh (BSC testnet has no bStocks).
REGISTRY=stocks/bsc-testnet.json
STOCKS=$(python3 -c "
import json
print(json.dumps([{k: s[k] for k in ('ticker', 'price_id', 'bsc_token', 'decimals')}
                  for s in json.load(open('$REGISTRY'))['stocks']]))")
if [ "$(rpc_view_account "$FACTORY")" != 11111111111111111111111111111111 ]; then
  echo "$FACTORY already has code: delete and recreate the account to redeploy the factory" >&2
  exit 1
fi
# BSC side: testnet chain id, mock USDT, PancakeSwap v3 SwapRouter, the testnet MPC
# signer, 1 gwei gas, and swaps capped at 500 USDT (0.5% of a 100k-USDT pool, so
# fee + impact stays under the 1% slippage allowed against Pyth).
BSC=$(python3 -c "
import json
r = json.load(open('$REGISTRY'))
print(json.dumps({'chain_id': r['chain_id'], 'usdt': r['usdt'], 'swap_router': r['pancake_v3_swap_router'],
                  'pool_fee': r['stocks'][0]['pool_fee'], 'mpc': 'v1.signer-prod.testnet',
                  'max_fee_per_gas': str(10**9), 'max_swap_usdt': str(500 * 10**18)}))")
deploy "$FACTORY" factory "{\"usdc\":\"$USDC\",\"oracle\":\"$PYTH\",\"bsc\":$BSC,\"stocks\":$STOCKS}"

# Mock Pyth prices = the reference prices the BSC testnet pools were created at.
python3 -c "
import json
for s in json.load(open('$REGISTRY'))['stocks']:
    print(s['price_id'], round(float(s['ref_price_usd']) * 10**8))" |
while read -r id price; do
  call "$CREATOR" "$PYTH" set_price "{\"price_id\":\"$id\",\"price\":\"$price\",\"expo\":-8}" '0 NEAR'
done

view "$FACTORY" get_stocks '{}'
view "$FACTORY" launch_cost '{}'
