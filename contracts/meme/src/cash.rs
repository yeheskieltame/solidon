//! USDC cash between NEAR and the treasury chains, with no trusted party on the way in.
//!
//! Out: `fund_chain` sends NEAR cash above the 20% buffer to the factory's bridge
//! account (on mainnet the Intents/1Click leg, on testnet a keeper that delivers
//! testnet USDC) and books it as in transit to that chain. NAV counts it throughout.
//!
//! In: a chain's USDC ledger is only ever credited out of its in-transit amount, so a
//! credit moves value between two lines of the ledger and can never create any. Each
//! arrival can be credited once. How an arrival is proven depends on the chain:
//! - `CashProof::Mpc` (Base): the USDC `Transfer` log to the treasury is verified by the
//!   NEAR MPC network (`verify_foreign_transaction`, SPIKE S8/S18). Anyone can submit it.
//! - `CashProof::Relayer` (Robinhood Chain, not readable by the MPC): the factory's
//!   relayer account reports the arrival. A trust assumption, stated in docs/SPEC.md.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, Gas, NearToken, Promise, PromiseError, PromiseOrValue};

use crate::mnav::{PythPrice, USDC_DECIMALS};
use crate::pool::{emit, mul_div};
use crate::treasury::{hex_decode, hex_encode, parse_address, EvmChain};
use crate::{Meme, MemeExt};

/// MPC domain that signs foreign-chain verifications (S8: the domain 3 root key).
const DOMAIN_FOREIGN_TX: u64 = 3;
/// keccak256("Transfer(address,address,uint256)").
const TRANSFER_TOPIC: [u8; 32] = [
    0xdd, 0xf2, 0x52, 0xad, 0x1b, 0xe2, 0xc8, 0x9b, 0x69, 0xc2, 0xb0, 0x68, 0xfc, 0x37, 0x8d, 0xaa,
    0x95, 0x2b, 0xa7, 0xf1, 0x63, 0xc4, 0xa1, 0x16, 0x28, 0xf5, 0x5a, 0x4d, 0xf5, 0x23, 0xb3, 0xef,
];
/// The EVM variants of the MPC's `ForeignChainRpcRequest` and their borsh index (near/mpc
/// crates/near-mpc-contract-interface/src/types/foreign_chain.rs). Base = 6 is checked
/// against the live testnet MPC in the tests below.
const MPC_EVM_CHAINS: [(&str, u8); 9] = [
    ("Abstract", 0),
    ("Ethereum", 1),
    ("Bnb", 5),
    ("Base", 6),
    ("Arbitrum", 7),
    ("Polygon", 8),
    ("HyperEvm", 9),
    ("Avalanche", 13),
    ("Adi", 14),
];
const BPS: u128 = 10_000;
const GAS_ON_FUND_PRICE: Gas = Gas::from_tgas(40);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_FUNDED: Gas = Gas::from_tgas(10);
const GAS_MPC_VERIFY: Gas = Gas::from_tgas(50);
const GAS_ON_VERIFIED: Gas = Gas::from_tgas(20);

/// The MPC's `EvmFinality`, same variant order (it is borsh-encoded into the payload).
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Finality {
    Latest,
    Safe,
    Finalized,
}

/// How cash arriving on a chain is proven before it is booked.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum CashProof {
    /// The MPC network verifies the USDC `Transfer` log. `foreign_chain` is the MPC's
    /// name for the chain (e.g. `Base`). Testnet uses `Latest`: an L2 block is only
    /// `Finalized` once its batch is final on Ethereum (tens of minutes, S18), while
    /// `Latest` answers in seconds. The risk it leaves is a sequencer reorg dropping a
    /// credited deposit, bounded by the cash in transit; mainnet should use `Finalized`.
    Mpc {
        foreign_chain: String,
        finality: Finality,
    },
    /// The chain is not in the MPC's foreign-chain list: `ChainsConfig::relayer` reports.
    Relayer,
}

impl CashProof {
    pub fn assert_valid(&self) {
        if let CashProof::Mpc { foreign_chain, .. } = self {
            require!(
                mpc_chain_index(foreign_chain).is_some(),
                "foreign_chain must be an EVM chain the MPC verifies"
            );
        }
    }
}

fn mpc_chain_index(name: &str) -> Option<u8> {
    MPC_EVM_CHAINS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, i)| *i)
}

impl EvmChain {
    /// Raw units of this chain's USDC per 6-decimal unit.
    pub fn usdc_scale(&self) -> u128 {
        10u128.pow(u32::from(self.usdc_decimals) - USDC_DECIMALS)
    }
}

/// A log as `eth_getTransactionReceipt` returns it; hex strings with `0x`.
#[near(serializers = [json])]
pub struct LogArgs {
    pub block_hash: String,
    pub block_number: u64,
    pub transaction_index: u64,
    pub address: String,
    pub topics: Vec<String>,
    pub data: String,
}

/// The MPC's `EvmLog`, plus the request fields that select it.
#[derive(Debug, PartialEq)]
pub struct EvmLog {
    pub tx_hash: [u8; 32],
    pub log_index: u64,
    pub block_hash: [u8; 32],
    pub block_number: u64,
    pub transaction_index: u64,
    pub address: [u8; 20],
    pub topics: Vec<[u8; 32]>,
    pub data: Vec<u8>,
}

fn hex_bytes(s: &str) -> Vec<u8> {
    s.strip_prefix("0x")
        .and_then(hex_decode)
        .unwrap_or_else(|| env::panic_str("expected 0x-prefixed hex"))
}

fn hash32(s: &str) -> [u8; 32] {
    hex_bytes(s)
        .try_into()
        .unwrap_or_else(|_| env::panic_str("expected a 32-byte hash"))
}

impl EvmLog {
    pub fn parse(tx_hash: &str, log_index: u64, log: &LogArgs) -> Self {
        Self {
            tx_hash: hash32(tx_hash),
            log_index,
            block_hash: hash32(&log.block_hash),
            block_number: log.block_number,
            transaction_index: log.transaction_index,
            address: parse_address(&log.address),
            topics: log.topics.iter().map(|t| hash32(t)).collect(),
            data: hex_bytes(&log.data),
        }
    }

    /// The `value` of a USDC `Transfer` to `to` emitted by `usdc`; panics on anything else.
    pub fn transfer_value(&self, usdc: &[u8; 20], to: &[u8; 20]) -> u128 {
        require!(
            self.address == *usdc,
            "The log is not from the chain's USDC"
        );
        require!(
            self.topics.len() == 3 && self.topics[0] == TRANSFER_TOPIC,
            "The log is not an ERC-20 Transfer"
        );
        require!(
            self.topics[2][..12] == [0; 12] && self.topics[2][12..] == *to,
            "The transfer is not to the treasury"
        );
        require!(
            self.data.len() == 32 && self.data[..16] == [0; 16],
            "Transfer value out of range"
        );
        u128::from_be_bytes(self.data[16..].try_into().unwrap())
    }

    /// sha256(borsh(ForeignTxSignPayload::V1 { request, values })): the hash the MPC signs
    /// for a request with one `Log` extractor, so the one we pass as `expected_payload_hash`.
    /// Same encoding as backend/spike/s8_foreign_tx_hash.py.
    pub fn payload_hash(&self, foreign_chain: u8, finality: Finality) -> [u8; 32] {
        let mut b = vec![0]; // ForeignTxSignPayload::V1
                             // request: ForeignChainRpcRequest::<chain>(EvmRpcRequest { tx_id, extractors, finality })
        b.push(foreign_chain);
        b.extend(self.tx_hash);
        b.extend(1u32.to_le_bytes()); // extractors: [EvmExtractor::Log { log_index }]
        b.push(1);
        b.extend(self.log_index.to_le_bytes());
        b.push(finality as u8);
        // values: [ExtractedValue::EvmExtractedValue(EvmExtractedValue::Log(EvmLog))]
        b.extend(1u32.to_le_bytes());
        b.extend([1, 1]);
        b.push(0); // removed: false (a removed log hashes differently, so it never verifies)
        b.extend(self.log_index.to_le_bytes());
        b.extend(self.transaction_index.to_le_bytes());
        b.extend(self.tx_hash);
        b.extend(self.block_hash);
        b.extend(self.block_number.to_le_bytes());
        b.extend(self.address);
        // The MPC hashes `data` as the RPC's lowercase `0x` string, not as bytes.
        let data = format!("0x{}", hex_encode(&self.data));
        b.extend((data.len() as u32).to_le_bytes());
        b.extend(data.as_bytes());
        b.extend((self.topics.len() as u32).to_le_bytes());
        for t in &self.topics {
            b.extend(t);
        }
        env::sha256_array(&b)
    }
}

#[near(serializers = [json])]
pub struct VerifyResponse {
    pub payload_hash: String,
}

impl Meme {
    /// Cash `fund_chain` may send to chain `i` at price `p`: NEAR cash above the 20% buffer
    /// (the buyback rule), capped at one swap's worth. Zero for an unusable price.
    pub(crate) fn sendable(&self, i: usize, p: &PythPrice) -> u128 {
        let c = &self.chains.evm[i];
        let Some(assets) = self.assets(p) else {
            return 0;
        };
        let buffer = mul_div(assets, self.params.cash_buffer_bps.into(), BPS);
        self.treasury_usdc
            .saturating_sub(buffer)
            .min(c.max_swap_usdc.0 / c.usdc_scale())
    }

    /// Moves `amount` (6 decimals) of chain `i`'s in-transit cash into its USDC ledger,
    /// capped by what is in transit. Returns the amount moved.
    pub(crate) fn book_arrival(&mut self, i: usize, amount: u128) -> u128 {
        let scale = self.chains.evm[i].usdc_scale();
        let s = &mut self.treasury.chains[i];
        let credit = amount.min(s.in_transit);
        s.in_transit -= credit;
        s.usdc += credit * scale;
        credit
    }
}

#[near]
impl Meme {
    /// Sends NEAR cash above the 20% buffer, at most one swap's worth, to the bridge for
    /// `chain`'s treasury. Anyone. Reads a fresh price (the buffer is 20% of NAV assets);
    /// attach 100 TGas.
    pub fn fund_chain(&mut self, chain: String) -> Promise {
        let i = self.chain_index(&chain);
        self.treasury_address();
        self.read_price()
            .get_price_no_older_than(self.stock.price_id.clone(), self.params.oracle_max_age_secs)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_FUND_PRICE)
                    .on_fund_price(i as u32),
            )
    }

    /// Books the cash as in transit before the transfer, so NAV never counts it twice.
    #[private]
    pub fn on_fund_price(
        &mut self,
        chain: u32,
        #[callback_result] price: Result<Option<PythPrice>, PromiseError>,
    ) -> PromiseOrValue<U128> {
        let i = chain as usize;
        let name = self.chains.evm[i].name.clone();
        let amount = price.ok().flatten().map_or(0, |p| self.sendable(i, &p));
        if amount == 0 {
            emit(
                "fund_chain_skipped",
                json!({"chain": name, "reason": "no fresh price or no cash above the buffer"}),
            );
            return PromiseOrValue::Value(U128(0));
        }
        self.treasury_usdc -= amount;
        self.treasury.chains[i].in_transit += amount;
        let to = format!("0x{}", hex_encode(&self.treasury_address()));
        emit(
            "cash_sent",
            json!({"chain": name, "amount": U128(amount), "bridge": self.chains.bridge, "to": to}),
        );
        // The memo tells the bridge where to deliver.
        let memo = format!("solidon fund {name} {to}");
        PromiseOrValue::Promise(
            ext_ft_core::ext(self.usdc.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FT_TRANSFER)
                .ft_transfer(self.chains.bridge.clone(), U128(amount), Some(memo))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_ON_FUNDED)
                        .on_funded(chain, U128(amount)),
                ),
        )
    }

    /// A failed transfer returns the cash to NEAR. Never panics: in-transit cash may
    /// already have been credited by a real arrival (e.g. a donation), so it saturates.
    #[private]
    pub fn on_funded(&mut self, chain: u32, amount: U128) -> U128 {
        if near_sdk::is_promise_success() {
            return amount;
        }
        let s = &mut self.treasury.chains[chain as usize];
        s.in_transit = s.in_transit.saturating_sub(amount.0);
        self.treasury_usdc += amount.0;
        emit(
            "cash_returned",
            json!({"chain": self.chains.evm[chain as usize].name, "amount": amount}),
        );
        U128(0)
    }

    /// Credits a USDC `Transfer` to the treasury on an MPC-verified chain, up to the cash
    /// in transit there. Anyone; the log comes from `eth_getTransactionReceipt`. The MPC
    /// only answers if its nodes see exactly this log on the chain (a wrong claim times
    /// out, S8), so a successful answer is the proof. Attach 300 TGas.
    pub fn credit_cash(
        &mut self,
        chain: String,
        tx_hash: String,
        log_index: u64,
        log: LogArgs,
    ) -> Promise {
        let i = self.chain_index(&chain);
        let c = &self.chains.evm[i];
        let CashProof::Mpc {
            foreign_chain,
            finality,
        } = &c.proof
        else {
            env::panic_str("This chain's cash is reported by the relayer")
        };
        let log = EvmLog::parse(&tx_hash, log_index, &log);
        let amount =
            log.transfer_value(&parse_address(&c.usdc), &self.treasury_address()) / c.usdc_scale();
        require!(amount > 0, "Transfer is below one USDC unit");
        require!(
            self.treasury.chains[i].in_transit > 0,
            "No cash in transit to this chain"
        );
        let hash = log.payload_hash(mpc_chain_index(foreign_chain).unwrap(), *finality);
        let args = json!({"request": {
            "request": {foreign_chain.as_str(): {"tx_id": hex_encode(&log.tx_hash),
                "extractors": [{"Log": {"log_index": log_index}}], "finality": finality}},
            "domain_id": DOMAIN_FOREIGN_TX, "payload_version": 1,
            "expected_payload_hash": hex_encode(&hash)}});
        // Reserved now so a second call for the same log fails fast; released on failure.
        require!(
            self.treasury
                .credited
                .insert((i as u32, log.tx_hash, log_index)),
            "Already credited"
        );
        Promise::new(self.chains.mpc.clone())
            .function_call(
                "verify_foreign_transaction",
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_MPC_VERIFY,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_VERIFIED)
                    .on_cash_verified(
                        i as u32,
                        log.tx_hash,
                        log_index,
                        U128(amount),
                        hex_encode(&hash),
                    ),
            )
    }

    /// Never panics: a panic would keep the log reserved forever. Only this contract can
    /// call it, and the result it reads is that of our own call to the factory-fixed MPC
    /// contract, so the response's signature needs no check here (it is for verifiers
    /// outside NEAR); the payload hash must still be the one we asked for.
    #[private]
    pub fn on_cash_verified(
        &mut self,
        chain: u32,
        tx_hash: [u8; 32],
        log_index: u64,
        amount: U128,
        payload_hash: String,
    ) -> U128 {
        let verified = env::promise_result_checked(0, 1024)
            .ok()
            .and_then(|b| near_sdk::serde_json::from_slice::<VerifyResponse>(&b).ok())
            .is_some_and(|r| r.payload_hash.eq_ignore_ascii_case(&payload_hash));
        let name = self.chains.evm[chain as usize].name.clone();
        let tx = format!("0x{}", hex_encode(&tx_hash));
        if !verified {
            self.treasury.credited.remove(&(chain, tx_hash, log_index));
            emit(
                "cash_rejected",
                json!({"chain": name, "tx_hash": tx, "log_index": log_index}),
            );
            return U128(0);
        }
        let credit = self.book_arrival(chain as usize, amount.0);
        emit(
            "cash_credited",
            json!({"chain": name, "tx_hash": tx, "log_index": log_index, "amount": U128(credit), "proof": "mpc"}),
        );
        U128(credit)
    }

    /// Credits cash that arrived on a relayer-reported chain, up to the cash in transit
    /// there. Only `ChainsConfig::relayer`, once per `tx_hash`. `amount` is in raw units
    /// of the chain's USDC.
    pub fn report_cash(&mut self, chain: String, tx_hash: String, amount: U128) -> U128 {
        require!(
            env::predecessor_account_id() == self.chains.relayer,
            "Only the relayer can report cash"
        );
        let i = self.chain_index(&chain);
        let c = &self.chains.evm[i];
        require!(
            c.proof == CashProof::Relayer,
            "This chain's cash is proven by the MPC: use credit_cash"
        );
        let amount = amount.0 / c.usdc_scale();
        let tx = hash32(&tx_hash);
        require!(
            self.treasury.credited.insert((i as u32, tx, 0)),
            "Already credited"
        );
        let credit = self.book_arrival(i, amount);
        require!(credit > 0, "Nothing in transit, or below one USDC unit");
        emit(
            "cash_credited",
            json!({"chain": self.chains.evm[i].name, "tx_hash": tx_hash, "amount": U128(credit), "proof": "relayer"}),
        );
        U128(credit)
    }
}

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;
    use near_sdk::json_types::{I64, U64};
    use near_sdk::test_utils::{accounts, get_created_receipts, VMContextBuilder};
    use near_sdk::{testing_env, PromiseResult};

    const USDC: u128 = 1_000_000;
    const BASE: usize = 0;
    const ROBINHOOD: usize = 1;
    /// The S23 treasury: `evm-treasury` of creator.solidon.testnet.
    const TREASURY: &str = "0x680bcF5a2E3C07118991Adb3976d3dF077ed96EE";

    /// Base Sepolia tx 0x96305fb3…5379, log 1: a USDC Transfer of 1 raw unit. The live
    /// testnet MPC verified it in S18 (NEAR tx 8XLNe554VZ8ZQ3XebDVCGoXA8nKTVvPdwfZk1xMmcDHZ,
    /// `Base`, `[Log { log_index: 1 }]`, `Latest`) and returned this payload hash.
    const S18_TX: &str = "0x96305fb37c49ffe18da8e353bb2bdf436c672fba6b1913bd741236c85b235379";
    const S18_HASH: &str = "2893632630187cd298d22209d061dbcb751f2aaa85000988271552ae866fa918";

    fn s18_log() -> LogArgs {
        LogArgs {
            block_hash: "0x91b03c4f0be2beaa4113f1e6c09b6ccdafaa264908899193fd6573d17abc5afb".into(),
            block_number: 56_556_227,
            transaction_index: 2,
            address: "0x036cbd53842c5426634e7929541ec2318f3dcf7e".into(),
            topics: vec![
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef".into(),
                "0x0000000000000000000000007e53e097f43948bf2f18dbad8003801079df44d6".into(),
                "0x00000000000000000000000023a284a7464e30d2cabdcf61dd6e8d8f9ef20bea".into(),
            ],
            data: "0x0000000000000000000000000000000000000000000000000000000000000001".into(),
        }
    }

    /// Base Sepolia tx 0xb4a83dbf…e484, log 0: Circle's faucet sends 20 USDC to the
    /// treasury. FAUCET_HASH is what `payload_hash` computes for it. Sent with the exact
    /// args `credit_cash` builds, as `expected_payload_hash`, the live testnet MPC signed it
    /// (NEAR tx Hs29dgyvvFYwBETB9EkGX2PaAbW3Jzuyd3jKtvXwqbP1, docs/SPIKE.md S26).
    const FAUCET_TX: &str = "0xb4a83dbfd2147f3ffb1143a3cb39b32c9f87672e955cbb6dff3192372b97e484";
    const FAUCET_HASH: &str = "32c88696112e135b4a8e08b2718ed82b0730c3eb01da07d5b9ca8ab81ece5309";

    fn faucet_log() -> LogArgs {
        LogArgs {
            block_hash: "0x8a50c1dd3825afc920ea387280ba631bbaf7a1107803da004466c8d181be0a43".into(),
            block_number: 56_635_495,
            transaction_index: 2,
            address: "0x036cbd53842c5426634e7929541ec2318f3dcf7e".into(),
            topics: vec![
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef".into(),
                "0x000000000000000000000000faec9cdc3ef75713b48f46057b98ba04885e3391".into(),
                "0x000000000000000000000000680bcf5a2e3c07118991adb3976d3df077ed96ee".into(),
            ],
            data: "0x0000000000000000000000000000000000000000000000000000000001312d00".into(),
        }
    }

    fn ctx(predecessor: &str) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("nvda.solidon.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .build());
    }

    /// A callback context with one promise result.
    fn callback(result: PromiseResult) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("nvda.solidon.testnet".parse().unwrap())
                .predecessor_account_id("nvda.solidon.testnet".parse().unwrap())
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![result],
        );
    }

    fn mpc_answer(hash: &str) -> PromiseResult {
        PromiseResult::Successful(
            format!(r#"{{"payload_hash":"{hash}","signature":{{"scheme":"Secp256k1"}}}}"#)
                .into_bytes(),
        )
    }

    fn meme() -> Meme {
        ctx("keeper.solidon.testnet");
        let mut m = crate::test_meme(accounts(1));
        m.treasury.address = Some(parse_address(TREASURY));
        m
    }

    /// NVDA at $180.00, Pyth style.
    fn price() -> PythPrice {
        PythPrice {
            price: I64(18_000_000_000),
            conf: U64(0),
            expo: -8,
            publish_time: 0,
        }
    }

    fn credit_faucet(m: &mut Meme) {
        m.credit_cash("base".into(), FAUCET_TX.into(), 0, faucet_log());
    }

    #[test]
    fn payload_hash_matches_the_live_mpc_for_s18() {
        let log = EvmLog::parse(S18_TX, 1, &s18_log());
        assert_eq!(
            hex_encode(&log.payload_hash(mpc_chain_index("Base").unwrap(), Finality::Latest)),
            S18_HASH
        );
        // Any other chain or finality is a different claim.
        assert_ne!(
            hex_encode(&log.payload_hash(6, Finality::Finalized)),
            S18_HASH
        );
    }

    #[test]
    fn payload_hash_of_the_faucet_transfer_to_the_treasury() {
        let log = EvmLog::parse(FAUCET_TX, 0, &faucet_log());
        assert_eq!(
            hex_encode(&log.payload_hash(6, Finality::Latest)),
            FAUCET_HASH
        );
        let usdc = parse_address("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
        assert_eq!(
            log.transfer_value(&usdc, &parse_address(TREASURY)),
            20 * USDC
        );
    }

    /// `Log { log_index }` is the BLOCK-WIDE log index, not the position in the receipt.
    /// Base Sepolia tx 0x5c4120e3…c187 has 2 logs; its USDC Transfer is at position 1 with
    /// block-wide logIndex 3. The live testnet MPC answered log_index 3 with this hash
    /// (NEAR tx Eq8XgmqvSCvKHUREhuN2Jzoi9mUSevFXPQUjpwuicmJw) and rejected log_index 1
    /// (NEAR tx 5nm74FxFUbg9AFd43LCj5SrYZkcMgcNzSyNw3GfoZedT). The keeper passes the
    /// receipt's `logIndex`, which is block-wide.
    #[test]
    fn log_index_is_block_wide() {
        let log = LogArgs {
            block_hash: "0x8dc6161b3918d0361ecf54dfdef65a1fe10284fea3d2f69d8749da13e0368b00".into(),
            block_number: 56_659_046,
            transaction_index: 4,
            address: "0x036cbd53842c5426634e7929541ec2318f3dcf7e".into(),
            topics: vec![
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef".into(),
                "0x00000000000000000000000088ba353d9f814c33d889ca634f7c7e0bcf2de580".into(),
                "0x000000000000000000000000a849bbad82f9edafdf9a5550cc874276138779d9".into(),
            ],
            data: "0x00000000000000000000000000000000000000000000000000000000000003e8".into(),
        };
        let tx = "0x5c4120e35b90ebc2c4ebad4f8d9cd94ac9f2f0240c37c56fa5c6d0e6a57ec187";
        assert_eq!(
            hex_encode(&EvmLog::parse(tx, 3, &log).payload_hash(6, Finality::Latest)),
            "48d297f3668d8222838c231bfeed2e3f5c49ab4055a1ee8569c5bee0a979addb"
        );
    }

    #[test]
    fn credit_cash_asks_the_mpc_for_exactly_this_log() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 25 * USDC;
        credit_faucet(&mut m);
        let receipts = get_created_receipts();
        let near_sdk::mock::MockAction::FunctionCallWeight {
            method_name,
            args,
            attached_deposit,
            ..
        } = &receipts[0].actions[0]
        else {
            panic!("expected a function call")
        };
        assert_eq!(receipts[0].receiver_id.as_str(), "v1.signer-prod.testnet");
        assert_eq!(method_name, b"verify_foreign_transaction");
        assert_eq!(attached_deposit.as_yoctonear(), 1);
        let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
        assert_eq!(
            args,
            json!({"request": {"request": {"Base": {"tx_id": &FAUCET_TX[2..],
                "extractors": [{"Log": {"log_index": 0}}], "finality": "Latest"}},
                "domain_id": 3, "payload_version": 1, "expected_payload_hash": FAUCET_HASH}})
        );
    }

    #[test]
    fn a_verified_log_moves_cash_from_in_transit_to_the_chain_capped() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 5 * USDC;
        credit_faucet(&mut m);
        callback(mpc_answer(FAUCET_HASH));
        let tx = hash32(FAUCET_TX);
        // 20 USDC arrived, but only 5 were sent: no free money.
        assert_eq!(
            m.on_cash_verified(0, tx, 0, U128(20 * USDC), FAUCET_HASH.into()),
            U128(5 * USDC)
        );
        let s = &m.treasury.chains[BASE];
        assert_eq!((s.in_transit, s.usdc), (0, 5 * USDC));
    }

    #[test]
    #[should_panic(expected = "Already credited")]
    fn a_log_is_credited_once() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 40 * USDC;
        credit_faucet(&mut m);
        callback(mpc_answer(FAUCET_HASH));
        m.on_cash_verified(0, hash32(FAUCET_TX), 0, U128(20 * USDC), FAUCET_HASH.into());
        assert_eq!(m.treasury.chains[BASE].in_transit, 20 * USDC);
        ctx("keeper.solidon.testnet");
        credit_faucet(&mut m);
    }

    #[test]
    fn a_failed_or_wrong_mpc_answer_credits_nothing_and_releases_the_log() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 25 * USDC;
        let tx = hash32(FAUCET_TX);
        for result in [
            PromiseResult::Failed,
            mpc_answer(S18_HASH),
            PromiseResult::Successful(b"{\"payload".to_vec()),
        ] {
            ctx("keeper.solidon.testnet");
            credit_faucet(&mut m);
            callback(result);
            assert_eq!(
                m.on_cash_verified(0, tx, 0, U128(20 * USDC), FAUCET_HASH.into()),
                U128(0)
            );
            assert_eq!(m.treasury.chains[BASE].in_transit, 25 * USDC);
            assert_eq!(m.treasury.chains[BASE].usdc, 0);
        }
    }

    #[test]
    #[should_panic(expected = "not to the treasury")]
    fn a_transfer_to_another_address_is_rejected() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 5 * USDC;
        m.credit_cash("base".into(), S18_TX.into(), 1, s18_log());
    }

    #[test]
    #[should_panic(expected = "not from the chain's USDC")]
    fn a_transfer_of_another_token_is_rejected() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 5 * USDC;
        let mut log = faucet_log();
        log.address = "0x8f13563130684478E617C1797308A081Cb2c2654".into();
        m.credit_cash("base".into(), FAUCET_TX.into(), 0, log);
    }

    #[test]
    #[should_panic(expected = "not an ERC-20 Transfer")]
    fn another_event_is_rejected() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 5 * USDC;
        let mut log = faucet_log();
        // Approval(owner, spender, value) has the same shape.
        log.topics[0] = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925".into();
        m.credit_cash("base".into(), FAUCET_TX.into(), 0, log);
    }

    #[test]
    #[should_panic(expected = "No cash in transit")]
    fn nothing_in_transit_means_nothing_to_credit() {
        let mut m = meme();
        credit_faucet(&mut m);
    }

    #[test]
    #[should_panic(expected = "reported by the relayer")]
    fn a_relayer_chain_takes_no_log_proof() {
        let mut m = meme();
        m.treasury.chains[ROBINHOOD].in_transit = 5 * USDC;
        let mut log = faucet_log();
        log.address = "0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F".into();
        m.credit_cash("robinhood".into(), FAUCET_TX.into(), 0, log);
    }

    #[test]
    fn the_relayer_reports_robinhood_cash_capped_and_once() {
        let mut m = meme();
        m.treasury.chains[ROBINHOOD].in_transit = 3 * USDC;
        ctx("keeper.solidon.testnet");
        // 5 USDC at 18 decimals arrived, 3 were in transit.
        let credited = m.report_cash(
            "robinhood".into(),
            FAUCET_TX.into(),
            U128(5 * 10u128.pow(18)),
        );
        assert_eq!(credited, U128(3 * USDC));
        let s = &m.treasury.chains[ROBINHOOD];
        assert_eq!((s.in_transit, s.usdc), (0, 3 * 10u128.pow(18)));
    }

    #[test]
    #[should_panic(expected = "Already credited")]
    fn a_relayer_report_is_credited_once() {
        let mut m = meme();
        m.treasury.chains[ROBINHOOD].in_transit = 10 * USDC;
        m.report_cash("robinhood".into(), FAUCET_TX.into(), U128(10u128.pow(18)));
        m.report_cash("robinhood".into(), FAUCET_TX.into(), U128(10u128.pow(18)));
    }

    #[test]
    #[should_panic(expected = "Only the relayer")]
    fn only_the_relayer_reports() {
        let mut m = meme();
        m.treasury.chains[ROBINHOOD].in_transit = 10 * USDC;
        ctx(accounts(2).as_str());
        m.report_cash("robinhood".into(), FAUCET_TX.into(), U128(10u128.pow(18)));
    }

    #[test]
    #[should_panic(expected = "proven by the MPC")]
    fn the_relayer_cannot_report_an_mpc_chain() {
        let mut m = meme();
        m.treasury.chains[BASE].in_transit = 10 * USDC;
        m.report_cash("base".into(), FAUCET_TX.into(), U128(USDC));
    }

    #[test]
    fn fund_chain_sends_only_cash_above_the_buffer_to_the_bridge() {
        let mut m = meme();
        // Assets 26 USDC (6 on NEAR, 20 on Base): buffer 5.2, so 0.8 may leave.
        m.treasury_usdc = 6 * USDC;
        m.treasury.chains[BASE].usdc = 20 * USDC;
        m.on_fund_price(ROBINHOOD as u32, Ok(Some(price())));
        assert_eq!(m.treasury_usdc, 5_200_000);
        assert_eq!(m.treasury.chains[ROBINHOOD].in_transit, 800_000);
        let receipts = get_created_receipts();
        assert_eq!(receipts[0].receiver_id.as_str(), "usdc.near");
        let near_sdk::mock::MockAction::FunctionCallWeight { args, .. } = &receipts[0].actions[0]
        else {
            panic!("expected ft_transfer")
        };
        let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
        assert_eq!(args["receiver_id"], "keeper.solidon.testnet");
        assert_eq!(args["amount"], "800000");
        assert_eq!(
            args["memo"],
            "solidon fund robinhood 0x680bcf5a2e3c07118991adb3976d3df077ed96ee"
        );

        // Lots of cash: capped at one swap (5 USDC). Stale price or no surplus: nothing.
        m.treasury_usdc = 1_000 * USDC;
        m.on_fund_price(BASE as u32, Ok(Some(price())));
        assert_eq!(m.treasury.chains[BASE].in_transit, 5 * USDC);
        let before = m.treasury_usdc;
        m.on_fund_price(BASE as u32, Ok(None));
        m.treasury_usdc = 0;
        m.on_fund_price(BASE as u32, Ok(Some(price())));
        assert_eq!(m.treasury.chains[BASE].in_transit, 5 * USDC);
        assert_eq!(before, 995 * USDC);
    }

    #[test]
    fn a_failed_transfer_returns_the_cash() {
        let mut m = meme();
        m.treasury_usdc = 100 * USDC;
        m.on_fund_price(BASE as u32, Ok(Some(price())));
        assert_eq!(m.treasury_usdc, 95 * USDC);
        callback(PromiseResult::Failed);
        assert_eq!(m.on_funded(BASE as u32, U128(5 * USDC)), U128(0));
        assert_eq!(m.treasury_usdc, 100 * USDC);
        assert_eq!(m.treasury.chains[BASE].in_transit, 0);
        // Success keeps it in transit.
        ctx("keeper.solidon.testnet");
        m.on_fund_price(BASE as u32, Ok(Some(price())));
        callback(PromiseResult::Successful(vec![]));
        assert_eq!(m.on_funded(BASE as u32, U128(5 * USDC)), U128(5 * USDC));
        assert_eq!(m.treasury.chains[BASE].in_transit, 5 * USDC);
    }

    #[test]
    fn nav_assets_are_unchanged_from_near_to_in_transit_to_the_chain() {
        let mut m = meme();
        m.treasury_usdc = 100 * USDC;
        let p = price();
        let assets = m.assets(&p);
        m.on_fund_price(BASE as u32, Ok(Some(p.clone())));
        m.on_fund_price(ROBINHOOD as u32, Ok(Some(p.clone())));
        assert_eq!(m.treasury_usdc, 90 * USDC);
        assert_eq!(m.assets(&p), assets, "in transit");
        ctx("keeper.solidon.testnet");
        credit_faucet(&mut m);
        callback(mpc_answer(FAUCET_HASH));
        m.on_cash_verified(0, hash32(FAUCET_TX), 0, U128(20 * USDC), FAUCET_HASH.into());
        ctx("keeper.solidon.testnet");
        m.report_cash("robinhood".into(), S18_TX.into(), U128(5 * 10u128.pow(18)));
        let base = &m.treasury.chains[BASE];
        let hood = &m.treasury.chains[ROBINHOOD];
        assert_eq!((base.in_transit, base.usdc), (0, 5 * USDC));
        assert_eq!((hood.in_transit, hood.usdc), (0, 5 * 10u128.pow(18)));
        assert_eq!(m.assets(&p), assets, "on the chains");
    }

    #[test]
    #[should_panic(expected = "foreign_chain must be an EVM chain the MPC verifies")]
    fn an_unknown_mpc_chain_is_rejected() {
        let mut chains = crate::test_chains();
        chains.evm[1].proof = CashProof::Mpc {
            foreign_chain: "Robinhood".into(),
            finality: Finality::Latest,
        };
        chains.assert_valid();
    }
}
