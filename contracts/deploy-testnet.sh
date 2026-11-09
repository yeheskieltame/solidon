#!/usr/bin/env bash
# Deploys Solidon to NEAR testnet. Safe to re-run: existing accounts and mocks are
# kept. The factory can only be initialised once, so it needs an account without
# code: to redeploy it, delete the factory account and create it again first
# (see docs/DEPLOYMENTS.md).
#   usdc.<factory>     mock-ft, open-mint USDC stand-in (6 decimals)
#   pyth.<factory>     mock-pyth, Pyth read interface with settable prices
#   creator.<factory>  demo creator account
#   <factory>          factory listing the 8 stocks of stocks/feeds.json, each with a venue
#                      on Base Sepolia (stocks/base-sepolia.json), Robinhood Chain
#                      testnet (stocks/hood-testnet.json) and Solana devnet
#                      (stocks/solana-devnet.json, pool accounts checked against devnet
#                      by stocks/solana-accounts.py before the deploy)
# No meme is launched: launch one from the launchpad (or `create_meme`).
#
# Signs with keys in the macOS keychain (near-cli-rs). No key is stored in the repo.
# Usage: contracts/deploy-testnet.sh [factory-account]   (default: solidon.testnet)
#        DRY_RUN=1 contracts/deploy-testnet.sh            prints the factory init args, sends nothing
set -euo pipefail
cd "$(dirname "$0")"

FACTORY=${1:-solidon.testnet}
USDC=usdc.$FACTORY
PYTH=pyth.$FACTORY
CREATOR=creator.$FACTORY
# Bridge and relayer of every meme: a keeper account (not created here). On testnet it
# stands in for Intents/1Click, delivering testnet USDC to the treasury, and reports
# arrivals on Robinhood Chain, which the MPC cannot verify.
KEEPER=keeper.$FACTORY
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

# Factory init args. Chains: the testnet MPC signer, then per chain its USDC, Uniswap v3
# SwapRouter02 and pool fee from the venue registry. Gas caps: the base fee was
# 0.005 gwei on Base Sepolia and 0.01 gwei on Robinhood testnet (10 Nov 2026), so a
# 0.1 gwei cap leaves 10-20x headroom. Swaps (and each fund_chain transfer) are capped
# at 5 USDC. Cash arriving on Base is proven by the MPC (`Latest`: Base Sepolia blocks
# take tens of minutes to be `Finalized`, S18); Robinhood Chain is not in the MPC's
# list, so the relayer reports it.
# Solana devnet: Circle USDC, Raydium CLMM devnet program and AMM config, swaps capped at
# 5 USDC; cash reported by the relayer (an MPC-proven balance is not an arrival, see
# meme/src/solana_treasury.rs). Each Solana venue carries its pool's accounts.
# Stocks: the oracle feed id from feeds.json and one venue per chain.
FACTORY_ARGS=$(python3 -c "
import json
gwei = 10**9
chains = [('base', 'stocks/base-sepolia.json', gwei // 1000, {'Mpc': {'foreign_chain': 'Base', 'finality': 'Latest'}}),
          ('robinhood', 'stocks/hood-testnet.json', gwei // 100, 'Relayer')]
evm, venues = [], {}
for name, path, priority, proof in chains:
    r = json.load(open(path))
    fees = {s['pool_fee'] for s in r['stocks']}
    assert len(fees) == 1, f'{path}: one pool fee per chain expected, got {fees}'
    evm.append({'name': name, 'chain_id': r['chain_id'], 'usdc': r['usdc'], 'usdc_decimals': r['usdc_decimals'],
                'swap_router': r['uniswap_v3']['swap_router02'], 'pool_fee': fees.pop(),
                'max_fee_per_gas': str(gwei // 10), 'max_priority_fee_per_gas': str(priority),
                'max_swap_usdc': str(5 * 10**r['usdc_decimals']), 'proof': proof})
    for s in r['stocks']:
        venues.setdefault(s['ticker'], []).append({'chain': name, 'token': s['token'], 'decimals': s['decimals']})
sol = json.load(open('stocks/solana-devnet.json'))
assert sol['usdc_decimals'] == 6, 'the meme assumes 6-decimal USDC on Solana'
solana = {'name': 'solana', 'usdc_mint': sol['usdc'], 'usdc_token_program': sol['usdc_token_program'],
          'stock_token_program': sol['stock_token_program'], 'clmm_program': sol['raydium_clmm']['program'],
          'amm_config': sol['raydium_clmm']['amm_config'], 'max_swap_usdc': str(5 * 10**6)}
pool_keys = ('pool', 'usdc_vault', 'stock_vault', 'observation', 'bitmap_extension')
for s in sol['stocks']:
    venues[s['ticker']].append({'chain': 'solana', 'token': s['token'], 'decimals': s['decimals'],
                                'solana': {k: s[k] for k in pool_keys}})
feeds = json.load(open('stocks/feeds.json'))['feeds']
assert set(feeds) == set(venues), 'every listed stock needs a feed and venues'
stocks = [{'ticker': t, 'price_id': f, 'venues': venues[t]} for t, f in feeds.items()]
print(json.dumps({'usdc': '$USDC', 'oracle': '$PYTH',
                  'chains': {'mpc': 'v1.signer-prod.testnet', 'bridge': '$KEEPER', 'relayer': '$KEEPER', 'evm': evm,
                             'solana': solana},
                  'stocks': stocks}))")
if [ -n "${DRY_RUN:-}" ]; then
  echo "$FACTORY_ARGS"
  exit 0
fi

# The Solana pool accounts are locked into every meme: check them against devnet first.
python3 stocks/solana-accounts.py

./build.sh

create "$USDC" '2 NEAR'
create "$PYTH" '1.5 NEAR'
create "$CREATOR" '3.5 NEAR'

deploy_once "$USDC" mock_ft '{"name":"USD Coin (Solidon testnet mock)","symbol":"USDC","decimals":6}'
deploy_once "$PYTH" mock_pyth '{}'

if [ "$(rpc_view_account "$FACTORY")" != 11111111111111111111111111111111 ]; then
  echo "$FACTORY already has code: delete and recreate the account to redeploy the factory" >&2
  exit 1
fi
deploy "$FACTORY" factory "$FACTORY_ARGS"

# Mock oracle prices = the reference prices the synthetic pools were created at
# (the same on both chains: one global price per stock).
python3 -c "
import json
feeds = json.load(open('stocks/feeds.json'))['feeds']
for s in json.load(open('stocks/base-sepolia.json'))['stocks']:
    print(feeds[s['ticker']], round(float(s['ref_price_usd']) * 10**8))" |
while read -r id price; do
  call "$CREATOR" "$PYTH" set_price "{\"price_id\":\"$id\",\"price\":\"$price\",\"expo\":-8}" '0 NEAR'
done

view "$FACTORY" get_stocks '{}'
view "$FACTORY" launch_cost '{}'
