//! BSC treasury through NEAR Chain Signatures.
//!
//! The treasury is the EVM address of the MPC key derived from this contract's
//! account and the path `bsc-treasury`. Only this contract can request signatures
//! for it. The contract builds every transaction itself, from locked config, and
//! signs exactly two shapes: `approve(router, max)` on USDT, and a PancakeSwap v3
//! `exactInputSingle` from USDT into the thesis stock with the treasury as
//! recipient. Signed transactions are stored by nonce; anyone can broadcast them.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, Promise, PromiseError,
    PromiseOrValue,
};
use omni_transaction::evm::types::Signature;
use omni_transaction::evm::EVMTransaction;

use crate::mnav::PythPrice;
use crate::pool::{emit, mul_div, now_secs};
use crate::{Meme, MemeExt, StorageKey};

pub const PATH: &str = "bsc-treasury";
/// secp256k1 domain of the MPC contract.
const DOMAIN_ID: u64 = 0;
/// BSC USDT (BSC-USD) and the mock both use 18 decimals.
pub const USDT_DECIMALS: u32 = 18;
const SLIPPAGE_BPS: u128 = 100;
const SWAP_DEADLINE_SECS: u64 = 24 * 3600;
const GAS_LIMIT_APPROVE: u128 = 100_000;
const GAS_LIMIT_SWAP: u128 = 300_000;
const GAS_MPC_VIEW: Gas = Gas::from_tgas(10);
const GAS_MPC_SIGN: Gas = Gas::from_tgas(50);
const GAS_CALLBACK: Gas = Gas::from_tgas(30);
/// Longer than the MPC contract's yield timeout (200 blocks): after this, a request
/// whose callback never cleared the slot (e.g. it panicked) can be cleared by anyone.
const STUCK_AFTER_BLOCKS: u64 = 300;

/// BSC environment, fixed by the factory for every meme it launches.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct BscConfig {
    pub chain_id: u64,
    /// `0x` + 40 hex characters.
    pub usdt: String,
    /// PancakeSwap v3 SwapRouter.
    pub swap_router: String,
    /// Pool fee tier, e.g. 2500 = 0.25%.
    pub pool_fee: u32,
    /// MPC signer contract, `v1.signer` or `v1.signer-prod.testnet`.
    pub mpc: AccountId,
    /// EIP-1559 fees in wei. BSC has no base fee, so this is the gas price paid.
    pub max_fee_per_gas: U128,
    /// Largest USDT amount (18 decimals) per swap. Fee + price impact must stay under the
    /// 1% slippage allowed against Pyth, so this is sized to the thinnest listed pool;
    /// larger balances are swapped over several calls.
    pub max_swap_usdt: U128,
}

pub fn parse_address(s: &str) -> [u8; 20] {
    let hex = s
        .strip_prefix("0x")
        .unwrap_or_else(|| env::panic_str("address needs 0x"));
    let mut out = [0u8; 20];
    require!(hex.len() == 40, "address must be 20 bytes");
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16)
            .unwrap_or_else(|_| env::panic_str("address must be hex"));
    }
    out
}

impl BscConfig {
    pub fn assert_valid(&self) {
        parse_address(&self.usdt);
        parse_address(&self.swap_router);
        require!(
            self.max_fee_per_gas.0 > 0,
            "max_fee_per_gas must be positive"
        );
        require!(self.max_swap_usdt.0 > 0, "max_swap_usdt must be positive");
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum TxKind {
    Approve,
    Swap { usdt_in: U128, min_stock_out: U128 },
}

/// The one transaction waiting for its MPC signature.
#[near(serializers = [borsh])]
pub struct PendingTx {
    /// Block height of the signature request, for `clear_stuck_signature`.
    requested_at: u64,
    nonce: u64,
    to: [u8; 20],
    input: Vec<u8>,
    gas_limit: u128,
    kind: TxKind,
}

#[near(serializers = [borsh])]
pub struct Treasury {
    pub address: Option<[u8; 20]>,
    pub nonce: u64,
    pub approved: bool,
    /// USDT on the BSC treasury, ledger in raw units (18 decimals).
    pub bsc_usdt: u128,
    pending: Option<PendingTx>,
    signed: LookupMap<u64, Vec<u8>>,
}

impl Treasury {
    pub fn new() -> Self {
        Self {
            address: None,
            nonce: 0,
            approved: false,
            bsc_usdt: 0,
            pending: None,
            signed: LookupMap::new(StorageKey::SignedTxs),
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
fn hex_decode(s: &str) -> Option<Vec<u8>> {
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

/// `exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))`
/// on the PancakeSwap v3 SwapRouter, no price limit.
#[allow(clippy::too_many_arguments)]
pub fn swap_calldata(
    token_in: &[u8; 20],
    token_out: &[u8; 20],
    fee: u32,
    recipient: &[u8; 20],
    deadline: u64,
    amount_in: u128,
    min_out: u128,
) -> Vec<u8> {
    let mut data = vec![0x41, 0x4b, 0xf3, 0x89];
    data.extend(word_address(token_in));
    data.extend(word_address(token_out));
    data.extend(word_u128(fee.into()));
    data.extend(word_address(recipient));
    data.extend(word_u128(deadline.into()));
    data.extend(word_u128(amount_in));
    data.extend(word_u128(min_out));
    data.extend([0u8; 32]);
    data
}

/// Stock units (raw, `decimals`) worth `usdt_in` (18 decimals) at Pyth price `p`,
/// minus 1% slippage. `None` for an unusable price.
pub fn min_stock_out(usdt_in: u128, p: &PythPrice, decimals: u8) -> Option<u128> {
    if p.price.0 <= 0 || !(-18..=0).contains(&p.expo) {
        return None;
    }
    // usd = usdt_in / 10^18; shares = usd / (price * 10^expo); raw = shares * 10^decimals
    let out = mul_div(
        usdt_in,
        10u128.pow(decimals as u32 + p.expo.unsigned_abs()),
        p.price.0 as u128 * 10u128.pow(USDT_DECIMALS),
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
        EVMTransaction {
            chain_id: self.bsc.chain_id,
            nonce: p.nonce,
            to: Some(p.to),
            value: 0,
            input: p.input.clone(),
            gas_limit: p.gas_limit,
            max_fee_per_gas: self.bsc.max_fee_per_gas.0,
            max_priority_fee_per_gas: self.bsc.max_fee_per_gas.0,
            access_list: vec![],
        }
    }

    fn treasury_address(&self) -> [u8; 20] {
        self.treasury
            .address
            .unwrap_or_else(|| env::panic_str("Call init_treasury first"))
    }

    /// Queues `tx` and asks the MPC contract to sign it. One request at a time.
    fn request_signature(
        &mut self,
        to: [u8; 20],
        input: Vec<u8>,
        gas_limit: u128,
        kind: TxKind,
    ) -> Promise {
        let pending = PendingTx {
            requested_at: env::block_height(),
            nonce: self.treasury.nonce,
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
        ext_mpc::ext(self.bsc.mpc.clone())
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
        match &pending.kind {
            TxKind::Approve => self.treasury.approved = true,
            TxKind::Swap {
                usdt_in,
                min_stock_out,
            } => {
                // ponytail: the ledger assumes the swap lands and records minOut, the
                // conservative amount. Drift (a reverted swap) shows against BscScan
                // on the dashboard; an attested balance read (OutLayer TEE) fixes it.
                self.treasury.bsc_usdt -= usdt_in.0;
                self.engine.stock_units += min_stock_out.0;
            }
        }
        self.treasury.signed.insert(pending.nonce, raw.clone());
        self.treasury.nonce += 1;
        emit(
            "bsc_tx_signed",
            json!({"nonce": pending.nonce, "kind": pending.kind, "raw": format!("0x{}", hex_encode(&raw))}),
        );
        Some(raw)
    }
}

#[near(serializers = [json])]
pub struct TreasuryBscView {
    pub address: Option<String>,
    pub nonce: u64,
    pub approved: bool,
    pub bsc_usdt: U128,
    pub signing: bool,
    pub config: BscConfig,
}

#[near]
impl Meme {
    /// Reads this contract's derived MPC key and stores its EVM address. Anyone, once.
    pub fn init_treasury(&mut self) -> Promise {
        require!(
            self.treasury.address.is_none(),
            "Treasury already initialised"
        );
        ext_mpc::ext(self.bsc.mpc.clone())
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
                json!({"bsc_address": format!("0x{}", hex_encode(&address))}),
            );
        }
        format!("0x{}", hex_encode(&address))
    }

    /// Signs `approve(router, max)` on USDT for the treasury. Anyone, once. Attach 300 TGas.
    pub fn approve_router(&mut self) -> Promise {
        require!(!self.treasury.approved, "Router already approved");
        require!(
            self.treasury.pending.is_none(),
            "A signature is already in flight"
        );
        self.treasury_address();
        let data = approve_calldata(&parse_address(&self.bsc.swap_router));
        self.request_signature(
            parse_address(&self.bsc.usdt),
            data,
            GAS_LIMIT_APPROVE,
            TxKind::Approve,
        )
    }

    /// Swaps up to `max_swap_usdt` of the BSC treasury's USDT into the thesis stock.
    /// Anyone. Attach 300 TGas.
    pub fn buy_stock(&mut self) -> Promise {
        require!(self.treasury.approved, "Call approve_router first");
        require!(
            self.treasury.pending.is_none(),
            "A signature is already in flight"
        );
        require!(self.treasury.bsc_usdt > 0, "No USDT on the BSC treasury");
        self.read_price()
            .get_price_no_older_than(self.stock.price_id.clone(), self.params.oracle_max_age_secs)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(120))
                    .on_buy_price(),
            )
    }

    #[private]
    pub fn on_buy_price(
        &mut self,
        #[callback_result] price: Result<Option<PythPrice>, PromiseError>,
    ) -> PromiseOrValue<Option<String>> {
        let usdt_in = self.treasury.bsc_usdt.min(self.bsc.max_swap_usdt.0);
        let Some(min_out) = price
            .ok()
            .flatten()
            .and_then(|p| min_stock_out(usdt_in, &p, self.stock.decimals))
        else {
            emit("buy_stock_skipped", json!({"reason": "no fresh price"}));
            return PromiseOrValue::Value(None);
        };
        require!(
            self.treasury.pending.is_none(),
            "A signature is already in flight"
        );
        let data = swap_calldata(
            &parse_address(&self.bsc.usdt),
            &parse_address(&self.stock.bsc_token),
            self.bsc.pool_fee,
            &self.treasury_address(),
            now_secs() + SWAP_DEADLINE_SECS,
            usdt_in,
            min_out,
        );
        let kind = TxKind::Swap {
            usdt_in: U128(usdt_in),
            min_stock_out: U128(min_out),
        };
        PromiseOrValue::Promise(self.request_signature(
            parse_address(&self.bsc.swap_router),
            data,
            GAS_LIMIT_SWAP,
            kind,
        ))
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
        let raw = self.finish_signature(sig);
        if raw.is_none() {
            emit("bsc_tx_rejected", json!({"nonce": self.treasury.nonce}));
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
        emit("bsc_signature_cleared", json!({"nonce": pending.nonce}));
        self.treasury.pending = None;
    }

    /// The signed raw transaction for `nonce`, ready to broadcast to BSC.
    pub fn get_signed_tx(&self, nonce: u64) -> Option<String> {
        self.treasury
            .signed
            .get(&nonce)
            .map(|r| format!("0x{}", hex_encode(r)))
    }

    pub fn get_bsc_treasury(&self) -> TreasuryBscView {
        TreasuryBscView {
            address: self
                .treasury
                .address
                .map(|a| format!("0x{}", hex_encode(&a))),
            nonce: self.treasury.nonce,
            approved: self.treasury.approved,
            bsc_usdt: U128(self.treasury.bsc_usdt),
            signing: self.treasury.pending.is_some(),
            config: self.bsc.clone(),
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

    // Anvil's public test key #0 (0xf39F…2266). Vectors below come from Foundry:
    // `cast calldata` and `cast mktx --chain 97 --gas-price 1gwei --priority-gas-price 1gwei`.
    const KEY: &str = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const KEY_ADDRESS: &str = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const ROUTER: &str = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
    const USDT: &str = "0x8f13563130684478E617C1797308A081Cb2c2654";
    const SPCX: &str = "0x730B750E15F08B9596C8c2bc3240856c4714e08b";
    const APPROVE_CALLDATA: &str = "095ea7b30000000000000000000000001b81d678ffb9c0263b24a97847620c99d213eb14ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const SWAP_CALLDATA: &str = "414bf3890000000000000000000000008f13563130684478e617c1797308a081cb2c2654000000000000000000000000730b750e15f08b9596c8c2bc3240856c4714e08b00000000000000000000000000000000000000000000000000000000000009c4000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000006af2d86000000000000000000000000000000000000000000000003635c9adc5dea000000000000000000000000000000000000000000000000000006587a73cf8c200000000000000000000000000000000000000000000000000000000000000000000";
    const APPROVE_RAW: &str = "02f8b06180843b9aca00843b9aca00830186a0948f13563130684478e617c1797308a081cb2c265480b844095ea7b30000000000000000000000001b81d678ffb9c0263b24a97847620c99d213eb14ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc080a09ecfdd36db81a600f35b8b391ffea5de7d629d06704291a312ec51afeeec48d1a049b848d6ca9a64795c0d487f59e46c627cdf1212a2ba5f99212136e2bf1f4165";
    const SWAP_RAW: &str = "02f901716101843b9aca00843b9aca00830493e0941b81d678ffb9c0263b24a97847620c99d213eb1480b90104414bf3890000000000000000000000008f13563130684478e617c1797308a081cb2c2654000000000000000000000000730b750e15f08b9596c8c2bc3240856c4714e08b00000000000000000000000000000000000000000000000000000000000009c4000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000006af2d86000000000000000000000000000000000000000000000003635c9adc5dea000000000000000000000000000000000000000000000000000006587a73cf8c200000000000000000000000000000000000000000000000000000000000000000000c080a096b3f4e4ba65f3388f77646b92f0e2cc4945c939c717a818c757aa84f9c519cba0315dbed40275232675c515c450dd8c618f8340f6b9d4a6d71a6ab68fb4c60106";

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

    #[test]
    fn calldata_matches_foundry() {
        assert_eq!(
            hex_encode(&approve_calldata(&parse_address(ROUTER))),
            APPROVE_CALLDATA
        );
        let data = swap_calldata(
            &parse_address(USDT),
            &parse_address(SPCX),
            2500,
            &parse_address(KEY_ADDRESS),
            1_794_300_000,
            1_000 * 10u128.pow(18),
            7_316_000_000_000_000_000,
        );
        assert_eq!(hex_encode(&data), SWAP_CALLDATA);
    }

    #[test]
    fn signed_transactions_match_foundry_byte_for_byte() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router();
        let sig = mpc_sign(KEY, &m);
        let raw = m.finish_signature(Some(sig)).expect("approve accepted");
        assert_eq!(hex_encode(&raw), APPROVE_RAW);
        assert!(m.treasury.approved);
        assert_eq!(m.treasury.nonce, 1);
        assert_eq!(m.get_signed_tx(0), Some(format!("0x{APPROVE_RAW}")));

        // Swap at nonce 1 with the vector's fields; the ledger moves by minOut.
        m.treasury.bsc_usdt = 1_000 * 10u128.pow(18);
        let usdt_in = 1_000 * 10u128.pow(18);
        let min_out = 7_316_000_000_000_000_000;
        let data = swap_calldata(
            &parse_address(USDT),
            &parse_address(SPCX),
            2500,
            &parse_address(KEY_ADDRESS),
            1_794_300_000,
            usdt_in,
            min_out,
        );
        m.request_signature(
            parse_address(ROUTER),
            data,
            GAS_LIMIT_SWAP,
            TxKind::Swap {
                usdt_in: U128(usdt_in),
                min_stock_out: U128(min_out),
            },
        );
        let sig = mpc_sign(KEY, &m);
        let raw = m.finish_signature(Some(sig)).expect("swap accepted");
        assert_eq!(hex_encode(&raw), SWAP_RAW);
        assert_eq!(m.treasury.bsc_usdt, 0);
        assert_eq!(m.engine.stock_units, min_out);
        assert_eq!(m.treasury.nonce, 2);
    }

    #[test]
    fn a_signature_from_another_key_is_rejected() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router();
        let other = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1
        assert!(m.finish_signature(Some(mpc_sign(other, &m))).is_none());
        assert!(!m.treasury.approved);
        assert_eq!(
            m.treasury.nonce, 0,
            "nonce not consumed, the request can be retried"
        );
        assert!(m.treasury.pending.is_none());
        assert_eq!(m.get_signed_tx(0), None);
    }

    #[test]
    fn a_failed_mpc_call_frees_the_slot() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router();
        assert!(m.finish_signature(None).is_none());
        assert_eq!(m.treasury.nonce, 0);
        m.approve_router(); // can retry
    }

    #[test]
    #[should_panic(expected = "A signature is already in flight")]
    fn one_signature_in_flight() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router();
        m.approve_router();
    }

    #[test]
    fn treasury_address_from_the_real_mpc_key() {
        // v1.signer-prod.testnet derived_public_key(path "bsc-treasury",
        // predecessor "elondoge.solidon.testnet", domain 0) on 9 Nov 2026; the address
        // was computed off-chain with `cast keccak`.
        ctx();
        let mut m = crate::test_meme(accounts(1));
        let key = "secp256k1:5qvLCw6fPGJMhEiFdAkDAK6qfTF9TmGeSFcn2TasELKFKLmkb4nb1r7dhh5QhiCYzRLsv8UkHFh5GNYWaFubdN5C";
        let address = m.on_treasury_key(Ok(key.into()));
        assert_eq!(address, "0xe1fb3df9a8c58a3a3e15e8771ab9e424d3d13c80");
        assert_eq!(
            m.get_bsc_treasury().address.as_deref(),
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
        // 1,000 USDT / $135.32 = 7.38989 shares, minus 1%.
        let out = min_stock_out(1_000 * 10u128.pow(18), &p, 18).unwrap();
        assert_eq!(out, 7_315_991_723_322_494_826);
        let bad = PythPrice { price: I64(0), ..p };
        assert_eq!(min_stock_out(1, &bad, 18), None);
    }

    #[test]
    fn malformed_mpc_responses_are_rejected_without_panicking() {
        let mut m = meme_with_treasury(KEY);
        for (r, s) in [("zz", "00"), ("02abc", "00"), ("é", "00"), ("", "")] {
            m.approve_router();
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
        assert_eq!(m.treasury.nonce, 0);
    }

    #[test]
    fn a_stuck_slot_can_be_cleared_after_300_blocks() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router(); // requested at block 0
        testing_env!(VMContextBuilder::new()
            .current_account_id("elondoge.solidon.testnet".parse().unwrap())
            .block_height(300)
            .build());
        m.clear_stuck_signature();
        assert!(m.treasury.pending.is_none());
        assert_eq!(m.treasury.nonce, 0);
    }

    #[test]
    #[should_panic(expected = "not stuck yet")]
    fn a_fresh_slot_cannot_be_cleared() {
        let mut m = meme_with_treasury(KEY);
        m.approve_router();
        m.clear_stuck_signature();
    }

    #[test]
    fn trims_leading_zeros_for_rlp() {
        assert_eq!(trim(&[0, 0, 7, 0]), vec![7, 0]);
        assert_eq!(trim(&[0, 0]), Vec::<u8>::new());
    }
}
