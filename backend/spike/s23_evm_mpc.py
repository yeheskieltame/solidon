"""Spike S23: the NEAR MPC signs and broadcasts EVM transactions from the treasury address
on Base Sepolia and Robinhood Chain testnet (moving a real testnet Stock Token there).

1. derived_public_key(path, signer, domain 0) -> treasury address (checked)
2. build an EIP-1559 tx, keccak the unsigned bytes, MPC `sign` (Ecdsa payload)
3. assemble r, s, y-parity; check that the signer recovers to the treasury; broadcast

Sends testnet transactions (NEAR testnet + target chain). Signs with SIGNER's NEAR keychain.
Run: python3 backend/spike/s23_evm_mpc.py base-sepolia | hood-testnet [swap]
(swap: 0.001 ETH -> TSLA on the testnet Uniswap v3 SwapRouter02, min out = simulation - 1%)
"""
import json, subprocess, sys, time

import rpc

SIGNER, MPC, PATH = "creator.solidon.testnet", "v1.signer-prod.testnet", "evm-treasury"
TREASURY = "0x680bcF5a2E3C07118991Adb3976d3dF077ed96EE"
HOOD_TSLA = "0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e"  # faucet Stock Token, 18 decimals
SINK = "0x000000000000000000000000000000000000dEaD"
HOOD_ROUTER = "0x3ce954107b1a675826b33bf23060dd655e3758fe"  # SwapRouter02, factory 0x911b4000…82df
HOOD_WETH = "0x33e4191705c386532ba27cbf171db86919200b94"


def cast(*args):
    return subprocess.run(["cast", *args], capture_output=True, text=True, check=True).stdout.strip()


def near(*args):
    out = subprocess.run(["near", *args], capture_output=True, text=True)
    return out.stdout.strip(), out.stderr


def rlp(x):
    if isinstance(x, list):
        body = b"".join(rlp(i) for i in x)
        return (bytes([0xC0 + len(body)]) if len(body) < 56 else
                bytes([0xF7 + len(ln := body_len(body))]) + ln) + body
    if len(x) == 1 and x[0] < 0x80:
        return x
    return (bytes([0x80 + len(x)]) if len(x) < 56 else bytes([0xB7 + len(ln := body_len(x))]) + ln) + x


def body_len(b):
    n = len(b)
    return n.to_bytes((n.bit_length() + 7) // 8, "big")


def b58decode(s):
    n = 0
    for c in s: n = n * 58 + "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".index(c)
    return n.to_bytes(64, "big")  # secp256k1 key: x || y


def num(n):
    return n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""


def balance(net, token):
    return int(rpc.eth_call(net, token, "0x70a08231" + TREASURY[2:].lower().rjust(64, "0")), 16)


net = sys.argv[1]
chain_id = int(rpc.call(net, "eth_chainId", []), 16)

# 1. the MPC key really is the treasury
key, _ = near("contract", "call-function", "as-read-only", MPC, "derived_public_key", "json-args",
              json.dumps({"path": PATH, "predecessor": SIGNER, "domain_id": 0}), "network-config", "testnet", "now")
pub = b58decode(json.loads(key).split(":")[1])
derived = "0x" + cast("keccak", "0x" + pub.hex())[-40:]
assert derived.lower() == TREASURY.lower(), derived
print(f"chain {chain_id}: treasury {TREASURY} (MPC {PATH} of {SIGNER})")

# 2. the transaction: on Robinhood testnet move 1 TSLA Stock Token, on Base Sepolia send 0.0001 ETH
if net == "hood-testnet" and sys.argv[2:] == ["swap"]:
    to, value = HOOD_ROUTER, 10 ** 15
    swap = lambda min_out: cast("calldata", "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
                                f"({HOOD_WETH},{HOOD_TSLA},3000,{TREASURY},{value},{min_out},0)")
    quoted = int(rpc.call(net, "eth_call", [{"from": TREASURY, "to": to, "data": swap(1), "value": hex(value)}, "latest"]), 16)
    data = swap(quoted * 99 // 100)
    print(f"TSLA before: {balance(net, HOOD_TSLA) / 1e18}; simulated 0.001 ETH -> {quoted / 1e18} TSLA, min out {quoted * 99 // 100 / 1e18}")
elif net == "hood-testnet":
    to, value = HOOD_TSLA, 0
    data = "0xa9059cbb" + SINK[2:].lower().rjust(64, "0") + format(10 ** 18, "064x")
    print(f"TSLA before: {balance(net, HOOD_TSLA) / 1e18}")
else:
    to, value, data = SINK, 10 ** 14, "0x"
nonce = int(rpc.call(net, "eth_getTransactionCount", [TREASURY, "pending"]), 16)
gas = int(rpc.call(net, "eth_estimateGas", [{"from": TREASURY, "to": to, "value": hex(value), "data": data}]), 16) * 12 // 10
base_fee = int(rpc.call(net, "eth_getBlockByNumber", ["latest", False])["baseFeePerGas"], 16)
tip = int(rpc.call(net, "eth_maxPriorityFeePerGas", []), 16)
fields = [num(chain_id), num(nonce), num(tip), num(base_fee * 2 + tip), num(gas), bytes.fromhex(to[2:]), num(value),
          bytes.fromhex(data[2:]), []]
unsigned = b"\x02" + rlp(fields)
digest = cast("keccak", "0x" + unsigned.hex())[2:]

out, err = near("contract", "call-function", "as-transaction", MPC, "sign", "json-args",
                json.dumps({"request": {"path": PATH, "payload_v2": {"Ecdsa": digest}, "domain_id": 0}}),
                "prepaid-gas", "300.0 Tgas", "attached-deposit", "1 yoctoNEAR", "sign-as", SIGNER,
                "network-config", "testnet", "sign-with-keychain", "send")
near_tx = next((l.split()[-1] for l in err.splitlines() if "Transaction ID" in l), "?")
sig = json.loads(out)
r = int(sig["big_r"]["affine_point"][2:], 16)
s = int(sig["s"]["scalar"], 16)
print(f"MPC sign NEAR tx {near_tx}: recovery_id {sig['recovery_id']}")

# 3. assemble, check the signer, broadcast
raw = "0x02" + rlp(fields[:-1] + [[], num(sig["recovery_id"]), num(r), num(s)]).hex()
decoded = cast("decode-transaction", raw)
assert TREASURY.lower() in decoded.lower(), f"signature does not recover to the treasury: {decoded[:300]}"
txh = rpc.call(net, "eth_sendRawTransaction", [raw])
print(f"broadcast {txh}")
for _ in range(60):
    rec = rpc.call(net, "eth_getTransactionReceipt", [txh])
    if rec:
        print(f"mined in block {int(rec['blockNumber'], 16)}, status {int(rec['status'], 16)}, gas used {int(rec['gasUsed'], 16)}")
        break
    time.sleep(2)
if net == "hood-testnet":
    print(f"TSLA after: {balance(net, HOOD_TSLA) / 1e18}")
