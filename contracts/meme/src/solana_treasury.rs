//! Solana leg of the treasury: config, the MPC EdDSA treasury key, and USDC -> stock buys
//! on Raydium CLMM, built by [`crate::solana`] and signed by the MPC (S21, S25).
//!
//! The treasury is one Solana address, the MPC ed25519 key derived from this contract's
//! account and the path `solana-treasury` (domain 1). It shares the signing slot,
//! `clear_stuck_signature`, the per-chain ledger and `fund_chain` with the EVM chains
//! (treasury.rs, cash.rs). What differs:
//! - **Cash in is reported by the relayer** (`report_cash`, like Robinhood Chain). The MPC
//!   can prove a Solana account's state (S21), but that proves a balance, not an arrival:
//!   while a signed buy has not landed, the USDC balance still holds cash the ledger has
//!   already moved to stock, so crediting from a balance could count it twice. Crediting
//!   from MPC-proven state is a follow-up.
//! - **Transactions expire.** A Solana message embeds a recent blockhash and can only land
//!   for about 60-90 s. The ledger books a buy when it is signed (as on EVM), so a buy that
//!   never lands is signed again by `resign_solana` with a new blockhash, same amounts,
//!   without touching the ledger, once 200 NEAR blocks have passed (the old one can no
//!   longer land, so the two cannot both execute).

use near_sdk::base64::Engine;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, Gas, Promise, PromiseError, PromiseOrValue};

use crate::mnav::{PythPrice, USDC_DECIMALS};
use crate::pool::emit;
use crate::solana::{
    associated_token_address, clmm_tick_array_address, encode_pubkey, parse_pubkey, swap_message,
    Pubkey, SwapAccounts, MAX_TICK_ARRAYS, TOKEN_2022_PROGRAM, TOKEN_PROGRAM,
};
use crate::treasury::{
    ext_mpc, hex_encode, min_stock_out, Payload, PendingTx, SignRequest, TxKind, GAS_CALLBACK,
    GAS_MPC_VIEW,
};
use crate::{Meme, MemeExt, Venue};

pub const PATH: &str = "solana-treasury";
/// EdDSA domain of the MPC contract.
const DOMAIN_ID: u64 = 1;
/// More than a blockhash's lifetime (150 slots, about 60-90 s): 200 NEAR blocks are at
/// least 2 minutes.
const RESIGN_AFTER_BLOCKS: u64 = 200;
const GAS_ON_PRICE: Gas = Gas::from_tgas(120);

/// The Solana chain the treasury trades on, fixed by the factory. Addresses are base58.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SolanaChain {
    /// `solana`; venues refer to it.
    pub name: String,
    /// USDC mint, 6 decimals.
    pub usdc_mint: String,
    /// SPL Token and Token-2022: the swap message is built for exactly these.
    pub usdc_token_program: String,
    pub stock_token_program: String,
    /// Raydium CLMM program and the AMM config (fee tier) of every stock pool.
    pub clmm_program: String,
    pub amm_config: String,
    /// Largest USDC amount (raw, 6 decimals) per swap and per `fund_chain` transfer.
    pub max_swap_usdc: U128,
}

impl SolanaChain {
    pub fn assert_valid(&self) {
        require!(!self.name.is_empty(), "Chain name must not be empty");
        for key in [&self.usdc_mint, &self.clmm_program, &self.amm_config] {
            parse_pubkey(key);
        }
        require!(
            self.usdc_token_program == TOKEN_PROGRAM
                && self.stock_token_program == TOKEN_2022_PROGRAM,
            "Solana USDC must be an SPL Token mint, the stocks Token-2022 mints"
        );
        // The swap amount is a u64 in the message.
        require!(
            self.max_swap_usdc.0 > 0 && self.max_swap_usdc.0 <= u64::MAX.into(),
            "max_swap_usdc must be a positive u64"
        );
    }
}

/// A stock's Raydium CLMM pool on Solana, fixed by the factory: the pool-level accounts
/// of the swap. contracts/stocks/solana-accounts.py derives them and checks them against
/// the chain; the CLMM program re-derives each one, so a wrong one only fails the swap.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SolanaVenue {
    pub pool: String,
    pub usdc_vault: String,
    pub stock_vault: String,
    pub observation: String,
    pub bitmap_extension: String,
}

impl SolanaVenue {
    pub fn assert_valid(&self) {
        for key in [
            &self.pool,
            &self.usdc_vault,
            &self.stock_vault,
            &self.observation,
            &self.bitmap_extension,
        ] {
            parse_pubkey(key);
        }
    }
}

/// The last Solana buy, kept so it can be signed again if it expires unlanded.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SolanaBuy {
    /// Sequence number of its latest signed transaction (`get_signed_tx("solana", seq)`).
    pub seq: u64,
    pub usdc_in: U128,
    pub min_stock_out: U128,
    /// NEAR block height of that signature.
    pub signed_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Default)]
pub struct SolanaState {
    pub key: Option<Pubkey>,
    /// The treasury's USDC and stock token accounts.
    pub accounts: Option<(Pubkey, Pubkey)>,
    pub last_buy: Option<SolanaBuy>,
}

#[near(serializers = [json])]
pub struct SolanaView {
    pub config: SolanaChain,
    /// The thesis stock and its pool on Solana; `null` if it does not trade there.
    pub venue: Option<Venue>,
    /// The treasury's address and its USDC and stock token accounts, base58.
    pub address: Option<String>,
    pub usdc_account: Option<String>,
    pub stock_account: Option<String>,
    /// Sequence number of the next signed transaction.
    pub seq: u64,
    /// Ledger, raw units: USDC (6 decimals), stock (venue decimals), USDC in transit.
    pub usdc: U128,
    pub stock: U128,
    pub in_transit: U128,
    pub last_buy: Option<SolanaBuy>,
}

/// `SignatureResponse::Ed25519` of the MPC contract; the `scheme` tag is ignored.
#[near(serializers = [json])]
struct EddsaSignature {
    signature: Vec<u8>,
}

pub fn base64(bytes: &[u8]) -> String {
    near_sdk::base64::engine::general_purpose::STANDARD.encode(bytes)
}

impl Meme {
    fn solana_index(&self) -> usize {
        self.chains.solana();
        self.chains.evm.len()
    }

    pub(crate) fn solana_key(&self) -> Pubkey {
        self.treasury
            .solana
            .key
            .unwrap_or_else(|| env::panic_str("Call init_solana_treasury first"))
    }

    /// The pool's tick arrays at the keeper's (start index, bump) pairs. Nothing to check
    /// them against: a wrong pair gives an address that is not the pool's tick array, and
    /// the CLMM program rejects the swap.
    fn tick_array_addresses(&self, tick_arrays: &[(i32, u8)]) -> Vec<Pubkey> {
        require!(
            (1..=MAX_TICK_ARRAYS).contains(&tick_arrays.len()),
            "Pass 1 to 3 tick arrays"
        );
        let clmm = parse_pubkey(&self.chains.solana().clmm_program);
        let pool = parse_pubkey(&self.solana_venue().1.pool);
        tick_arrays
            .iter()
            .map(|&(start, bump)| clmm_tick_array_address(&clmm, &pool, start, bump))
            .collect()
    }

    fn solana_venue(&self) -> (&Venue, &SolanaVenue) {
        let venue = self
            .venue(self.solana_index())
            .unwrap_or_else(|| env::panic_str("The stock does not trade on this chain"));
        // Stock::assert_valid requires the pool accounts on a Solana venue.
        (venue, venue.solana.as_ref().unwrap())
    }

    /// Every account of a buy, from locked config and stored state plus `tick_arrays`.
    fn swap_accounts(&self, tick_arrays: Vec<Pubkey>) -> SwapAccounts {
        let c = self.chains.solana();
        let (venue, pool) = self.solana_venue();
        let (usdc_account, stock_account) = self
            .treasury
            .solana
            .accounts
            .unwrap_or_else(|| env::panic_str("Call set_solana_accounts first"));
        SwapAccounts {
            treasury: self.solana_key(),
            usdc_mint: parse_pubkey(&c.usdc_mint),
            stock_mint: parse_pubkey(&venue.token),
            usdc_account,
            stock_account,
            clmm: parse_pubkey(&c.clmm_program),
            amm_config: parse_pubkey(&c.amm_config),
            pool: parse_pubkey(&pool.pool),
            usdc_vault: parse_pubkey(&pool.usdc_vault),
            stock_vault: parse_pubkey(&pool.stock_vault),
            observation: parse_pubkey(&pool.observation),
            bitmap_extension: parse_pubkey(&pool.bitmap_extension),
            tick_arrays,
        }
    }

    fn request_solana_signature(&mut self, message: Vec<u8>, kind: TxKind) -> Promise {
        let i = self.solana_index();
        let request = SignRequest {
            path: PATH.into(),
            payload_v2: Payload::Eddsa(hex_encode(&message)),
            domain_id: DOMAIN_ID,
        };
        let pending = PendingTx {
            requested_at: env::block_height(),
            chain: i as u32,
            nonce: self.treasury.chains[i].nonce,
            to: [0; 20],
            input: message,
            gas_limit: 0,
            kind,
        };
        self.queue_signature(pending, request)
    }

    /// Checks the MPC signature against the treasury key and stores the signed transaction
    /// `[1] || signature || message`. Never panics (see `on_signed`): returns `None` if
    /// rejected, and the slot is free either way.
    pub(crate) fn finish_solana_signature(&mut self, sig: Option<Vec<u8>>) -> Option<Vec<u8>> {
        let pending = self.treasury.pending.take()?;
        let sig: [u8; 64] = sig?.try_into().ok()?;
        if !env::ed25519_verify(&sig, &pending.input, &self.treasury.solana.key?) {
            return None;
        }
        let i = pending.chain as usize;
        let (usdc_in, min_stock_out) = match pending.kind {
            TxKind::Swap {
                usdc_in,
                min_stock_out,
            } => {
                // Booked at signing with minOut, the conservative amount, as on EVM.
                let s = &mut self.treasury.chains[i];
                s.usdc -= usdc_in.0;
                s.stock += min_stock_out.0;
                (usdc_in, min_stock_out)
            }
            _ => {
                let last = self.treasury.solana.last_buy.as_ref()?;
                (last.usdc_in, last.min_stock_out)
            }
        };
        let mut tx = Vec::with_capacity(65 + pending.input.len());
        tx.push(1); // compact-u16 signature count
        tx.extend_from_slice(&sig);
        tx.extend_from_slice(&pending.input);
        self.treasury.chains[i].nonce += 1;
        self.treasury.solana.last_buy = Some(SolanaBuy {
            seq: pending.nonce,
            usdc_in,
            min_stock_out,
            signed_at: env::block_height(),
        });
        self.treasury
            .signed
            .insert((pending.chain, pending.nonce), tx.clone());
        emit(
            "solana_tx_signed",
            json!({"chain": self.chains.name(i), "seq": pending.nonce, "kind": pending.kind,
                   "tx": base64(&tx)}),
        );
        Some(tx)
    }

    /// `on_signed` for a Solana request: `result` is the raw MPC response, if any.
    pub(crate) fn on_solana_signed(&mut self, result: Option<Vec<u8>>) -> Option<String> {
        let sig = result
            .and_then(|b| near_sdk::serde_json::from_slice::<EddsaSignature>(&b).ok())
            .map(|s| s.signature);
        let seq = self.treasury.pending.as_ref().map(|p| p.nonce);
        let tx = self.finish_solana_signature(sig);
        if tx.is_none() {
            emit(
                "solana_tx_rejected",
                json!({"chain": self.chains.solana().name, "seq": seq}),
            );
        }
        tx.map(|t| base64(&t))
    }

    pub(crate) fn solana_view(&self) -> Option<SolanaView> {
        let config = self.chains.solana.clone()?;
        let i = self.chains.evm.len();
        let s = &self.treasury.chains[i];
        let sol = &self.treasury.solana;
        Some(SolanaView {
            config,
            venue: self.venue(i).cloned(),
            address: sol.key.as_ref().map(encode_pubkey),
            usdc_account: sol.accounts.map(|a| encode_pubkey(&a.0)),
            stock_account: sol.accounts.map(|a| encode_pubkey(&a.1)),
            seq: s.nonce,
            usdc: U128(s.usdc),
            stock: U128(s.stock),
            in_transit: U128(s.in_transit),
            last_buy: sol.last_buy.clone(),
        })
    }
}

#[near]
impl Meme {
    /// Reads this contract's derived MPC EdDSA key and stores it: the treasury's Solana
    /// address. Anyone, once.
    pub fn init_solana_treasury(&mut self) -> Promise {
        self.chains.solana();
        require!(
            self.treasury.solana.key.is_none(),
            "Solana treasury already initialised"
        );
        ext_mpc::ext(self.chains.mpc.clone())
            .with_static_gas(GAS_MPC_VIEW)
            .derived_public_key(PATH.into(), env::current_account_id(), DOMAIN_ID)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_solana_treasury_key(),
            )
    }

    #[private]
    pub fn on_solana_treasury_key(
        &mut self,
        #[callback_result] key: Result<String, PromiseError>,
    ) -> String {
        let key = key.unwrap_or_else(|_| env::panic_str("MPC derived_public_key failed"));
        let key = parse_pubkey(
            key.strip_prefix("ed25519:")
                .unwrap_or_else(|| env::panic_str("expected an ed25519 key")),
        );
        if self.treasury.solana.key.is_none() {
            self.treasury.solana.key = Some(key);
            emit("treasury", json!({"solana_address": encode_pubkey(&key)}));
        }
        encode_pubkey(&key)
    }

    /// Stores the treasury's USDC and stock token accounts: its associated token accounts,
    /// derived from the canonical bumps (`findProgramAddressSync`). Only the relayer, and
    /// it may correct them: the contract cannot tell a canonical bump from another (no
    /// curve math, see solana.rs), and a wrong account makes every buy fail, so with
    /// "anyone, once" anyone could break the Solana leg for good. A wrong account can
    /// never receive funds.
    pub fn set_solana_accounts(
        &mut self,
        usdc_account_bump: u8,
        stock_account_bump: u8,
    ) -> [String; 2] {
        require!(
            env::predecessor_account_id() == self.chains.relayer,
            "Only the relayer can set the Solana token accounts"
        );
        let c = self.chains.solana();
        let owner = self.solana_key();
        let usdc = associated_token_address(
            &owner,
            &parse_pubkey(&c.usdc_token_program),
            &parse_pubkey(&c.usdc_mint),
            usdc_account_bump,
        );
        let stock = associated_token_address(
            &owner,
            &parse_pubkey(&c.stock_token_program),
            &parse_pubkey(&self.solana_venue().0.token),
            stock_account_bump,
        );
        self.treasury.solana.accounts = Some((usdc, stock));
        let accounts = [encode_pubkey(&usdc), encode_pubkey(&stock)];
        emit(
            "solana_accounts",
            json!({"usdc_account": accounts[0], "stock_account": accounts[1]}),
        );
        accounts
    }

    /// Swaps up to `max_swap_usdc` of the treasury's Solana USDC into the thesis stock on
    /// its Raydium CLMM pool, `minOut` = oracle value − 1%. Anyone. Live inputs from the
    /// chain: `blockhash`, a recent blockhash (base58); `tick_arrays`, 1 to 3 (start index,
    /// bump) of the pool's initialized tick arrays in the swap direction, nearest first.
    /// Wrong live inputs only make the transaction fail (`resign_solana` then retries):
    /// every other account comes from locked config. Attach 300 TGas.
    pub fn buy_stock_solana(&mut self, blockhash: String, tick_arrays: Vec<(i32, u8)>) -> Promise {
        let i = self.solana_index();
        // Everything that can panic is checked here, before any state change; the
        // callback derives the same accounts again from the same args.
        self.swap_accounts(self.tick_array_addresses(&tick_arrays));
        parse_pubkey(&blockhash);
        self.assert_can_sign();
        require!(self.treasury.chains[i].usdc > 0, "No USDC on this chain");
        self.read_price()
            .get_price_no_older_than(self.stock.price_id.clone(), self.params.oracle_max_age_secs)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_PRICE)
                    .on_solana_buy_price(blockhash, tick_arrays),
            )
    }

    #[private]
    pub fn on_solana_buy_price(
        &mut self,
        blockhash: String,
        tick_arrays: Vec<(i32, u8)>,
        #[callback_result] price: Result<Option<PythPrice>, PromiseError>,
    ) -> PromiseOrValue<Option<String>> {
        let i = self.solana_index();
        let decimals = self.solana_venue().0.decimals;
        let usdc_in = self.treasury.chains[i]
            .usdc
            .min(self.chains.max_swap_usdc(i));
        // A zero minOut would sign a swap with no slippage bound: skip instead.
        let Some(min_out) = price
            .ok()
            .flatten()
            .and_then(|p| min_stock_out(usdc_in, &p, decimals, USDC_DECIMALS as u8))
            .filter(|out| *out > 0 && *out <= u64::MAX.into())
        else {
            emit(
                "buy_stock_skipped",
                json!({"chain": self.chains.name(i), "reason": "no fresh price or amount out of range"}),
            );
            return PromiseOrValue::Value(None);
        };
        self.assert_can_sign();
        // max_swap_usdc fits a u64 (SolanaChain::assert_valid).
        let accounts = self.swap_accounts(self.tick_array_addresses(&tick_arrays));
        let message = swap_message(
            &accounts,
            &parse_pubkey(&blockhash),
            usdc_in as u64,
            min_out as u64,
        );
        let kind = TxKind::Swap {
            usdc_in: U128(usdc_in),
            min_stock_out: U128(min_out),
        };
        PromiseOrValue::Promise(self.request_solana_signature(message, kind))
    }

    /// Signs the last Solana buy again, same amount and `minOut`, with a new `blockhash`
    /// and `tick_arrays` (as in `buy_stock_solana`), for a buy that expired without
    /// landing. The ledger already holds it and is not touched. Anyone, once 200 NEAR
    /// blocks have passed since it was last signed, so the previous transaction can no
    /// longer land. Attach 300 TGas.
    pub fn resign_solana(&mut self, blockhash: String, tick_arrays: Vec<(i32, u8)>) -> Promise {
        let last = self
            .treasury
            .solana
            .last_buy
            .clone()
            .unwrap_or_else(|| env::panic_str("No Solana buy to sign again"));
        require!(
            env::block_height() >= last.signed_at + RESIGN_AFTER_BLOCKS,
            "The last Solana buy may still land: wait 200 blocks after its signature"
        );
        self.assert_can_sign();
        let accounts = self.swap_accounts(self.tick_array_addresses(&tick_arrays));
        // Both amounts were u64 when first signed.
        let message = swap_message(
            &accounts,
            &parse_pubkey(&blockhash),
            last.usdc_in.0 as u64,
            last.min_stock_out.0 as u64,
        );
        self.request_solana_signature(message, TxKind::Resign)
    }
}

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::json_types::{I64, U64};
    use near_sdk::mock::MockAction;
    use near_sdk::test_utils::{accounts, get_created_receipts, VMContextBuilder};
    use near_sdk::{testing_env, PromiseResult};

    const ME: &str = "nvda.solidon.testnet";
    const RELAYER: &str = "keeper.solidon.testnet";
    const SOL: usize = 2;
    const USDC: u128 = 1_000_000;

    /// The S25 follow-up buy that landed on devnet, signed by `v1.signer-prod.testnet`
    /// for creator.solidon.testnet's `solana-treasury` key: 1 USDC -> NVDAx, min out
    /// 560,337 (tx EwX4QEFx…, slot 520,475,666, err null; wire bytes from getTransaction).
    const TREASURY: &str = "GXhnfvC6yYEXgYEtSwEZNfKF2tcCd7vFn5onqEyK2UH5";
    const BLOCKHASH: &str = "7bSELsy5tWMh55YnJZR2BzKPLjWoJqiG6jwPbc8eTUU9";
    const TICK_ARRAYS: [(i32, u8); 2] = [(-6000, 255), (-13200, 254)];
    const LANDED_TX: &str = "010c0573f93ce8e88ecd6c4a7e697c28dc61e244421f39da58cf25fb8ba80814e1c86525bb3a0ac676c4358f34d77024f83a80100ba996ce45ce51a8152137980601000913e6bcd8bee029c0225dabdd6c65232c0bf3bbf3db4c9876f3bb532afbc02a80f85eabe89c4e737560bf3e7b7a06f5be4f670a0e1a9a890027ffb1b98ffafc885fd391b44caca2123d844a6f1d4101a2023f39c1fa960f9efa5f89bf3d524476f71dc03d0f4d6c6702905ecddf9d6ceed2c42a47c36256e96d6a589b77b888c5305f49c1b435a61dad775a4a23fb8547a8d105be948cc09b983a5dfc14aabde6de1cf7efc896e50b94e7e026f739be9e5240e094f571702a0ab3e8f9d86148b7a78fe3fa6559605bc5aded5b2d433d3dd1d2414ed3b96fc81a5664dd6f8299fdfa4714aafccf3c8cea4378d6c649f6aef4c1f697bf188299b5f8958b056442a360c8a24817af4239e5f8856ffb9abce6d44efc5b6f6567c4c624f58560a08cfde3c6a38298c9c3d8b54b2b2098481a4f31091668ad3df672180aabea5270e1e14869d92b2c6eea3b0ce3d5f359f27a4ab5b4dba98ecc30db2290f4de336ffd94a6000000000000000000000000000000000000000000000000000000000000000006ddf6e1ee758fde18425dbce46ccddab61afc4d83b90d27febdf928d8a18bfc8c97258f4e2489f1bb3d1029148e0d830b5a1399daff1084048e7bd8dbe9f859e628e6d430307a9b8e8fcca00c3c674021b299b5ebc5609c01c26b0ee892219a06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d3b442cb3912157f13a933d0134282d032b5ffecd01a2dbf1b7790608df002ea70963cacd2f204f20079288694d44c6e67979817303746f08b32aa0ced1fb272a61f86592d9072a1596c34c1515a24dd7f8fb7587ef5ba0d04a411ec6cb1f7d72020d060001000a0b0c01011210000e0203010405060f0c10110a070809292b04ed0b1ac91e6240420f0000000000d18c0800000000000000000000000000000000000000000001";
    /// The treasury's token accounts and their bumps (solana.rs vectors).
    const USDC_ATA: (&str, u8) = ("318qibizcq962JSymQtW3KfuZuQhMi2UrRFuVmzTcHn7", 253);
    const STOCK_ATA: (&str, u8) = ("7NZMuaey6A1bx5dthm78J1wR3PFxrLWWJSAhJMBpbx3p", 255);
    /// $176.6792: 1 USDC buys 565,997 raw NVDAx (8 dp), minus 1% = 560,337, the landed min out.
    const LANDED_PRICE: i64 = 17_667_920_000;

    fn hex(s: &str) -> Vec<u8> {
        crate::treasury::hex_decode(s).unwrap()
    }

    fn price(p: i64) -> PythPrice {
        PythPrice {
            price: I64(p),
            conf: U64(0),
            expo: -8,
            publish_time: 0,
        }
    }

    fn at(block: u64, predecessor: &str, results: Vec<PromiseResult>) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(ME.parse().unwrap())
                .predecessor_account_id(predecessor.parse().unwrap())
                .block_height(block)
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            results,
        );
    }

    /// A meme whose Solana treasury is `key`, with its token accounts set and 1 USDC there.
    fn meme(key: Pubkey) -> Meme {
        at(0, RELAYER, vec![]);
        let mut m = crate::test_meme(accounts(1));
        m.treasury.solana.key = Some(key);
        m.treasury.solana.accounts = Some((parse_pubkey(USDC_ATA.0), parse_pubkey(STOCK_ATA.0)));
        m.treasury.chains[SOL].usdc = USDC;
        m
    }

    /// `buy_stock_solana`, then its price callback with the args the contract passed on.
    fn buy(m: &mut Meme, blockhash: &str, tick_arrays: &[(i32, u8)], p: i64) {
        m.buy_stock_solana(blockhash.into(), tick_arrays.to_vec());
        let args = get_created_receipts()
            .into_iter()
            .flat_map(|r| r.actions)
            .find_map(|a| match a {
                MockAction::FunctionCallWeight {
                    method_name, args, ..
                } if method_name == b"on_solana_buy_price" => Some(args),
                _ => None,
            })
            .expect("price callback");
        let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(&args).unwrap();
        let blockhash = near_sdk::serde_json::from_value(args["blockhash"].clone()).unwrap();
        let tick_arrays = near_sdk::serde_json::from_value(args["tick_arrays"].clone()).unwrap();
        at(env::block_height(), ME, vec![]);
        m.on_solana_buy_price(blockhash, tick_arrays, Ok(Some(price(p))));
    }

    fn mpc_response(sig: &[u8]) -> PromiseResult {
        let json = format!(r#"{{"scheme":"Ed25519","signature":{sig:?}}}"#);
        PromiseResult::Successful(json.into_bytes())
    }

    /// The MPC's answer reaching `on_signed` at `block`.
    fn signed(m: &mut Meme, block: u64, response: PromiseResult) -> Option<String> {
        at(block, ME, vec![response]);
        m.on_signed()
    }

    fn pending_message(m: &Meme) -> Vec<u8> {
        m.treasury.pending.as_ref().unwrap().input.clone()
    }

    fn encode_sig(b: &[u8]) -> String {
        near_sdk::bs58::encode(b).into_string()
    }

    fn panics(f: impl FnOnce()) -> bool {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).is_err()
    }

    #[test]
    fn treasury_key_and_token_accounts_from_the_real_mpc_key() {
        at(0, RELAYER, vec![]);
        let mut m = crate::test_meme(accounts(1));
        // v1.signer-prod.testnet derived_public_key("solana-treasury",
        // creator.solidon.testnet, 1), read on testnet on 10 Nov 2026.
        let key = format!("ed25519:{TREASURY}");
        assert_eq!(m.on_solana_treasury_key(Ok(key)), TREASURY);
        let set = m.set_solana_accounts(USDC_ATA.1, STOCK_ATA.1);
        assert_eq!(set, [USDC_ATA.0, STOCK_ATA.0]);
        let view = m.get_treasury_chains().solana.unwrap();
        assert_eq!(view.address.as_deref(), Some(TREASURY));
        assert_eq!(view.usdc_account.as_deref(), Some(USDC_ATA.0));
        assert_eq!(view.stock_account.as_deref(), Some(STOCK_ATA.0));
        assert_eq!(
            view.venue.unwrap().token,
            "88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB"
        );
    }

    #[test]
    #[should_panic(expected = "Only the relayer")]
    fn only_the_relayer_sets_the_token_accounts() {
        let mut m = meme(parse_pubkey(TREASURY));
        at(0, accounts(2).as_str(), vec![]);
        m.set_solana_accounts(USDC_ATA.1, STOCK_ATA.1);
    }

    /// End to end against the transaction the MPC signed and devnet executed: the
    /// contract builds the same message, accepts the real MPC signature and stores the
    /// exact bytes that landed.
    #[test]
    fn buy_rebuilds_the_landed_devnet_transaction_byte_for_byte() {
        let mut m = meme(parse_pubkey(TREASURY));
        let landed = hex(LANDED_TX);
        buy(&mut m, BLOCKHASH, &TICK_ARRAYS, LANDED_PRICE);
        assert_eq!(pending_message(&m), landed[65..]);
        let tx = signed(&mut m, 5, mpc_response(&landed[1..65])).expect("accepted");
        assert_eq!(tx, base64(&landed));
        assert_eq!(m.get_signed_tx("solana".into(), 0), Some(base64(&landed)));
        let s = &m.treasury.chains[SOL];
        assert_eq!((s.usdc, s.stock, s.nonce), (0, 560_337, 1));
        assert!(m.treasury.pending.is_none());
        let view = m.get_treasury_chains().solana.unwrap();
        assert_eq!((view.seq, view.stock), (1, U128(560_337)));
        assert_eq!(
            view.last_buy,
            Some(SolanaBuy {
                seq: 0,
                usdc_in: U128(USDC),
                min_stock_out: U128(560_337),
                signed_at: 5
            })
        );
    }

    #[test]
    fn a_signature_from_another_key_or_a_bad_answer_is_rejected() {
        let mut m = meme(parse_pubkey(TREASURY));
        let landed = hex(LANDED_TX);
        let wrong_key = SigningKey::from_bytes(&[7; 32])
            .sign(&landed[65..])
            .to_bytes();
        let mut tampered = landed[1..65].to_vec();
        tampered[0] ^= 1;
        for response in [
            mpc_response(&wrong_key),
            mpc_response(&tampered),
            mpc_response(&landed[1..64]), // 63 bytes
            PromiseResult::Successful(b"{\"signature\":[256]}".to_vec()),
            PromiseResult::Failed,
        ] {
            buy(&mut m, BLOCKHASH, &TICK_ARRAYS, LANDED_PRICE);
            assert_eq!(signed(&mut m, 1, response), None);
            let s = &m.treasury.chains[SOL];
            assert_eq!((s.usdc, s.stock, s.nonce), (USDC, 0, 0), "ledger untouched");
            assert!(m.treasury.pending.is_none(), "slot freed");
        }
        assert_eq!(m.get_signed_tx("solana".into(), 0), None);
        assert_eq!(m.treasury.solana.last_buy, None);
    }

    #[test]
    fn a_wrong_tick_array_bump_names_an_account_that_is_not_the_pools() {
        // The contract has no curve math to reject it, but the message then names an
        // address that is not the pool's tick array, which the CLMM program rejects: the
        // swap fails on Solana and `resign_solana` retries with the right bump.
        let m = meme(parse_pubkey(TREASURY));
        let good = m.tick_array_addresses(&TICK_ARRAYS);
        assert_eq!(
            encode_pubkey(&good[0]),
            "EWC4cMDc1LwSgE5YFNVAtU32ATh9bLrwrDtu6bgexrjt"
        );
        let bad = m.tick_array_addresses(&[(-6000, 254), TICK_ARRAYS[1]]);
        assert_ne!(bad[0], good[0]);
        assert_eq!(bad[1], good[1]);
    }

    #[test]
    #[should_panic(expected = "Pass 1 to 3 tick arrays")]
    fn buy_needs_a_tick_array() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.buy_stock_solana(BLOCKHASH.into(), vec![]);
    }

    #[test]
    #[should_panic(expected = "32 bytes, base58")]
    fn buy_needs_a_base58_blockhash() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.buy_stock_solana("0x1234".into(), TICK_ARRAYS.to_vec());
    }

    #[test]
    #[should_panic(expected = "Call set_solana_accounts first")]
    fn buy_needs_the_token_accounts() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.treasury.solana.accounts = None;
        m.buy_stock_solana(BLOCKHASH.into(), TICK_ARRAYS.to_vec());
    }

    #[test]
    fn a_stale_price_skips_the_buy() {
        let mut m = meme(parse_pubkey(TREASURY));
        let r = m.on_solana_buy_price(BLOCKHASH.into(), TICK_ARRAYS.to_vec(), Ok(None));
        assert!(matches!(r, PromiseOrValue::Value(None)));
        assert!(m.treasury.pending.is_none());
    }

    #[test]
    #[should_panic(expected = "A signature is already in flight")]
    fn solana_shares_the_signing_slot_with_evm() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.treasury.address = Some([1; 20]);
        m.approve_router("base".into());
        m.buy_stock_solana(BLOCKHASH.into(), TICK_ARRAYS.to_vec());
    }

    #[test]
    fn a_stuck_solana_request_is_cleared_like_an_evm_one() {
        let mut m = meme(parse_pubkey(TREASURY));
        buy(&mut m, BLOCKHASH, &TICK_ARRAYS, LANDED_PRICE);
        at(300, ME, vec![]);
        m.clear_stuck_signature();
        assert!(m.treasury.pending.is_none());
        assert_eq!(m.treasury.chains[SOL].usdc, USDC);
    }

    /// Buy, signed by a local key standing in for the MPC, then sign it again once the
    /// first transaction has expired.
    #[test]
    fn resign_waits_200_blocks_and_never_books_twice() {
        let key = SigningKey::from_bytes(&[9; 32]);
        let mut m = meme(key.verifying_key().to_bytes());
        m.treasury.chains[SOL].usdc = 7 * USDC; // one swap is capped at 5
        buy(&mut m, BLOCKHASH, &TICK_ARRAYS, LANDED_PRICE);
        let first = pending_message(&m);
        signed(&mut m, 10, mpc_response(&key.sign(&first).to_bytes())).expect("accepted");
        let min_out = m.treasury.solana.last_buy.as_ref().unwrap().min_stock_out.0;
        let booked = (m.treasury.chains[SOL].usdc, m.treasury.chains[SOL].stock);
        assert_eq!(booked, (2 * USDC, min_out));

        // A new blockhash and one tick array: same amounts, stored as seq 1.
        let blockhash = encode_pubkey(&[3; 32]);
        let resign = |m: &mut Meme| m.resign_solana(blockhash.clone(), vec![TICK_ARRAYS[0]]);
        at(209, accounts(3).as_str(), vec![]);
        assert!(panics(|| {
            resign(&mut m);
        }));
        at(210, accounts(3).as_str(), vec![]);
        resign(&mut m);
        let second = pending_message(&m);
        let ticks = m.tick_array_addresses(&[TICK_ARRAYS[0]]);
        let expected = swap_message(
            &m.swap_accounts(ticks),
            &[3; 32],
            5 * USDC as u64,
            min_out as u64,
        );
        assert_eq!(second, expected);
        assert_ne!(second, first);
        let tx = signed(&mut m, 215, mpc_response(&key.sign(&second).to_bytes())).unwrap();

        let s = &m.treasury.chains[SOL];
        assert_eq!(
            (s.usdc, s.stock, s.nonce),
            (booked.0, booked.1, 2),
            "no double debit"
        );
        assert_eq!(m.get_signed_tx("solana".into(), 1), Some(tx));
        let last = m.treasury.solana.last_buy.clone().unwrap();
        assert_eq!(
            (last.seq, last.signed_at, last.usdc_in, last.min_stock_out),
            (1, 215, U128(5 * USDC), U128(min_out))
        );
        // The wait restarts from the new signature.
        at(414, accounts(3).as_str(), vec![]);
        assert!(panics(|| {
            resign(&mut m);
        }));
    }

    #[test]
    #[should_panic(expected = "may still land")]
    fn resign_before_200_blocks_is_rejected() {
        let key = SigningKey::from_bytes(&[9; 32]);
        let mut m = meme(key.verifying_key().to_bytes());
        buy(&mut m, BLOCKHASH, &TICK_ARRAYS, LANDED_PRICE);
        let msg = pending_message(&m);
        signed(&mut m, 10, mpc_response(&key.sign(&msg).to_bytes())).unwrap();
        at(209, RELAYER, vec![]);
        m.resign_solana(BLOCKHASH.into(), TICK_ARRAYS.to_vec());
    }

    #[test]
    #[should_panic(expected = "No Solana buy to sign again")]
    fn resign_needs_a_signed_buy() {
        let mut m = meme(parse_pubkey(TREASURY));
        at(1_000, RELAYER, vec![]);
        m.resign_solana(BLOCKHASH.into(), TICK_ARRAYS.to_vec());
    }

    #[test]
    fn the_relayer_reports_solana_cash_capped_and_once() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.treasury.chains[SOL].in_transit = 3 * USDC;
        // A Solana tx id is its first signature, base58.
        let sig = encode_sig(&hex(LANDED_TX)[1..65]);
        assert_eq!(
            m.report_cash("solana".into(), sig.clone(), U128(5 * USDC)),
            U128(3 * USDC)
        );
        let s = &m.treasury.chains[SOL];
        assert_eq!((s.in_transit, s.usdc), (0, 4 * USDC));
        m.treasury.chains[SOL].in_transit = 3 * USDC;
        assert!(panics(|| {
            m.report_cash("solana".into(), sig, U128(USDC));
        }));
    }

    #[test]
    #[should_panic(expected = "Only the relayer")]
    fn only_the_relayer_reports_solana_cash() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.treasury.chains[SOL].in_transit = 3 * USDC;
        at(0, accounts(2).as_str(), vec![]);
        m.report_cash("solana".into(), encode_sig(&[5; 64]), U128(USDC));
    }

    #[test]
    #[should_panic(expected = "Solana transaction signature")]
    fn a_solana_report_needs_a_signature() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.treasury.chains[SOL].in_transit = 3 * USDC;
        m.report_cash("solana".into(), TREASURY.into(), U128(USDC)); // 32 bytes
    }

    #[test]
    #[should_panic(expected = "reported by the relayer")]
    fn solana_cash_takes_no_evm_log_proof() {
        let mut m = meme(parse_pubkey(TREASURY));
        let log = crate::cash::LogArgs {
            block_hash: format!("0x{}", "00".repeat(32)),
            block_number: 1,
            transaction_index: 0,
            address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".into(),
            topics: vec![],
            data: "0x".into(),
        };
        m.credit_cash("solana".into(), format!("0x{}", "00".repeat(32)), 0, log);
    }

    #[test]
    #[should_panic(expected = "Not an EVM chain")]
    fn evm_methods_reject_solana() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.buy_stock("solana".into());
    }

    #[test]
    fn fund_chain_pays_the_solana_treasury_and_nav_counts_it_throughout() {
        let mut m = meme(parse_pubkey(TREASURY));
        m.treasury.chains[SOL].usdc = 0;
        m.treasury_usdc = 100 * USDC;
        let p = price(18_000_000_000);
        let assets = m.assets(&p).unwrap();
        m.on_fund_price(SOL as u32, Ok(Some(p.clone())));
        let receipts = get_created_receipts();
        let MockAction::FunctionCallWeight { args, .. } = &receipts[0].actions[0] else {
            panic!("expected ft_transfer")
        };
        let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
        assert_eq!(args["memo"], format!("solidon fund solana {TREASURY}"));
        assert_eq!(args["amount"], "5000000");
        assert_eq!(m.assets(&p).unwrap(), assets, "in transit");
        at(0, RELAYER, vec![]);
        m.report_cash("solana".into(), encode_sig(&[5; 64]), U128(5 * USDC));
        assert_eq!(m.assets(&p).unwrap(), assets, "arrived");
        // 1 NVDAx (8 dp) at $180 on Solana adds $180.
        m.treasury.chains[SOL].stock = 10u128.pow(8);
        assert_eq!(m.assets(&p).unwrap(), assets + 180 * USDC);
    }

    #[test]
    #[should_panic(expected = "Chain names and chain ids must be unique")]
    fn a_solana_chain_named_like_an_evm_chain_is_rejected() {
        let mut chains = crate::test_chains();
        chains.solana.as_mut().unwrap().name = "base".into();
        chains.assert_valid();
    }

    #[test]
    #[should_panic(expected = "SPL Token mint, the stocks Token-2022")]
    fn solana_token_programs_are_fixed() {
        let mut chains = crate::test_chains();
        chains.solana.as_mut().unwrap().stock_token_program = TOKEN_PROGRAM.into();
        chains.assert_valid();
    }

    #[test]
    #[should_panic(expected = "max_swap_usdc must be a positive u64")]
    fn solana_max_swap_fits_the_message() {
        let mut chains = crate::test_chains();
        chains.solana.as_mut().unwrap().max_swap_usdc = U128(u128::from(u64::MAX) + 1);
        chains.assert_valid();
    }

    #[test]
    #[should_panic(expected = "32 bytes, base58")]
    fn solana_addresses_must_be_base58_keys() {
        let mut chains = crate::test_chains();
        chains.solana.as_mut().unwrap().amm_config =
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e".into();
        chains.assert_valid();
    }

    #[test]
    fn the_evm_chains_work_without_solana() {
        let mut chains = crate::test_chains();
        chains.solana = None;
        chains.assert_valid();
        assert_eq!((chains.len(), chains.index("solana")), (2, None));
    }
}
