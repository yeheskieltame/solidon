"""Spike S8: reproduce the MPC foreign-tx payload hash from our own BSC RPC data.

payload_hash = sha256(borsh(ForeignTxSignPayload::V1 { request, values })), types from
near/mpc crates/near-mpc-contract-interface/src/types/foreign_chain.rs.
Run: python3 backend/spike/s8_foreign_tx_hash.py <bsc-rpc> <tx-hash> <log-index> <expected-hash>
"""
import hashlib
import json
import struct
import sys
import urllib.request

rpc, tx, log_index, expected = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]


def call(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(rpc, body, {"content-type": "application/json", "user-agent": "solidon-spike"})
    return json.load(urllib.request.urlopen(req, timeout=30))["result"]


u8 = lambda v: struct.pack("<B", v)
u32 = lambda v: struct.pack("<I", v)
u64 = lambda v: struct.pack("<Q", v)
b = lambda h: bytes.fromhex(h[2:] if h.startswith("0x") else h)
string = lambda s: u32(len(s.encode())) + s.encode()

receipt = call("eth_getTransactionReceipt", [tx])
log = next(l for l in receipt["logs"] if int(l["logIndex"], 16) == log_index)

BNB, FINALIZED, EVM_VALUE = 5, 2, 1
request = (u8(BNB) + b(tx)
           + u32(2) + u8(0) + u8(1) + u64(log_index)   # extractors: BlockHash, Log{log_index}
           + u8(FINALIZED))


def evm_log(data_repr):
    return (u8(EVM_VALUE) + u8(1)  # ExtractedValue::EvmExtractedValue(EvmExtractedValue::Log)
            + u8(1 if log.get("removed") else 0)
            + u64(int(log["logIndex"], 16)) + u64(int(log["transactionIndex"], 16))
            + b(log["transactionHash"]) + b(log["blockHash"]) + u64(int(log["blockNumber"], 16))
            + b(log["address"]) + string(data_repr)
            + u32(len(log["topics"])) + b"".join(b(t) for t in log["topics"]))


block_hash = u8(EVM_VALUE) + u8(0) + b(receipt["blockHash"])
for label, data in (("0x-prefixed hex", log["data"]), ("bare hex", log["data"][2:])):
    payload = u8(0) + request + u32(2) + block_hash + evm_log(data)
    got = hashlib.sha256(payload).hexdigest()
    print(f"{label:16} {got} {'MATCH' if got == expected else 'no match'}")
