//! Internal meme/USDC constant-product pool (x * y = k).
//!
//! The 1% fee is always taken on the USDC side: 0.8% goes to treasury cash,
//! 0.2% becomes claimable by the creator. Amounts out round down, so k never
//! decreases.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::fungible_token::FungibleTokenCore;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, Gas, NearToken, Promise, PromiseOrValue,
};

use crate::twap::PRICE_SCALE;
use crate::{Meme, MemeExt, Params};

// The macro expands to code clippy flags; the lint is not ours to fix.
#[allow(clippy::manual_div_ceil)]
mod u256 {
    uint::construct_uint! {
        pub struct U256(4);
    }
}
pub use u256::U256;

/// `a * b / c` without overflowing u128, rounded down.
pub fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    (U256::from(a) * U256::from(b) / U256::from(c)).as_u128()
}

/// Constant-product output for `amount_in`, before fees.
pub fn amount_out(amount_in: u128, reserve_in: u128, reserve_out: u128) -> u128 {
    mul_div(amount_in, reserve_out, reserve_in + amount_in)
}

/// Splits a USDC amount into (treasury fee, creator fee, net amount).
pub fn split_fee(usdc: u128, p: &Params) -> (u128, u128, u128) {
    let fee = mul_div(usdc, p.pool_fee_bps.into(), 10_000);
    let treasury = mul_div(usdc, p.treasury_fee_bps.into(), 10_000);
    (treasury, fee - treasury, usdc - fee)
}

#[near(serializers = [json])]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum TransferAction {
    /// Creator provides the first USDC liquidity, once.
    Seed,
    Buy {
        min_out: U128,
    },
}

#[near(serializers = [json])]
pub struct PoolView {
    pub meme_reserve: U128,
    pub usdc_reserve: U128,
    pub treasury_usdc: U128,
    /// USDC raw per meme raw, scaled by 1e30. Zero before the seed.
    pub spot_price: U128,
    /// 30-minute TWAP, same scale. `null` while the pool is younger than the window.
    pub twap_price: Option<U128>,
}

pub fn now_secs() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_PAYOUT: Gas = Gas::from_tgas(5);

pub(crate) fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "solidon", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

impl Meme {
    pub(crate) fn meme_reserve(&self) -> u128 {
        self.token.ft_balance_of(env::current_account_id()).0
    }

    pub(crate) fn spot_price(&self) -> u128 {
        mul_div(self.usdc_reserve, PRICE_SCALE, self.meme_reserve())
    }

    /// Call after every reserve change.
    pub(crate) fn observe_price(&mut self) {
        let price = self.spot_price();
        self.twap.observe(now_secs(), price);
    }

    pub(crate) fn twap_price(&self) -> Option<u128> {
        self.twap.average(now_secs(), self.params.twap_window_secs)
    }

    pub(crate) fn credit(&mut self, account: &AccountId, amount: u128) {
        if amount > 0 {
            let prev = self.claimable.get(account).copied().unwrap_or(0);
            self.claimable.insert(account.clone(), prev + amount);
        }
    }

    /// Sends USDC; on failure the amount becomes claimable instead of lost.
    pub(crate) fn payout(&self, account: AccountId, amount: u128) -> Promise {
        ext_ft_core::ext(self.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(account.clone(), U128(amount), None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_PAYOUT)
                    .on_payout(account, U128(amount)),
            )
    }

    fn buy(&mut self, buyer: AccountId, usdc_in: u128, min_out: u128) {
        require!(self.usdc_reserve > 0, "Pool is not seeded");
        let (to_treasury, to_creator, net) = split_fee(usdc_in, &self.params);
        let out = amount_out(net, self.usdc_reserve, self.meme_reserve());
        require!(out > 0 && out >= min_out, "Slippage: output below min_out");

        self.usdc_reserve += net;
        self.treasury_usdc += to_treasury;
        let creator = self.creator.clone();
        self.credit(&creator, to_creator);
        self.token
            .internal_transfer(&env::current_account_id(), &buyer, out, None);
        self.observe_price();
        emit(
            "buy",
            json!({"account": buyer, "usdc_in": U128(usdc_in), "meme_out": U128(out)}),
        );
    }
}

#[near]
impl FungibleTokenReceiver for Meme {
    /// USDC in: `{"action":"seed"}` (creator, once) or `{"action":"buy","min_out":"<u128>"}`.
    /// Any panic here refunds the full USDC amount through `ft_resolve_transfer`.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.usdc,
            "Only the USDC token is accepted"
        );
        let action: TransferAction =
            near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Invalid msg"));
        match action {
            TransferAction::Seed => {
                require!(sender_id == self.creator, "Only the creator can seed");
                require!(self.usdc_reserve == 0, "Pool is already seeded");
                require!(amount.0 > 0, "Seed must be positive");
                self.usdc_reserve = amount.0;
                self.observe_price();
                emit("seed", json!({"account": sender_id, "usdc_in": amount}));
            }
            TransferAction::Buy { min_out } => self.buy(sender_id, amount.0, min_out.0),
        }
        PromiseOrValue::Value(U128(0))
    }
}

#[near]
impl Meme {
    /// Sells `amount` meme for USDC. Requires 1 yoctoNEAR.
    #[payable]
    pub fn sell(&mut self, amount: U128, min_out: U128) -> Promise {
        assert_one_yocto();
        require!(self.usdc_reserve > 0, "Pool is not seeded");
        let seller = env::predecessor_account_id();
        let gross = amount_out(amount.0, self.meme_reserve(), self.usdc_reserve);
        let (to_treasury, to_creator, net) = split_fee(gross, &self.params);
        require!(
            net > 0 && net >= min_out.0,
            "Slippage: output below min_out"
        );

        self.token
            .internal_transfer(&seller, &env::current_account_id(), amount.0, None);
        self.usdc_reserve -= gross;
        self.observe_price();
        self.treasury_usdc += to_treasury;
        let creator = self.creator.clone();
        self.credit(&creator, to_creator);
        emit(
            "sell",
            json!({"account": seller, "meme_in": amount, "usdc_out": U128(net)}),
        );
        self.payout(seller, net)
    }

    /// Withdraws USDC credited to the caller (creator fees, failed payouts).
    pub fn claim_usdc(&mut self) -> Promise {
        let account = env::predecessor_account_id();
        let amount = self.claimable.remove(&account).unwrap_or(0);
        require!(amount > 0, "Nothing to claim");
        self.payout(account, amount)
    }

    #[private]
    pub fn on_payout(&mut self, account: AccountId, amount: U128) {
        if !near_sdk::is_promise_success() {
            self.credit(&account, amount.0);
            emit(
                "payout_failed",
                json!({"account": account, "amount": amount}),
            );
        }
    }

    pub fn get_pool(&self) -> PoolView {
        PoolView {
            meme_reserve: U128(self.meme_reserve()),
            usdc_reserve: U128(self.usdc_reserve),
            treasury_usdc: U128(self.treasury_usdc),
            spot_price: U128(self.spot_price()),
            twap_price: self.twap_price().map(U128),
        }
    }

    pub fn claimable_of(&self, account_id: AccountId) -> U128 {
        U128(self.claimable.get(&account_id).copied().unwrap_or(0))
    }

    /// Meme received for `usdc_in`, after fees.
    pub fn quote_buy(&self, usdc_in: U128) -> U128 {
        let (_, _, net) = split_fee(usdc_in.0, &self.params);
        U128(amount_out(net, self.usdc_reserve, self.meme_reserve()))
    }

    /// USDC received for `meme_in`, after fees.
    pub fn quote_sell(&self, meme_in: U128) -> U128 {
        let gross = amount_out(meme_in.0, self.meme_reserve(), self.usdc_reserve);
        U128(split_fee(gross, &self.params).2)
    }
}

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;
    use crate::INITIAL_SUPPLY;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, PromiseOrValue};

    const USDC: u128 = 1_000_000; // 6 decimals

    fn ctx(predecessor: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("nvda.solidon.near".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .build());
    }

    /// Meme with 1,000 USDC seeded by the creator (accounts(1) = "bob").
    fn seeded() -> Meme {
        ctx("factory.near", 0);
        let mut m = crate::test_meme(accounts(1));
        m.token.internal_register_account(&accounts(2));
        ctx("usdc.near", 0);
        m.ft_on_transfer(
            accounts(1),
            U128(1_000 * USDC),
            r#"{"action":"seed"}"#.into(),
        );
        m
    }

    fn k(m: &Meme) -> U256 {
        U256::from(m.meme_reserve()) * U256::from(m.usdc_reserve)
    }

    #[test]
    fn twap_follows_reserves_after_the_window() {
        let mut m = seeded(); // seeded at t = 0
        let seed_price = m.spot_price();
        assert!(m.get_pool().twap_price.is_none());
        // Buy 100 USDC at t = 20 min, read at t = 30 min.
        testing_env!(VMContextBuilder::new()
            .current_account_id("nvda.solidon.near".parse().unwrap())
            .predecessor_account_id("usdc.near".parse().unwrap())
            .block_timestamp(1_200 * 1_000_000_000)
            .build());
        m.ft_on_transfer(
            accounts(2),
            U128(100 * USDC),
            r#"{"action":"buy","min_out":"1"}"#.into(),
        );
        let after = m.spot_price();
        testing_env!(VMContextBuilder::new()
            .current_account_id("nvda.solidon.near".parse().unwrap())
            .block_timestamp(1_800 * 1_000_000_000)
            .build());
        let twap = m.get_pool().twap_price.unwrap().0;
        assert_eq!(twap, (seed_price * 1_200 + after * 600) / 1_800);
        assert!(seed_price < twap && twap < after);
    }

    #[test]
    fn math_helpers() {
        assert_eq!(amount_out(100, 1_000, 1_000), 90); // 100_000 / 1_100 = 90.9 -> 90
        assert_eq!(mul_div(u128::MAX, 2, 4), u128::MAX / 2);
        let (t, c, n) = split_fee(10_000, &Params::default());
        assert_eq!((t, c, n), (80, 20, 9_900));
    }

    #[test]
    fn buy_moves_reserves_and_splits_fee() {
        let mut m = seeded();
        let k0 = k(&m);
        let quote = m.quote_buy(U128(100 * USDC)).0;
        ctx("usdc.near", 0);
        let r = m.ft_on_transfer(
            accounts(2),
            U128(100 * USDC),
            r#"{"action":"buy","min_out":"1"}"#.into(),
        );
        assert!(matches!(r, PromiseOrValue::Value(U128(0))));

        assert_eq!(m.ft_balance_of(accounts(2)).0, quote);
        assert_eq!(m.usdc_reserve, 1_000 * USDC + 99 * USDC);
        assert_eq!(m.treasury_usdc, 800_000); // 0.8 USDC
        assert_eq!(m.claimable_of(accounts(1)).0, 200_000); // 0.2 USDC
        assert_eq!(m.meme_reserve(), INITIAL_SUPPLY - quote);
        assert!(k(&m) >= k0);
    }

    #[test]
    #[should_panic(expected = "Slippage")]
    fn buy_below_min_out_panics_so_usdc_is_refunded() {
        let mut m = seeded();
        let quote = m.quote_buy(U128(100 * USDC)).0;
        ctx("usdc.near", 0);
        let msg = format!(r#"{{"action":"buy","min_out":"{}"}}"#, quote + 1);
        m.ft_on_transfer(accounts(2), U128(100 * USDC), msg);
    }

    #[test]
    #[should_panic(expected = "Only the USDC token")]
    fn rejects_other_tokens() {
        let mut m = seeded();
        ctx("fake-usdc.near", 0);
        m.ft_on_transfer(
            accounts(2),
            U128(USDC),
            r#"{"action":"buy","min_out":"0"}"#.into(),
        );
    }

    #[test]
    #[should_panic(expected = "already seeded")]
    fn seed_only_once() {
        let mut m = seeded();
        ctx("usdc.near", 0);
        m.ft_on_transfer(accounts(1), U128(USDC), r#"{"action":"seed"}"#.into());
    }

    #[test]
    #[should_panic(expected = "Only the creator")]
    fn only_creator_seeds() {
        ctx("factory.near", 0);
        let mut m = crate::test_meme(accounts(1));
        ctx("usdc.near", 0);
        m.ft_on_transfer(accounts(2), U128(USDC), r#"{"action":"seed"}"#.into());
    }

    #[test]
    fn round_trip_loses_only_fees_and_k_grows() {
        let mut m = seeded();
        ctx("usdc.near", 0);
        m.ft_on_transfer(
            accounts(2),
            U128(100 * USDC),
            r#"{"action":"buy","min_out":"1"}"#.into(),
        );
        let bought = m.ft_balance_of(accounts(2)).0;
        let k1 = k(&m);
        let quote = m.quote_sell(U128(bought)).0;

        ctx(accounts(2).as_str(), 1);
        m.sell(U128(bought), U128(quote));
        assert_eq!(m.ft_balance_of(accounts(2)).0, 0);
        assert!(k(&m) >= k1);
        // 100 USDC in -> ~98 USDC out: two 1% fees, no free value.
        assert!(
            quote < 100 * USDC * 99 / 100 && quote > 97 * USDC,
            "quote {quote}"
        );
        assert!(m.treasury_usdc > 800_000, "sell fee reaches the treasury");
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn sell_requires_one_yocto() {
        let mut m = seeded();
        ctx(accounts(2).as_str(), 0);
        m.sell(U128(1), U128(0));
    }

    #[test]
    fn failed_payout_becomes_claimable() {
        let mut m = seeded();
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("nvda.solidon.near".parse().unwrap())
                .predecessor_account_id("nvda.solidon.near".parse().unwrap())
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![near_sdk::PromiseResult::Failed],
        );
        m.on_payout(accounts(2), U128(5 * USDC));
        assert_eq!(m.claimable_of(accounts(2)).0, 5 * USDC);
    }
}
