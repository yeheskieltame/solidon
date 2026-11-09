//! EVM treasury through NEAR Chain Signatures, on every EVM chain in the config.
//!
//! The treasury is one EVM address, the MPC key derived from this contract's account
//! and the path `evm-treasury`, so it is the same on Base and Robinhood Chain. Only
//! this contract can request signatures for it. The contract builds every transaction
//! itself, from locked config, and signs exactly two shapes per chain: `approve(router,
//! max)` on that chain's USDC, and a Uniswap v3 SwapRouter02 `exactInputSingle` from
//! USDC into the thesis stock with the treasury as recipient. Each chain has its own
//! nonce; signed transactions are stored by (chain, nonce) and anyone can broadcast them.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, Promise, PromiseError,
    PromiseOrValue,
};
use omni_transaction::evm::types::Signature;
use omni_transaction::evm::EVMTransaction;

use crate::cash::CashProof;
use crate::mnav::PythPrice;
use crate::pool::{emit, mul_div};
use crate::{Meme, MemeExt, StorageKey, Venue};

pub const PATH: &str = "evm-treasury";
/// secp256k1 domain of the MPC contract.
const DOMAIN_ID: u64 = 0;
const SLIPPAGE_BPS: u128 = 100;
/// Measured: approve 55k on Base Sepolia; first buys 213k-217k on both testnets.
const GAS_LIMIT_APPROVE: u128 = 100_000;
const GAS_LIMIT_SWAP: u128 = 400_000;
const GAS_MPC_VIEW: Gas = Gas::from_tgas(10);
const GAS_MPC_SIGN: Gas = Gas::from_tgas(50);
const GAS_CALLBACK: Gas = Gas::from_tgas(30);
/// Longer than the MPC contract's yield timeout (200 blocks): after this, a request
/// whose callback never cleared the slot (e.g. it panicked) can be cleared by anyone.
const STUCK_AFTER_BLOCKS: u64 = 300;

/// One EVM chain the treasury trades on, fixed by the factory.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct EvmChain {
    /// `base` or `robinhood`; venues refer to it.
    pub name: String,
    pub chain_id: u64,
    /// `0x` + 40 hex characters.
    pub usdc: String,
    pub usdc_decimals: u8,
    /// Uniswap v3 SwapRouter02.
    pub swap_router: String,
    /// Pool fee tier, e.g. 3000 = 0.3%.
    pub pool_fee: u32,
    /// EIP-1559 fee caps in wei.
    pub max_fee_per_gas: U128,
    pub max_priority_fee_per_gas: U128,
    /// Largest USDC amount (raw units of this chain's USDC) per swap. Fee + price impact
    /// must stay under the 1% slippage allowed against the oracle, so this is sized to
    /// the thinnest listed pool; larger balances are swapped over several calls.
    /// Also caps each `fund_chain` transfer.
    pub max_swap_usdc: U128,
    /// How cash arriving here is proven (MPC-verified log, or the relayer's report).
    pub proof: CashProof,
}

/// Treasury chains, fixed by the factory for every meme it launches.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ChainsConfig {
    /// MPC signer contract, `v1.signer` or `v1.signer-prod.testnet`.
    pub mpc: AccountId,
    /// NEAR account that receives cash bound for a treasury chain and delivers it there:
    /// the Intents/1Click leg on mainnet, a keeper account on testnet. What it delivers is
    /// only booked once proven, and never more than was sent.
    pub bridge: AccountId,
    /// Reports cash arriving on `CashProof::Relayer` chains (the MPC cannot read them).
    pub relayer: AccountId,
    pub evm: Vec<EvmChain>,
}

/// `None` unless `s` is `0x` + 40 hex characters.
fn try_parse_address(s: &str) -> Option<[u8; 20]> {
    let hex = s.strip_prefix("0x")?;
    if hex.len() != 40 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let mut out = [0u8; 20];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(out)
}

pub fn parse_address(s: &str) -> [u8; 20] {
    try_parse_address(s).unwrap_or_else(|| env::panic_str("address must be 0x + 40 hex characters"))
}

impl ChainsConfig {
    pub fn assert_valid(&self) {
        require!(!self.evm.is_empty(), "List at least one EVM chain");
        for (i, c) in self.evm.iter().enumerate() {
            require!(!c.name.is_empty(), "Chain name must not be empty");
            // Two entries for one chain id would keep two nonces for the same account.
            require!(
                self.evm[..i]
                    .iter()
                    .all(|d| d.name != c.name && d.chain_id != c.chain_id),
                "Chain names and chain ids must be unique"
            );
            parse_address(&c.usdc);
            parse_address(&c.swap_router);
            require!(
                (6..=18).contains(&c.usdc_decimals),
                "usdc_decimals must be 6 to 18"
            );
            require!(
                c.pool_fee > 0 && c.pool_fee < 1 << 24,
                "pool_fee must be a positive uint24"
            );
            require!(
                c.max_priority_fee_per_gas.0 > 0
                    && c.max_priority_fee_per_gas.0 <= c.max_fee_per_gas.0,
                "Fees must be positive, the priority fee at most max_fee_per_gas"
            );
            // At least one 6-decimal unit, so fund_chain can move cash.
            require!(
                c.max_swap_usdc.0 >= 10u128.pow(u32::from(c.usdc_decimals) - 6),
                "max_swap_usdc must be at least one USDC unit"
            );
            c.proof.assert_valid();
        }
    }

    pub fn index(&self, name: &str) -> Option<usize> {
        self.evm.iter().position(|c| c.name == name)
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum TxKind {
    Approve,
    Swap { usdc_in: U128, min_stock_out: U128 },
}

/// The one transaction waiting for its MPC signature.
#[near(serializers = [borsh])]
pub struct PendingTx {
    /// Block height of the signature request, for `clear_stuck_signature`.
    requested_at: u64,
    /// Index into `ChainsConfig::evm`.
    chain: u32,
    nonce: u64,
    to: [u8; 20],
    input: Vec<u8>,
    gas_limit: u128,
    kind: TxKind,
}

/// The treasury's ledger on one chain, in raw token units.
#[near(serializers = [borsh])]
#[derive(Default)]
pub struct ChainState {
    pub nonce: u64,
    pub approved: bool,
    pub usdc: u128,
    pub stock: u128,
    /// USDC sent from NEAR toward this chain and not yet proven to have arrived, at 6
    /// decimals. Counted in NAV; the cap on every credit to `usdc`.
    pub in_transit: u128,
}

#[near(serializers = [borsh])]
pub struct Treasury {
    pub address: Option<[u8; 20]>,
    /// One per `ChainsConfig::evm` entry, same order.
    pub chains: Vec<ChainState>,
    pending: Option<PendingTx>,
    /// (chain index, nonce) -> signed raw transaction.
    signed: LookupMap<(u32, u64), Vec<u8>>,
    /// (chain index, tx hash, log index) of every cash arrival credited or being verified.
    pub credited: LookupSet<(u32, [u8; 32], u64)>,
}

impl Treasury {
    pub fn new(chains: usize) -> Self {
        Self {
            address: None,
            chains: (0..chains).map(|_| ChainState::default()).collect(),
            pending: None,
            signed: LookupMap::new(StorageKey::SignedTxs),
            credited: LookupSet::new(StorageKey::CreditedCash),
        }
    }
}

// --- MPC interface (near/mpc: crates/near-mpc-contract-interface) ----------

#[near(serializers = [json])]
pub struct SignRequest {
    pub path: String,
    pub payload_v2: Payload,
    pub domain_id: u64,
}

#[near(serializers = [json])]
pub struct Payload {
    /// 32-byte hash, hex.
    #[serde(rename = "Ecdsa")]
    pub ecdsa: String,
}

#[near(serializers = [json])]
pub struct AffinePoint {
    pub affine_point: String,
}

#[near(serializers = [json])]
pub struct Scalar {
    pub scalar: String,
}

/// `SignatureResponse::Secp256k1`; the `scheme` tag is ignored.
#[near(serializers = [json])]
pub struct MpcSignature {
    pub big_r: AffinePoint,
    pub s: Scalar,
    pub recovery_id: u8,
}

#[allow(dead_code)] // only used through the generated `ext_mpc`
#[ext_contract(ext_mpc)]
pub trait Mpc {
    fn derived_public_key(&self, path: String, predecessor: AccountId, domain_id: u64) -> String;
    fn sign(&mut self, request: SignRequest) -> MpcSignature;
}

// --- Encoding -----------------------------------------------------------------

/// `None` on any malformed input; never panics (it parses MPC responses in a callback).
pub(crate) fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if !s.is_ascii() || !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

pub fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn word_address(a: &[u8; 20]) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[12..].copy_from_slice(a);
    w
}

fn word_u128(v: u128) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[16..].copy_from_slice(&v.to_be_bytes());
    w
}

/// `approve(address,uint256)` with the maximum allowance.
pub fn approve_calldata(spender: &[u8; 20]) -> Vec<u8> {
    let mut data = vec![0x09, 0x5e, 0xa7, 0xb3];
    data.extend(word_address(spender));
    data.extend([0xff; 32]);
    data
}

/// `exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))` on
/// Uniswap v3 SwapRouter02, no price limit. SwapRouter02 has no deadline field.
pub fn swap_calldata(
    token_in: &[u8; 20],
    token_out: &[u8; 20],
    fee: u32,
    recipient: &[u8; 20],
    amount_in: u128,
    min_out: u128,
) -> Vec<u8> {
    let mut data = vec![0x04, 0xe4, 0x5a, 0xaf];
    data.extend(word_address(token_in));
    data.extend(word_address(token_out));
    data.extend(word_u128(fee.into()));
    data.extend(word_address(recipient));
    data.extend(word_u128(amount_in));
    data.extend(word_u128(min_out));
    data.extend([0u8; 32]);
    data
}

/// Stock units (raw, `decimals`) worth `usdc_in` (raw, `usdc_decimals`) at oracle price
/// `p`, minus 1% slippage. `None` for an unusable price.
pub fn min_stock_out(
    usdc_in: u128,
    p: &PythPrice,
    decimals: u8,
    usdc_decimals: u8,
) -> Option<u128> {
    if p.price.0 <= 0 || !(-18..=0).contains(&p.expo) {
        return None;
    }
    // usd = usdc_in / 10^usdc_decimals; shares = usd / (price * 10^expo); raw = shares * 10^decimals
    let out = mul_div(
        usdc_in,
        10u128.pow(decimals as u32 + p.expo.unsigned_abs()),
        p.price.0 as u128 * 10u128.pow(usdc_decimals.into()),
    );
    Some(mul_div(out, 10_000 - SLIPPAGE_BPS, 10_000))
}

/// RLP integers must not carry leading zeros; omni-transaction appends r and s
/// as byte strings, so strip them here.
fn trim(bytes: &[u8]) -> Vec<u8> {
    let first = bytes.iter().position(|b| *b != 0).unwrap_or(bytes.len());
    bytes[first..].to_vec()
}

impl Meme {
    fn evm_tx(&self, p: &PendingTx) -> EVMTransaction {
        let c = &self.chains.evm[p.chain as usize];
        EVMTransaction {
            chain_id: c.chain_id,
            nonce: p.nonce,
            to: Some(p.to),
            value: 0,
            input: p.input.clone(),
            gas_limit: p.gas_limit,
            max_fee_per_gas: c.max_fee_per_gas.0,
            max_priority_fee_per_gas: c.max_priority_fee_per_gas.0,
            access_list: vec![],
        }
    }

    pub(crate) fn treasury_address(&self) -> [u8; 20] {
        self.treasury
            .address
            .unwrap_or_else(|| env::panic_str("Call init_treasury first"))
    }

    pub(crate) fn chain_index(&self, name: &str) -> usize {
        self.chains
            .index(name)
            .unwrap_or_else(|| env::panic_str("Unknown chain"))
    }

    /// The thesis stock's venue on chain `i`, if it trades there.
    pub(crate) fn venue(&self, i: usize) -> Option<&Venue> {
        let name = &self.chains.evm[i].name;
        self.stock.venues.iter().find(|v| &v.chain == name)
    }

    fn assert_can_sign(&self) {
        require!(
            self.treasury.pending.is_none(),
            "A signature is already in flight"
        );
    }

    /// Queues `tx` on chain `i` and asks the MPC contract to sign it. One request at a
    /// time across all chains.
    fn request_signature(
        &mut self,
        i: usize,
        to: [u8; 20],
        input: Vec<u8>,
        gas_limit: u128,
        kind: TxKind,
    ) -> Promise {
        let pending = PendingTx {
            requested_at: env::block_height(),
            chain: i as u32,
            nonce: self.treasury.chains[i].nonce,
            to,
            input,
            gas_limit,
            kind,
        };
        let hash = env::keccak256(self.evm_tx(&pending).build_for_signing());
        self.treasury.pending = Some(pending);
        let request = SignRequest {
            path: PATH.into(),
            payload_v2: Payload {
                ecdsa: hex_encode(&hash),
            },
            domain_id: DOMAIN_ID,
        };
        ext_mpc::ext(self.chains.mpc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_MPC_SIGN)
            .sign(request)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_signed(),
            )
    }

    /// Verifies the MPC signature against the treasury address and stores the
    /// signed transaction. Returns the raw transaction, or `None` if rejected.
    pub(crate) fn finish_signature(&mut self, sig: Option<MpcSignature>) -> Option<Vec<u8>> {
        let pending = self
            .treasury
            .pending
            .take()
            .expect("no pending transaction");
        let sig = sig?;
        let big_r = hex_decode(&sig.big_r.affine_point)?;
        let s = hex_decode(&sig.s.scalar)?;
        if big_r.len() != 33 || s.len() != 32 || sig.recovery_id > 1 {
            return None;
        }
        let tx = self.evm_tx(&pending);
        let hash = env::keccak256(tx.build_for_signing());
        let mut rs = [0u8; 64];
        rs[..32].copy_from_slice(&big_r[1..]);
        rs[32..].copy_from_slice(&s);
        // The signature must come from the treasury key, or nothing is stored.
        let pubkey = env::ecrecover(&hash, &rs, sig.recovery_id, true)?;
        if env::keccak256(pubkey)[12..] != self.treasury_address() {
            return None;
        }
        let raw = tx.build_with_signature(&Signature {
            v: sig.recovery_id.into(),
            r: trim(&rs[..32]),
            s: trim(&rs[32..]),
        });
        let state = &mut self.treasury.chains[pending.chain as usize];
        match &pending.kind {
            TxKind::Approve => state.approved = true,
            TxKind::Swap {
                usdc_in,
                min_stock_out,
            } => {
                // ponytail: the ledger assumes the swap lands and records minOut, the
                // conservative amount. Drift (a reverted swap) shows against the explorer
                // on the dashboard; an MPC-verified read of the stock received is the
                // follow-up (the cash side is proven in cash.rs).
                state.usdc -= usdc_in.0;
                state.stock += min_stock_out.0;
            }
        }
        state.nonce += 1;
        self.treasury
            .signed
            .insert((pending.chain, pending.nonce), raw.clone());
        emit(
            "evm_tx_signed",
            json!({"chain": self.chains.evm[pending.chain as usize].name, "nonce": pending.nonce,
                   "kind": pending.kind, "raw": format!("0x{}", hex_encode(&raw))}),
        );
        Some(raw)
    }
}

#[near(serializers = [json])]
pub struct ChainView {
    pub config: EvmChain,
    /// The thesis stock on this chain; `null` if it does not trade here.
    pub venue: Option<Venue>,
    /// Next nonce to sign.
    pub nonce: u64,
    pub approved: bool,
    /// USDC on this chain, raw units of its USDC.
    pub usdc: U128,
    /// Stock on this chain, raw units of the venue token.
    pub stock: U128,
    /// USDC sent toward this chain, not yet proven arrived, 6 decimals.
    pub in_transit: U128,
}

#[near(serializers = [json])]
pub struct TreasuryChainsView {
    /// The treasury's address on every EVM chain.
    pub address: Option<String>,
    pub mpc: AccountId,
    pub signing: bool,
    pub chains: Vec<ChainView>,
}

#[near]
impl Meme {
    /// Reads this contract's derived MPC key and stores its EVM address. Anyone, once.
    pub fn init_treasury(&mut self) -> Promise {
        require!(
            self.treasury.address.is_none(),
            "Treasury already initialised"
        );
        ext_mpc::ext(self.chains.mpc.clone())
            .with_static_gas(GAS_MPC_VIEW)
            .derived_public_key(PATH.into(), env::current_account_id(), DOMAIN_ID)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_treasury_key(),
            )
    }

    #[private]
    pub fn on_treasury_key(
        &mut self,
        #[callback_result] key: Result<String, PromiseError>,
    ) -> String {
        let key = key.unwrap_or_else(|_| env::panic_str("MPC derived_public_key failed"));
        let b58 = key
            .strip_prefix("secp256k1:")
            .unwrap_or_else(|| env::panic_str("expected a secp256k1 key"));
        let bytes = near_sdk::bs58::decode(b58)
            .into_vec()
            .unwrap_or_else(|_| env::panic_str("bad base58"));
        require!(bytes.len() == 64, "expected an uncompressed 64-byte key");
        let mut address = [0u8; 20];
        address.copy_from_slice(&env::keccak256(&bytes)[12..]);
        if self.treasury.address.is_none() {
            self.treasury.address = Some(address);
            emit(
                "treasury",
                json!({"evm_address": format!("0x{}", hex_encode(&address))}),
            );
        }
        format!("0x{}", hex_encode(&address))
    }

    /// Signs `approve(router, max)` on `chain`'s USDC for the treasury. Anyone, once per
    /// chain. Attach 300 TGas.
    pub fn approve_router(&mut self, chain: String) -> Promise {
        let i = self.chain_index(&chain);
        require!(!self.treasury.chains[i].approved, "Router already approved");
        self.assert_can_sign();
        self.treasury_address();
        let c = &self.chains.evm[i];
        let (usdc, data) = (
            parse_address(&c.usdc),
            approve_calldata(&parse_address(&c.swap_router)),
        );
        self.request_signature(i, usdc, data, GAS_LIMIT_APPROVE, TxKind::Approve)
    }

    /// Swaps up to `max_swap_usdc` of the treasury's USDC on `chain` into the thesis
    /// stock. Anyone. Attach 300 TGas.
    pub fn buy_stock(&mut self, chain: String) -> Promise {
        let i = self.chain_index(&chain);
        require!(
            self.venue(i).is_some(),
            "The stock does not trade on this chain"
        );
        require!(
            self.treasury.chains[i].approved,
            "Call approve_router first"
        );
        self.assert_can_sign();
        require!(self.treasury.chains[i].usdc > 0, "No USDC on this chain");
        self.read_price()
            .get_price_no_older_than(self.stock.price_id.clone(), self.params.oracle_max_age_secs)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(120))
                    .on_buy_price(i as u32),
            )
    }

    #[private]
    pub fn on_buy_price(
        &mut self,
        chain: u32,
        #[callback_result] price: Result<Option<PythPrice>, PromiseError>,
    ) -> PromiseOrValue<Option<String>> {
        let i = chain as usize;
        let c = &self.chains.evm[i];
        let venue = self.venue(i).expect("checked in buy_stock");
        let usdc_in = self.treasury.chains[i].usdc.min(c.max_swap_usdc.0);
        // A zero minOut would sign a swap with no slippage bound: skip instead.
        let Some(min_out) = price
            .ok()
            .flatten()
            .and_then(|p| min_stock_out(usdc_in, &p, venue.decimals, c.usdc_decimals))
            .filter(|out| *out > 0)
        else {
            emit(
                "buy_stock_skipped",
                json!({"chain": c.name, "reason": "no fresh price or amount too small"}),
            );
            return PromiseOrValue::Value(None);
        };
        self.assert_can_sign();
        let data = swap_calldata(
            &parse_address(&c.usdc),
            &parse_address(&venue.token),
            c.pool_fee,
            &self.treasury_address(),
            usdc_in,
            min_out,
        );
        let router = parse_address(&c.swap_router);
        let kind = TxKind::Swap {
            usdc_in: U128(usdc_in),
            min_stock_out: U128(min_out),
        };
        PromiseOrValue::Promise(self.request_signature(i, router, data, GAS_LIMIT_SWAP, kind))
    }

    /// Parses the MPC response without panicking: a panic here would roll back the
    /// cleared slot and, with no owner, block signing until `clear_stuck_signature`.
    #[private]
    pub fn on_signed(&mut self) -> Option<String> {
        // A signature response is ~250 bytes; the bound keeps a huge result from
        // exhausting the callback's gas.
        let sig = env::promise_result_checked(0, 1024)
            .ok()
            .and_then(|bytes| near_sdk::serde_json::from_slice::<MpcSignature>(&bytes).ok());
        let chain = self.treasury.pending.as_ref().map(|p| p.chain);
        let raw = self.finish_signature(sig);
        if raw.is_none() {
            let i = chain.expect("no pending transaction") as usize;
            emit(
                "evm_tx_rejected",
                json!({"chain": self.chains.evm[i].name, "nonce": self.treasury.chains[i].nonce}),
            );
        }
        raw.map(|r| format!("0x{}", hex_encode(&r)))
    }

    /// Frees a signature slot whose callback never completed. Anyone, after 300 blocks.
    /// The nonce is not consumed, so the transaction can be requested again.
    pub fn clear_stuck_signature(&mut self) {
        let pending = self
            .treasury
            .pending
            .as_ref()
            .unwrap_or_else(|| env::panic_str("Nothing pending"));
        require!(
            env::block_height() >= pending.requested_at + STUCK_AFTER_BLOCKS,
            "The signature request is not stuck yet"
        );
        emit(
            "signature_cleared",
            json!({"chain": self.chains.evm[pending.chain as usize].name, "nonce": pending.nonce}),
        );
        self.treasury.pending = None;
    }

    /// The signed raw transaction for `nonce` on `chain`, ready to broadcast.
    pub fn get_signed_tx(&self, chain: String, nonce: u64) -> Option<String> {
        let i = self.chains.index(&chain)? as u32;
        self.treasury
            .signed
            .get(&(i, nonce))
            .map(|r| format!("0x{}", hex_encode(r)))
    }

    pub fn get_treasury_chains(&self) -> TreasuryChainsView {
        TreasuryChainsView {
            address: self
                .treasury
                .address
                .map(|a| format!("0x{}", hex_encode(&a))),
            mpc: self.chains.mpc.clone(),
            signing: self.treasury.pending.is_some(),
            chains: self
                .chains
                .evm
                .iter()
                .zip(&self.treasury.chains)
                .enumerate()
                .map(|(i, (c, s))| ChainView {
                    config: c.clone(),
                    venue: self.venue(i).cloned(),
                    nonce: s.nonce,
                    approved: s.approved,
                    usdc: U128(s.usdc),
                    stock: U128(s.stock),
                    in_transit: U128(s.in_transit),
                })
                .collect(),
        }
    }
}

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;
    use crate::mnav::PythPrice;
    use k256::ecdsa::SigningKey;
    use near_sdk::json_types::{I64, U64};
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    // Anvil's public test key #0 (0xf39F…2266). Vectors below come from Foundry 1.7.1:
    // `cast calldata` and `cast mktx --chain <id> --nonce <n> --gas-limit <100000|400000>
    // --gas-price 100000000 --priority-gas-price <1000000 Base | 10000000 Robinhood>`,
    // with the testnet addresses of `crate::test_chains()` and synthetic NVDA as tokenOut.
    const KEY: &str = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const KEY_ADDRESS: &str = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    struct Vectors {
        chain: &'static str,
        swap_in: u128,
        min_out: u128,
        approve_calldata: &'static str,
        swap_calldata: &'static str,
        approve_raw: &'static str,
        swap_raw: &'static str,
    }

    /// Base Sepolia (84532): 5 USDC (6 dp) into NVDAc (8 dp) at $177.56.
    const BASE: Vectors = Vectors {
        chain: "base",
        swap_in: 5_000_000,
        min_out: 2_787_789,
        approve_calldata: "095ea7b300000000000000000000000094cc0aac535ccdb3c01d6787d6413c739ae12bc4ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        swap_calldata: "04e45aaf000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e0000000000000000000000008f13563130684478e617c1797308a081cb2c26540000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000004c4b4000000000000000000000000000000000000000000000000000000000002a89cd0000000000000000000000000000000000000000000000000000000000000000",
        approve_raw: "02f8b283014a3480830f42408405f5e100830186a094036cbd53842c5426634e7929541ec2318f3dcf7e80b844095ea7b300000000000000000000000094cc0aac535ccdb3c01d6787d6413c739ae12bc4ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc001a0d4ea33983b7de6ef4cc614088c79a6c4e6368fdbbcd232778372d748a25d231fa049975e32d0e0acd2f061e78181a24a5bc920dc99535e1cbae1f8c0a892bc520b",
        swap_raw: "02f9015283014a3401830f42408405f5e10083061a809494cc0aac535ccdb3c01d6787d6413c739ae12bc480b8e404e45aaf000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e0000000000000000000000008f13563130684478e617c1797308a081cb2c26540000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000004c4b4000000000000000000000000000000000000000000000000000000000002a89cd0000000000000000000000000000000000000000000000000000000000000000c080a0fa31519c2e2ea0ac013da97c377d85a0773153944d4babd35b25d8db72278415a032a5afbcc2a8a36c3c2aeb92609ce16d0918be7e82b31e8691497d6ac182ccac",
    };

    /// Robinhood Chain testnet (46630): 5 USDC (18 dp) into NVDA (18 dp) at $177.56.
    const ROBINHOOD: Vectors = Vectors {
        chain: "robinhood",
        swap_in: 5_000_000_000_000_000_000,
        min_out: 27_877_900_428_024_329,
        approve_calldata: "095ea7b30000000000000000000000003ce954107b1a675826b33bf23060dd655e3758feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        swap_calldata: "04e45aaf000000000000000000000000bf4479c07dc6fdc6daa764a0cca06969e894275f00000000000000000000000082289af84b9a0faf598a4d2052e16c8d1619f7f40000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000004563918244f4000000000000000000000000000000000000000000000000000000630acd80189a090000000000000000000000000000000000000000000000000000000000000000",
        approve_raw: "02f8b182b62680839896808405f5e100830186a094bf4479c07dc6fdc6daa764a0cca06969e894275f80b844095ea7b30000000000000000000000003ce954107b1a675826b33bf23060dd655e3758feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc080a0da5181372fd1e37657984232c2d7ce904c07c08e906abd2ab62cb28b7a7e5687a05ef9302857da364b36755fe4b00828e1adf2780f66336b084316dd716a61ba00",
        swap_raw: "02f9015182b62601839896808405f5e10083061a80943ce954107b1a675826b33bf23060dd655e3758fe80b8e404e45aaf000000000000000000000000bf4479c07dc6fdc6daa764a0cca06969e894275f00000000000000000000000082289af84b9a0faf598a4d2052e16c8d1619f7f40000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000004563918244f4000000000000000000000000000000000000000000000000000000630acd80189a090000000000000000000000000000000000000000000000000000000000000000c001a0fd5823d2f483bdf707899b245c8d6853539c22e4709d997af7b046c1f21ec657a055814f8ce12c2f001a683e42a23455e2eda7c7827019c15fd64fa799cb90586c",
    };

    /// NVDA at $177.56, Pyth style (expo -8).
    fn nvda_price() -> PythPrice {
        PythPrice {
            price: I64(17_756_000_000),
            conf: U64(0),
            expo: -8,
            publish_time: 0,
        }
    }

    fn ctx() {
        testing_env!(VMContextBuilder::new()
            .current_account_id("elondoge.solidon.testnet".parse().unwrap())
            .predecessor_account_id("elondoge.solidon.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
    }

    fn meme_with_treasury(key: &str) -> Meme {
        ctx();
        let mut m = crate::test_meme(accounts(1));
        let address = k256::ecdsa::VerifyingKey::from(&signing_key(key)).to_encoded_point(false);
        let mut a = [0u8; 20];
        a.copy_from_slice(&env::keccak256(&address.as_bytes()[1..])[12..]);
        m.treasury.address = Some(a);
        m
    }

    fn signing_key(hex: &str) -> SigningKey {
        SigningKey::from_slice(&hex_decode(hex).unwrap()).unwrap()
    }

    /// What the MPC contract would return, produced with a local key.
    fn mpc_sign(key: &str, m: &Meme) -> MpcSignature {
        let pending = m.treasury.pending.as_ref().unwrap();
        let hash = env::keccak256(m.evm_tx(pending).build_for_signing());
        let (sig, recid) = signing_key(key).sign_prehash_recoverable(&hash).unwrap();
        let rs = sig.to_bytes();
        MpcSignature {
            big_r: AffinePoint {
                affine_point: format!(
                    "{:02x}{}",
                    2 + recid.is_y_odd() as u8,
                    hex_encode(&rs[..32])
                ),
            },
            s: Scalar {
                scalar: hex_encode(&rs[32..]),
            },
            recovery_id: recid.to_byte(),
        }
    }

    fn sign(m: &mut Meme) -> Option<Vec<u8>> {
        let sig = mpc_sign(KEY, m);
        m.finish_signature(Some(sig))
    }

    #[test]
    fn calldata_matches_foundry() {
        ctx();
        let m = crate::test_meme(accounts(1));
        for v in [BASE, ROBINHOOD] {
            let i = m.chain_index(v.chain);
            let c = &m.chains.evm[i];
            assert_eq!(
                hex_encode(&approve_calldata(&parse_address(&c.swap_router))),
                v.approve_calldata
            );
            let data = swap_calldata(
                &parse_address(&c.usdc),
                &parse_address(&m.venue(i).unwrap().token),
                c.pool_fee,
                &parse_address(KEY_ADDRESS),
                v.swap_in,
                v.min_out,
            );
            assert_eq!(hex_encode(&data), v.swap_calldata);
        }
    }

    /// `approve_router`, then `buy_stock` and its callback with a fresh price, on one
    /// chain: both raw transactions equal Foundry's, and the ledger moves by minOut.
    fn approve_and_buy_on(m: &mut Meme, v: &Vectors) {
        let i = m.chain_index(v.chain);
        m.approve_router(v.chain.into());
        let raw = sign(m).expect("approve accepted");
        assert_eq!(hex_encode(&raw), v.approve_raw);
        assert!(m.treasury.chains[i].approved);
        assert_eq!(
            m.get_signed_tx(v.chain.into(), 0),
            Some(format!("0x{}", v.approve_raw))
        );

        // 1.5 swaps' worth of USDC: one swap is capped at max_swap_usdc.
        let max = m.chains.evm[i].max_swap_usdc.0;
        assert_eq!(max, v.swap_in);
        m.treasury.chains[i].usdc = max + max / 2;
        m.buy_stock(v.chain.into());
        m.on_buy_price(i as u32, Ok(Some(nvda_price())));
        let raw = sign(m).expect("swap accepted");
        assert_eq!(hex_encode(&raw), v.swap_raw);
        let s = &m.treasury.chains[i];
        assert_eq!((s.usdc, s.stock, s.nonce), (max / 2, v.min_out, 2));
        assert_eq!(
            m.get_signed_tx(v.chain.into(), 1),
            Some(format!("0x{}", v.swap_raw))
        );
    }

    #[test]
    fn base_transactions_match_foundry_byte_for_byte() {
        let mut m = meme_with_treasury(KEY);
        approve_and_buy_on(&mut m, &BASE);
        let other = &m.treasury.chains[m.chain_index("robinhood")];
        assert_eq!((other.nonce, other.approved, other.stock), (0, false, 0));
    }

    #[test]
    fn robinhood_transactions_match_foundry_byte_for_byte() {
        let mut m = meme_with_treasury(KEY);
        approve_and_buy_on(&mut m, &ROBINHOOD);
    }

    #[test]
    fn each_chain_keeps_its_own_nonce_and_ledger() {
        let mut m = meme_with_treasury(KEY);
        approve_and_buy_on(&mut m, &BASE);
        // Robinhood starts at nonce 0 although Base already signed 0 and 1.
        approve_and_buy_on(&mut m, &ROBINHOOD);
        assert_eq!(
            m.get_signed_tx("base".into(), 1),
            Some(format!("0x{}", BASE.swap_raw))
        );
        assert_eq!(m.get_signed_tx("solana".into(), 0), None);
        let view = m.get_treasury_chains();
        assert_eq!(view.chains[0].stock, U128(BASE.min_out));
        assert_eq!(view.chains[1].stock, U128(ROBINHOOD.min_out));
        assert_eq!(view.chains[1].venue.as_ref().unwrap().decimals, 18);
        assert!(!view.signing);
    }

    #[test]
    fn a_stale_price_or_dust_skips_the_swap() {
        let mut m = meme_with_treasury(KEY);
        m.treasury.chains[0].approved = true;
        m.treasury.chains[0].usdc = 1; // worth less than one raw unit of stock
        let skipped = |r: PromiseOrValue<Option<String>>| matches!(r, PromiseOrValue::Value(None));
        assert!(skipped(m.on_buy_price(0, Ok(None))));
        assert!(skipped(m.on_buy_price(0, Ok(Some(nvda_price())))));
        assert!(m.treasury.pending.is_none());
    }

    #[test]
    #[should_panic(expected = "Unknown chain")]
    fn an_unknown_chain_is_rejected() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router("bsc".into());
    }

    #[test]
    #[should_panic(expected = "does not trade on this chain")]
    fn buy_stock_needs_a_venue_on_the_chain() {
        let mut m = meme_with_treasury(KEY);
        m.stock.venues.retain(|v| v.chain == "base");
        m.treasury.chains[1].approved = true;
        m.treasury.chains[1].usdc = 1;
        m.buy_stock("robinhood".into());
    }

    #[test]
    fn a_signature_from_another_key_is_rejected() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router("base".into());
        let other = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1
        assert!(m.finish_signature(Some(mpc_sign(other, &m))).is_none());
        assert!(!m.treasury.chains[0].approved);
        assert_eq!(
            m.treasury.chains[0].nonce, 0,
            "nonce not consumed, the request can be retried"
        );
        assert!(m.treasury.pending.is_none());
        assert_eq!(m.get_signed_tx("base".into(), 0), None);
    }

    #[test]
    fn a_failed_mpc_call_frees_the_slot() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router("base".into());
        assert!(m.finish_signature(None).is_none());
        assert_eq!(m.treasury.chains[0].nonce, 0);
        m.approve_router("base".into()); // can retry
    }

    #[test]
    #[should_panic(expected = "A signature is already in flight")]
    fn one_signature_in_flight_across_chains() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router("base".into());
        m.approve_router("robinhood".into());
    }

    #[test]
    fn treasury_address_from_the_real_mpc_key() {
        // v1.signer-prod.testnet derived_public_key(path "evm-treasury", predecessor
        // "creator.solidon.testnet", domain 0) at testnet block 276,958,388. The address is
        // the S23 treasury whose MPC-signed transactions were mined on both testnets.
        testing_env!(VMContextBuilder::new()
            .current_account_id("creator.solidon.testnet".parse().unwrap())
            .build());
        let mut m = crate::test_meme(accounts(1));
        let key = "secp256k1:52uAZWBcxtUHmCKFPfXZwjAtngTcY35g1GxukmpbgLUPVm7kyt5Nw2j1zdEmZHwyPjS4Dfs7uLd9sAEAz34RuXWQ";
        let address = m.on_treasury_key(Ok(key.into()));
        assert_eq!(address, "0x680bcf5a2e3c07118991adb3976d3df077ed96ee");
        assert_eq!(
            m.get_treasury_chains().address.as_deref(),
            Some(address.as_str())
        );
    }

    #[test]
    fn min_out_is_oracle_value_minus_one_percent() {
        let p = PythPrice {
            price: I64(13_532_000_000),
            conf: U64(0),
            expo: -8,
            publish_time: 0,
        };
        // 1,000 USDC / $135.32 = 7.38989 shares, minus 1%, whatever the USDC decimals.
        let out = min_stock_out(1_000 * 10u128.pow(18), &p, 18, 18).unwrap();
        assert_eq!(out, 7_315_991_723_322_494_826);
        assert_eq!(min_stock_out(1_000 * 10u128.pow(6), &p, 18, 6), Some(out));
        assert_eq!(
            min_stock_out(1_000 * 10u128.pow(6), &p, 8, 6),
            Some(731_599_171)
        );
        let bad = PythPrice { price: I64(0), ..p };
        assert_eq!(min_stock_out(1, &bad, 18, 18), None);
    }

    #[test]
    fn malformed_mpc_responses_are_rejected_without_panicking() {
        let mut m = meme_with_treasury(KEY);
        for (r, s) in [("zz", "00"), ("02abc", "00"), ("é", "00"), ("", "")] {
            m.approve_router("base".into());
            let sig = MpcSignature {
                big_r: AffinePoint {
                    affine_point: r.into(),
                },
                s: Scalar { scalar: s.into() },
                recovery_id: 0,
            };
            assert!(m.finish_signature(Some(sig)).is_none());
            assert!(m.treasury.pending.is_none());
        }
        assert_eq!(m.treasury.chains[0].nonce, 0);
    }

    #[test]
    fn a_stuck_slot_can_be_cleared_after_300_blocks() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router("robinhood".into()); // requested at block 0
        testing_env!(VMContextBuilder::new()
            .current_account_id("elondoge.solidon.testnet".parse().unwrap())
            .block_height(300)
            .build());
        m.clear_stuck_signature();
        assert!(m.treasury.pending.is_none());
        assert_eq!(m.treasury.chains[1].nonce, 0);
    }

    #[test]
    #[should_panic(expected = "not stuck yet")]
    fn a_fresh_slot_cannot_be_cleared() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router("base".into());
        m.clear_stuck_signature();
    }

    #[test]
    fn trims_leading_zeros_for_rlp() {
        assert_eq!(trim(&[0, 0, 7, 0]), vec![7, 0]);
        assert_eq!(trim(&[0, 0]), Vec::<u8>::new());
    }

    #[test]
    fn addresses_must_be_strict_hex() {
        assert!(try_parse_address(KEY_ADDRESS).is_some());
        for bad in [
            "f39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "0x+39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb9226",
            "0xé9Fd6e51aad88F6F4ce6aB8827279cffFb9226",
        ] {
            assert!(try_parse_address(bad).is_none(), "{bad}");
        }
    }

    #[test]
    #[should_panic(expected = "Chain names and chain ids must be unique")]
    fn two_entries_for_one_chain_id_are_rejected() {
        let mut chains = crate::test_chains();
        chains.evm[1].chain_id = chains.evm[0].chain_id;
        chains.assert_valid();
    }

    #[test]
    #[should_panic(expected = "priority fee at most max_fee_per_gas")]
    fn a_priority_fee_above_the_max_fee_is_rejected() {
        let mut chains = crate::test_chains();
        chains.evm[0].max_priority_fee_per_gas = U128(chains.evm[0].max_fee_per_gas.0 + 1);
        chains.assert_valid();
    }
}
