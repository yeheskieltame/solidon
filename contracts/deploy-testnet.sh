#!/usr/bin/env bash
# Deploys Solidon to NEAR testnet, once, from scratch:
#   usdc.<factory>     mock-ft, open-mint USDC stand-in (6 decimals)
#   pyth.<factory>     mock-pyth, Pyth read interface with settable prices
#   creator.<factory>  demo creator account
#   <factory>          factory, NVDA as the only listed stock
#   nvda.<factory>     first meme, seeded with 1,000 USDC
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
NVDA_PRICE_ID=b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593
# ponytail: placeholder until the BSC testnet mock token exists (Chain Signatures
# milestone); the stock list is immutable, so that milestone redeploys the factory.
BSC_TOKEN=0x0000000000000000000000000000000000000001

create() { # account, initial balance
  near account create-account fund-myself "$1" "$2" autogenerate-new-keypair \
    --signature-scheme ed25519 save-to-keychain sign-as "$FACTORY" "${NET[@]}" sign-with-keychain send
}
deploy() { # account, wasm, init args
  near contract deploy "$1" use-file "target/near/$2/$2.wasm" with-init-call new json-args "$3" \
    prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${NET[@]}" sign-with-keychain send
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

deploy "$USDC" mock_ft '{"name":"USD Coin (Solidon testnet mock)","symbol":"USDC","decimals":6}'
deploy "$PYTH" mock_pyth '{}'
deploy "$FACTORY" factory "{\"usdc\":\"$USDC\",\"oracle\":\"$PYTH\",\"stocks\":[{\"ticker\":\"NVDA\",\"price_id\":\"$NVDA_PRICE_ID\",\"bsc_token\":\"$BSC_TOKEN\",\"decimals\":18}]}"

# NVDA at $180.00 (Pyth style: expo -8).
call "$CREATOR" "$PYTH" set_price "{\"price_id\":\"$NVDA_PRICE_ID\",\"price\":\"18000000000\",\"expo\":-8}" '0 NEAR'

# Launch: attach launch_cost() rounded up to the next 0.1 NEAR.
COST=$(view "$FACTORY" launch_cost '{}' 2>/dev/null | tr -d '"' | tail -1)
DEPOSIT=$(python3 -c "import math;print(math.ceil(int('$COST')/1e23)/10)")
call "$CREATOR" "$FACTORY" create_meme '{"name":"Nvidia Meme","symbol":"NVDA","thesis_stock":"NVDA","icon":null}' "$DEPOSIT NEAR"
MEME=nvda.$FACTORY

# Seed: creator mints 10,000 mock USDC, registers the meme on USDC, seeds 1,000.
call "$CREATOR" "$USDC" mint "{\"account_id\":\"$CREATOR\",\"amount\":\"10000000000\"}" '0 NEAR'
call "$CREATOR" "$USDC" storage_deposit "{\"account_id\":\"$MEME\"}" '0.01 NEAR'
call "$CREATOR" "$USDC" ft_transfer_call "{\"receiver_id\":\"$MEME\",\"amount\":\"1000000000\",\"msg\":\"{\\\"action\\\":\\\"seed\\\"}\"}" '1 yoctoNEAR'

view "$FACTORY" get_memes '{}'
view "$MEME" get_info '{}'
view "$MEME" get_pool '{}'
