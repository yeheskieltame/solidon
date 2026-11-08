//! Solidon meme: a NEP-141 token whose treasury rules are locked at launch.
//!
//! There is no owner and no setter. Every parameter in [`Params`] is fixed in
//! `new` and readable by anyone through `get_params`.

use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue};

pub const DECIMALS: u8 = 18;
/// 1,000,000,000 tokens, all minted to the contract as pool inventory.
pub const INITIAL_SUPPLY: u128 = 1_000_000_000 * 10u128.pow(DECIMALS as u32);

/// Capital rules from docs/SPEC.md "Mechanics & locked parameters".
/// Ratios are in basis points (10_000 = 100% or 1.0x), durations in seconds.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Params {
    pub pool_fee_bps: u32,
    pub treasury_fee_bps: u32,
    pub creator_fee_bps: u32,
    pub issuance_mnav_bps: u32,
    pub max_issuance_bps_per_epoch: u32,
    pub epoch_secs: u64,
    pub buyback_mnav_bps: u32,
    pub redemption_mnav_bps: u32,
    pub cash_buffer_bps: u32,
    pub cash_refill_bps: u32,
    pub twap_window_secs: u64,
    pub oracle_max_age_secs: u64,
    pub rebalance_cooldown_secs: u64,
    pub caller_tip_bps: u32,
    pub target_leverage_bps: u32,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            pool_fee_bps: 100,
            treasury_fee_bps: 80,
            creator_fee_bps: 20,
            issuance_mnav_bps: 20_000,
            max_issuance_bps_per_epoch: 100,
            epoch_secs: 24 * 3600,
            buyback_mnav_bps: 10_000,
            redemption_mnav_bps: 9_000,
            cash_buffer_bps: 2_000,
            cash_refill_bps: 1_000,
            twap_window_secs: 30 * 60,
            oracle_max_age_secs: 15 * 60,
            rebalance_cooldown_secs: 3600,
            caller_tip_bps: 5,
            target_leverage_bps: 10_000,
        }
    }
}

#[near(serializers = [json])]
pub struct MemeInfo {
    pub creator: AccountId,
    pub usdc: AccountId,
    pub thesis_stock: String,
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Meme {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    creator: AccountId,
    usdc: AccountId,
    thesis_stock: String,
    params: Params,
}

#[near]
impl Meme {
    /// Called once by the factory in the same batch that deploys the code.
    #[init]
    pub fn new(
        creator: AccountId,
        usdc: AccountId,
        name: String,
        symbol: String,
        thesis_stock: String,
        icon: Option<String>,
    ) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name,
            symbol,
            icon,
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        };
        metadata.assert_valid();

        let mut this = Self {
            token: FungibleToken::new(StorageKey::Token),
            metadata,
            creator,
            usdc,
            thesis_stock,
            params: Params::default(),
        };
        let pool = env::current_account_id();
        this.token.internal_register_account(&pool);
        this.token.internal_deposit(&pool, INITIAL_SUPPLY);
        FtMint {
            owner_id: &pool,
            amount: U128(INITIAL_SUPPLY),
            memo: Some("initial pool inventory"),
        }
        .emit();
        this
    }

    pub fn get_params(&self) -> Params {
        self.params.clone()
    }

    pub fn get_info(&self) -> MemeInfo {
        MemeInfo {
            creator: self.creator.clone(),
            usdc: self.usdc.clone(),
            thesis_stock: self.thesis_stock.clone(),
        }
    }
}

#[near]
impl FungibleTokenCore for Meme {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Meme {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Meme {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Meme {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn setup() -> Meme {
        testing_env!(VMContextBuilder::new()
            .current_account_id("nvda.solidon.near".parse().unwrap())
            .build());
        Meme::new(
            accounts(1),
            "usdc.near".parse().unwrap(),
            "Nvidia Meme".into(),
            "NVDA".into(),
            "NVDA".into(),
            None,
        )
    }

    #[test]
    fn mints_initial_supply_to_pool() {
        let m = setup();
        assert_eq!(m.ft_total_supply().0, INITIAL_SUPPLY);
        assert_eq!(
            m.ft_balance_of("nvda.solidon.near".parse().unwrap()).0,
            INITIAL_SUPPLY
        );
        assert_eq!(m.ft_balance_of(accounts(1)).0, 0);
    }

    #[test]
    fn metadata_and_info() {
        let m = setup();
        let md = m.ft_metadata();
        assert_eq!((md.symbol.as_str(), md.decimals), ("NVDA", 18));
        let info = m.get_info();
        assert_eq!(info.creator, accounts(1));
        assert_eq!(info.thesis_stock, "NVDA");
    }

    #[test]
    fn params_match_spec() {
        let p = setup().get_params();
        assert_eq!(p.pool_fee_bps, p.treasury_fee_bps + p.creator_fee_bps);
        assert_eq!(
            (p.pool_fee_bps, p.treasury_fee_bps, p.creator_fee_bps),
            (100, 80, 20)
        );
        assert_eq!(
            (
                p.issuance_mnav_bps,
                p.buyback_mnav_bps,
                p.redemption_mnav_bps
            ),
            (20_000, 10_000, 9_000)
        );
        assert_eq!((p.max_issuance_bps_per_epoch, p.epoch_secs), (100, 86_400));
        assert_eq!((p.cash_buffer_bps, p.cash_refill_bps), (2_000, 1_000));
        assert_eq!(
            (
                p.twap_window_secs,
                p.oracle_max_age_secs,
                p.rebalance_cooldown_secs
            ),
            (1_800, 900, 3_600)
        );
        assert_eq!((p.caller_tip_bps, p.target_leverage_bps), (5, 10_000));
    }
}
