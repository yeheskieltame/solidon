#!/usr/bin/env bash
# Build every contract to target/near/<crate>/<crate>.wasm.
# Order matters: factory embeds the meme wasm.
set -euo pipefail
cd "$(dirname "$0")"
for crate in meme; do
  (cd "$crate" && cargo near build non-reproducible-wasm --no-abi)
done
