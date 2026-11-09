//! The mNAV engine: issuance above 2.0x, buyback below 1.0x, redemption window
//! below 0.9x. Rules from docs/SPEC.md as amended by finding #12, and the same
//! arithmetic as simulation/sim.py.
//!
//! NAV per token = (stock on every chain * oracle price + USDC on every chain + NEAR
//! treasury USDC) / circulating,
//! circulating = total supply - pool inventory (+ tokens burned by a redemption
//! still waiting for its price). mNAV = 30-minute TWAP / NAV per token.

use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::FungibleTokenCore;
use near_sdk::json_types::{I64, U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, Gas, Promise, PromiseError,
};

use crate::pool::{amount_out, emit, mul_div, now_secs, U256};
use crate::twap::PRICE_SCALE;
use crate::{Meme, MemeExt};

pub const USDC_DECIMALS: u32 = 6;
const BPS: u128 = 10_000;
const GAS_PYTH: Gas = Gas::from_tgas(10);
const GAS_ON_PRICE: Gas = Gas::from_tgas(60);

/// Price as returned by the Pyth NEAR receiver (`pyth-oracle.near`).
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PythPrice {
    pub price: I64,
    pub conf: U64,
    pub expo: i32,
    pub publish_time: i64,
}

#[allow(dead_code)] // only used through the generated `ext_pyth`
#[ext_contract(ext_pyth)]
pub trait Pyth {
    fn get_price_no_older_than(&self, price_id: String, age: u64) -> Option<PythPrice>;
}

/// Engine state. Stock holdings live per chain in the treasury ledger.
#[near(serializers = [borsh])]
#[derive(Default)]
pub struct Engine {
    pub redemption_open: bool,
    pub last_rebalance: u64,
    pub epoch_start: u64,
    pub epoch_cap: u128,
    pub epoch_issued: u128,
    pub pending_redeem: u128,
    pub last_nav: u128,
    pub last_mnav_bps: u128,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    /// Called again before the 1-hour cooldown ended (no state change).
    Cooldown,
    /// No Pyth price within 15 minutes (no state change, cooldown not consumed).
    StalePrice,
    /// Pool younger than the TWAP window, or nothing circulating (cooldown not consumed).
    NoMarket,
    Issued {
        meme: U128,
        usdc: U128,
    },
    BoughtBack {
        meme: U128,
        usdc: U128,
    },
    /// mNAV inside the free band, or the action was capped to zero.
    NoAction,
}

#[near(serializers = [json])]
pub struct TreasuryView {
    /// Shares held across all chains, normalised to 18 decimals; per-chain raw
    /// balances are in `get_treasury_chains`.
    pub stock_units: U128,
    pub treasury_usdc: U128,
    pub circulating: U128,
    pub redemption_open: bool,
    pub last_rebalance: u64,
    pub next_rebalance: u64,
    /// NAV per token at the last rebalance, USDC raw per meme raw scaled by 1e30.
    pub last_nav: U128,
    pub last_mnav_bps: U128,
    pub epoch_cap: U128,
    pub epoch_issued: U128,
}

/// Value of `units` of a stock with `decimals`, in USDC raw units. `None` for a
/// price the engine refuses to use (non-positive, or an exponent outside [-18, 0]).
pub fn stock_value(units: u128, p: &PythPrice, decimals: u8) -> Option<u128> {
    if p.price.0 <= 0 || !(-18..=0).contains(&p.expo) {
        return None;
    }
    let scale = 10u128.pow(decimals as u32 + p.expo.unsigned_abs());
    Some(mul_div(
        units,
        p.price.0 as u128 * 10u128.pow(USDC_DECIMALS),
        scale,
    ))
}

fn isqrt(x: U256) -> u128 {
    x.integer_sqrt().as_u128()
}

impl Meme {
    pub(crate) fn circulating(&self) -> u128 {
        self.token.ft_total_supply().0 + self.engine.pending_redeem - self.meme_reserve()
    }

    /// Treasury value in USDC raw units (6 decimals) at price `p`: NEAR cash, plus USDC
    /// and stock on every chain. One price values the stock on every chain.
    pub(crate) fn assets(&self, p: &PythPrice) -> Option<u128> {
        let mut total = self.treasury_usdc;
        for (c, s) in self.chains.evm.iter().zip(&self.treasury.chains) {
            total += s.usdc / 10u128.pow(u32::from(c.usdc_decimals) - USDC_DECIMALS);
        }
        for v in &self.stock.venues {
            let units = self.treasury.chains[self.chain_index(&v.chain)].stock;
            total += stock_value(units, p, v.decimals)?;
        }
        Some(total)
    }

    /// Shares held across all chains, at 18 decimals.
    fn stock_units(&self) -> u128 {
        self.stock
            .venues
            .iter()
            .map(|v| {
                self.treasury.chains[self.chain_index(&v.chain)].stock
                    * 10u128.pow(18 - u32::from(v.decimals))
            })
            .sum()
    }

    /// NAV per token (scaled by 1e30) at price `p`, with `extra` tokens counted as circulating.
    fn nav(&self, p: &PythPrice, extra: u128) -> Option<u128> {
        let circ = self.circulating() + extra;
        let assets = self.assets(p)?;
        (circ > 0 && assets > 0).then(|| mul_div(assets, PRICE_SCALE, circ))
    }

    pub(crate) fn read_price(&self) -> ext_pyth::PythExt {
        ext_pyth::ext(self.oracle.clone()).with_static_gas(GAS_PYTH)
    }

    fn cooldown_over(&self, now: u64) -> bool {
        self.engine.last_rebalance == 0
            || now >= self.engine.last_rebalance + self.params.rebalance_cooldown_secs
    }

    /// Sells just enough new tokens into the pool to bring spot to 2.0x NAV,
    /// capped by the epoch, and only if every new token is sold at or above NAV.
    fn issue(&mut self, nav: u128) -> Outcome {
        let (m, u) = (self.meme_reserve(), self.usdc_reserve);
        let target_price = mul_div(nav, self.params.issuance_mnav_bps.into(), BPS);
        let target_m = isqrt(
            U256::from(m) * U256::from(u) * U256::from(PRICE_SCALE) / U256::from(target_price),
        );
        let room = self.engine.epoch_cap - self.engine.epoch_issued;
        let q = target_m.saturating_sub(m).min(room);
        if q == 0 {
            return Outcome::NoAction;
        }
        let proceeds = amount_out(q, m, u);
        // Accretion: (V + proceeds) / (C + q) >= V / C  <=>  proceeds / q >= NAV.
        if mul_div(proceeds, PRICE_SCALE, q) < nav {
            return Outcome::NoAction;
        }
        let pool = env::current_account_id();
        self.token.internal_deposit(&pool, q);
        FtMint {
            owner_id: &pool,
            amount: U128(q),
            memo: Some("issuance"),
        }
        .emit();
        self.usdc_reserve -= proceeds;
        self.treasury_usdc += proceeds;
        self.engine.epoch_issued += q;
        self.observe_price();
        Outcome::Issued {
            meme: U128(q),
            usdc: U128(proceeds),
        }
    }

    /// Lifts spot toward NAV with cash above the 20% buffer only, and burns what
    /// it buys. Never sells stock to fund a buyback (finding #12).
    fn buy_back(&mut self, nav: u128, assets: u128) -> Outcome {
        let (m, u) = (self.meme_reserve(), self.usdc_reserve);
        let target_u =
            isqrt(U256::from(m) * U256::from(u) * U256::from(nav) / U256::from(PRICE_SCALE));
        let buffer = mul_div(assets, self.params.cash_buffer_bps.into(), BPS);
        let spend = target_u
            .saturating_sub(u)
            .min(self.treasury_usdc.saturating_sub(buffer));
        let out = if spend > 0 {
            amount_out(spend, u, m)
        } else {
            0
        };
        if out == 0 {
            return Outcome::NoAction;
        }
        let pool = env::current_account_id();
        self.token.internal_withdraw(&pool, out);
        FtBurn {
            owner_id: &pool,
            amount: U128(out),
            memo: Some("buyback"),
        }
        .emit();
        self.usdc_reserve += spend;
        self.treasury_usdc -= spend;
        self.observe_price();
        Outcome::BoughtBack {
            meme: U128(out),
            usdc: U128(spend),
        }
    }

    /// One mNAV evaluation at price `p`, at time `now`. Pure state transition, no promises.
    pub(crate) fn evaluate(
        &mut self,
        p: Option<PythPrice>,
        now: u64,
        caller: &AccountId,
    ) -> Outcome {
        if !self.cooldown_over(now) {
            return Outcome::Cooldown;
        }
        let Some(p) = p else {
            return Outcome::StalePrice;
        };
        let (Some(twap), Some(nav), Some(assets)) =
            (self.twap_price(), self.nav(&p, 0), self.assets(&p))
        else {
            return Outcome::NoMarket;
        };
        self.engine.last_rebalance = now;
        let mnav_bps = mul_div(twap, BPS, nav);
        self.engine.last_nav = nav;
        self.engine.last_mnav_bps = mnav_bps;
        self.engine.redemption_open = mnav_bps < self.params.redemption_mnav_bps.into();
        if now >= self.engine.epoch_start + self.params.epoch_secs || self.engine.epoch_cap == 0 {
            self.engine.epoch_start = now;
            self.engine.epoch_issued = 0;
            self.engine.epoch_cap = mul_div(
                self.circulating(),
                self.params.max_issuance_bps_per_epoch.into(),
                BPS,
            );
        }

        let outcome = if mnav_bps > self.params.issuance_mnav_bps.into() {
            self.issue(nav)
        } else if mnav_bps < self.params.buyback_mnav_bps.into() {
            self.buy_back(nav, assets)
        } else {
            Outcome::NoAction
        };

        let value = match &outcome {
            Outcome::Issued { usdc, .. } | Outcome::BoughtBack { usdc, .. } => usdc.0,
            _ => 0,
        };
        let tip = mul_div(value, self.params.caller_tip_bps.into(), BPS).min(self.treasury_usdc);
        self.treasury_usdc -= tip;
        self.credit(caller, tip);
        emit(
            "rebalance",
            json!({"caller": caller, "mnav_bps": U128(mnav_bps), "nav": U128(nav), "twap": U128(twap),
                   "redemption_open": self.engine.redemption_open, "outcome": &outcome, "tip": U128(tip)}),
        );
        outcome
    }

    /// Settles a redemption of `amount` tokens (already burned) at price `p`.
    /// Returns the USDC owed, or `None` to refund the tokens.
    pub(crate) fn settle_redeem(
        &mut self,
        amount: u128,
        min_usdc: u128,
        p: Option<PythPrice>,
    ) -> Option<u128> {
        self.engine.pending_redeem -= amount;
        let nav = self.nav(&p?, amount)?;
        let usdc = mul_div(amount, nav, PRICE_SCALE);
        (self.engine.redemption_open && usdc >= min_usdc && usdc > 0 && usdc <= self.treasury_usdc)
            .then(|| {
                self.treasury_usdc -= usdc;
                usdc
            })
    }
}

#[near]
impl Meme {
    /// Runs the mNAV engine. Anyone can call it once per cooldown; attach 100 TGas.
    pub fn rebalance(&mut self) -> Promise {
        require!(
            self.cooldown_over(now_secs()),
            "Rebalance cooldown has not ended"
        );
        self.read_price()
            .get_price_no_older_than(self.stock.price_id.clone(), self.params.oracle_max_age_secs)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_PRICE)
                    .on_rebalance_price(env::predecessor_account_id()),
            )
    }

    #[private]
    pub fn on_rebalance_price(
        &mut self,
        caller: AccountId,
        #[callback_result] price: Result<Option<PythPrice>, PromiseError>,
    ) -> Outcome {
        self.evaluate(price.ok().flatten(), now_secs(), &caller)
    }

    /// Burns `amount` and pays NAV per token in USDC from treasury cash, while the
    /// redemption window is open. Reads a fresh Pyth price; on any failure the
    /// tokens are returned. Requires 1 yoctoNEAR; attach 100 TGas.
    #[payable]
    pub fn redeem(&mut self, amount: U128, min_usdc: U128) -> Promise {
        assert_one_yocto();
        require!(self.engine.redemption_open, "Redemption window is closed");
        require!(amount.0 > 0, "Amount must be positive");
        let account = env::predecessor_account_id();
        self.token.internal_withdraw(&account, amount.0);
        self.engine.pending_redeem += amount.0;
        self.read_price()
            .get_price_no_older_than(self.stock.price_id.clone(), self.params.oracle_max_age_secs)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_PRICE)
                    .on_redeem_price(account, amount, min_usdc),
            )
    }

    /// The tokens are already burned, so this must never panic on the oracle's
    /// response: it reads the raw result and refunds on anything unexpected.
    #[private]
    pub fn on_redeem_price(&mut self, account: AccountId, amount: U128, min_usdc: U128) -> U128 {
        let price = env::promise_result_checked(0, 1024)
            .ok()
            .and_then(|bytes| near_sdk::serde_json::from_slice::<Option<PythPrice>>(&bytes).ok())
            .flatten();
        self.finish_redeem(account, amount, min_usdc, price)
    }
}

impl Meme {
    pub(crate) fn finish_redeem(
        &mut self,
        account: AccountId,
        amount: U128,
        min_usdc: U128,
        price: Option<PythPrice>,
    ) -> U128 {
        match self.settle_redeem(amount.0, min_usdc.0, price) {
            Some(usdc) => {
                FtBurn {
                    owner_id: &account,
                    amount,
                    memo: Some("redeem"),
                }
                .emit();
                emit(
                    "redeem",
                    json!({"account": account, "meme_in": amount, "usdc_out": U128(usdc)}),
                );
                self.payout(account, usdc).detach();
                U128(usdc)
            }
            None => {
                self.token.internal_deposit(&account, amount.0);
                emit(
                    "redeem_refunded",
                    json!({"account": account, "meme": amount}),
                );
                U128(0)
            }
        }
    }
}

#[near]
impl Meme {
    pub fn get_treasury(&self) -> TreasuryView {
        TreasuryView {
            stock_units: U128(self.stock_units()),
            treasury_usdc: U128(self.treasury_usdc),
            circulating: U128(self.circulating()),
            redemption_open: self.engine.redemption_open,
            last_rebalance: self.engine.last_rebalance,
            next_rebalance: self.engine.last_rebalance + self.params.rebalance_cooldown_secs,
            last_nav: U128(self.engine.last_nav),
            last_mnav_bps: U128(self.engine.last_mnav_bps),
            epoch_cap: U128(self.engine.epoch_cap),
            epoch_issued: U128(self.engine.epoch_issued),
        }
    }
}

#[cfg(test)]
#[allow(unused_must_use)]
mod tests {
    use super::*;
    use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};

    const USDC: u128 = 1_000_000;
    const HOUR: u64 = 3_600;
    /// Indexes into `crate::test_chains()`: Base (USDC 6 dp, NVDA 8 dp) and Robinhood
    /// (USDC 18 dp, NVDA 18 dp).
    const BASE: usize = 0;
    const ROBINHOOD: usize = 1;

    fn at(secs: u64, predecessor: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("nvda.solidon.near".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(secs * 1_000_000_000)
            .build());
    }

    /// NVDA at $180.00, Pyth style (expo -8).
    fn price(secs: u64) -> Option<PythPrice> {
        Some(PythPrice {
            price: I64(18_000_000_000),
            conf: U64(0),
            expo: -8,
            publish_time: secs as i64,
        })
    }

    /// Seeded with 1,000 USDC at t=0, charlie (accounts(2)) bought with 100 USDC at t=0.
    /// Returns the meme at t=1h (TWAP ready). mNAV is huge: treasury holds 0.8 USDC of fees.
    fn market() -> Meme {
        at(0, "factory.near", 0);
        let mut m = crate::test_meme(accounts(1));
        m.token.internal_register_account(&accounts(2));
        at(0, "usdc.near", 0);
        m.ft_on_transfer(
            accounts(1),
            U128(1_000 * USDC),
            r#"{"action":"seed"}"#.into(),
        );
        m.ft_on_transfer(
            accounts(2),
            U128(100 * USDC),
            r#"{"action":"buy","min_out":"1"}"#.into(),
        );
        at(HOUR, "keeper.near", 0);
        m
    }

    fn nav(m: &Meme, extra: u128) -> u128 {
        m.nav(&price(0).unwrap(), extra).unwrap()
    }

    #[test]
    fn stock_value_math() {
        // 2 units (18 decimals) at $180.00 = 360 USDC.
        let v = stock_value(2 * 10u128.pow(18), &price(0).unwrap(), 18);
        assert_eq!(v, Some(360 * USDC));
        let mut bad = price(0).unwrap();
        bad.price = I64(-1);
        assert_eq!(stock_value(1, &bad, 18), None);
        bad.price = I64(1);
        bad.expo = 2;
        assert_eq!(stock_value(1, &bad, 18), None);
    }

    #[test]
    fn nav_sums_every_chain_at_one_price() {
        let mut m = market();
        let p = price(0).unwrap();
        let cash = m.treasury_usdc;
        m.treasury.chains[BASE].stock = 10u128.pow(8); // 1 NVDA, 8 dp: $180
        m.treasury.chains[ROBINHOOD].stock = 2 * 10u128.pow(18); // 2 NVDA, 18 dp: $360
        m.treasury.chains[BASE].usdc = 5 * USDC; // 6 dp
        m.treasury.chains[ROBINHOOD].usdc = 7 * 10u128.pow(18); // 18 dp
        assert_eq!(m.assets(&p), Some(cash + 552 * USDC));
        assert_eq!(m.get_treasury().stock_units, U128(3 * 10u128.pow(18)));
        assert_eq!(
            nav(&m, 0),
            mul_div(cash + 552 * USDC, PRICE_SCALE, m.circulating())
        );
        // A price the engine refuses values nothing, on every chain.
        let mut bad = p;
        bad.price = I64(0);
        assert_eq!(m.assets(&bad), None);
    }

    #[test]
    fn stale_price_or_young_pool_does_nothing_and_keeps_the_cooldown() {
        let mut m = market();
        assert_eq!(m.evaluate(None, HOUR, &accounts(3)), Outcome::StalePrice);
        assert_eq!(m.engine.last_rebalance, 0);
        at(10, "keeper.near", 0); // TWAP needs 30 minutes of history
        assert_eq!(m.evaluate(price(10), 10, &accounts(3)), Outcome::NoMarket);
        assert_eq!(m.engine.last_rebalance, 0);
    }

    #[test]
    fn issuance_is_accretive_capped_and_tipped() {
        let mut m = market();
        let circ = m.circulating();
        let supply = m.token.ft_total_supply().0;
        let nav_before = nav(&m, 0);
        let treasury_before = m.treasury_usdc;

        let Outcome::Issued { meme: q, usdc } = m.evaluate(price(HOUR), HOUR, &accounts(3)) else {
            panic!("expected issuance at mNAV {}", m.engine.last_mnav_bps)
        };
        assert!(m.engine.last_mnav_bps > 20_000);
        assert_eq!(q.0, circ / 100, "capped at 1% of circulating supply");
        assert_eq!(m.token.ft_total_supply().0, supply + q.0);
        assert_eq!(m.circulating(), circ, "new tokens sit in the pool");
        // Accretive: NAV per token, counting the new tokens as circulating, did not fall.
        assert!(nav(&m, q.0) >= nav_before);
        let tip = usdc.0 * 5 / 10_000;
        assert_eq!(m.claimable_of(accounts(3)).0, tip);
        assert_eq!(m.treasury_usdc, treasury_before + usdc.0 - tip);

        // Cooldown, then the epoch cap holds for the rest of the day.
        assert_eq!(
            m.evaluate(price(HOUR), HOUR + 10, &accounts(3)),
            Outcome::Cooldown
        );
        for h in 2..24 {
            at(h * HOUR, "keeper.near", 0);
            assert_eq!(
                m.evaluate(price(h * HOUR), h * HOUR, &accounts(3)),
                Outcome::NoAction
            );
        }
        assert_eq!(m.engine.epoch_issued, circ / 100);
        // A new epoch after 24 hours.
        at(25 * HOUR, "keeper.near", 0);
        assert!(matches!(
            m.evaluate(price(25 * HOUR), 25 * HOUR, &accounts(3)),
            Outcome::Issued { .. }
        ));
    }

    #[test]
    fn free_band_does_nothing() {
        let mut m = market();
        // Put the treasury at ~1.5x below market value: mNAV ~1.5.
        let mcap = mul_div(m.twap_price().unwrap(), m.circulating(), PRICE_SCALE);
        m.treasury_usdc = mcap * 2 / 3;
        assert_eq!(
            m.evaluate(price(HOUR), HOUR, &accounts(3)),
            Outcome::NoAction
        );
        assert!((14_000..16_000).contains(&m.engine.last_mnav_bps));
        assert!(!m.engine.redemption_open);
    }

    #[test]
    fn buyback_spends_only_cash_above_the_buffer_and_opens_redemption() {
        let mut m = market();
        m.treasury_usdc = 1_000 * USDC; // far above market value: mNAV ~0.1
        let supply = m.token.ft_total_supply().0;
        let Outcome::BoughtBack { meme, usdc } = m.evaluate(price(HOUR), HOUR, &accounts(3)) else {
            panic!("expected buyback")
        };
        assert!(m.engine.redemption_open);
        assert_eq!(
            usdc.0,
            800 * USDC,
            "spends down to the 20% buffer, no further"
        );
        assert_eq!(m.treasury_usdc + m.claimable_of(accounts(3)).0, 200 * USDC);
        assert_eq!(
            m.token.ft_total_supply().0,
            supply - meme.0,
            "bought tokens are burned"
        );
    }

    #[test]
    fn redemption_pays_nav_per_token_and_refunds_on_failure() {
        let mut m = market();
        m.treasury.chains[ROBINHOOD].stock = 10u128.pow(18); // 1 NVDA = $180
        m.treasury_usdc = 100 * USDC;
        m.evaluate(price(HOUR), HOUR, &accounts(3));
        assert!(m.engine.redemption_open);

        let held = m.ft_balance_of(accounts(2)).0;
        let amount = held / 10; // ~$24, below the ~$56 of cash left after the buyback
        let nav0 = nav(&m, 0);
        let cash0 = m.treasury_usdc;

        // Closed min_usdc: refund, nothing paid.
        at(HOUR + 60, accounts(2).as_str(), 1);
        m.redeem(U128(amount), U128(u128::MAX));
        assert_eq!(m.ft_balance_of(accounts(2)).0, held - amount);
        at(HOUR + 60, "nvda.solidon.near", 0);
        assert_eq!(
            m.finish_redeem(accounts(2), U128(amount), U128(u128::MAX), price(HOUR))
                .0,
            0
        );
        assert_eq!(m.ft_balance_of(accounts(2)).0, held, "tokens returned");
        assert_eq!(m.engine.pending_redeem, 0);

        // Stale price: refund too.
        at(HOUR + 60, accounts(2).as_str(), 1);
        m.redeem(U128(amount), U128(0));
        at(HOUR + 60, "nvda.solidon.near", 0);
        assert_eq!(
            m.finish_redeem(accounts(2), U128(amount), U128(0), None).0,
            0
        );
        assert_eq!(m.ft_balance_of(accounts(2)).0, held);

        // Success: exactly amount * NAV, NAV per token for the others unchanged.
        at(HOUR + 60, accounts(2).as_str(), 1);
        m.redeem(U128(amount), U128(0));
        at(HOUR + 60, "nvda.solidon.near", 0);
        let paid = m
            .finish_redeem(accounts(2), U128(amount), U128(0), price(HOUR))
            .0;
        assert_eq!(paid, mul_div(amount, nav0, PRICE_SCALE));
        assert_eq!(m.treasury_usdc, cash0 - paid);
        assert_eq!(m.ft_balance_of(accounts(2)).0, held - amount);
        let nav1 = nav(&m, 0);
        assert!(
            nav1 >= nav0 && nav1 - nav0 <= nav0 / 1_000_000,
            "{nav0} -> {nav1}"
        );
    }

    #[test]
    fn a_malformed_oracle_response_refunds_instead_of_panicking() {
        let mut m = market();
        m.treasury.chains[ROBINHOOD].stock = 10u128.pow(18);
        m.treasury_usdc = 100 * USDC;
        m.evaluate(price(HOUR), HOUR, &accounts(3));
        let held = m.ft_balance_of(accounts(2)).0;
        at(HOUR + 60, accounts(2).as_str(), 1);
        m.redeem(U128(held / 10), U128(0));
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("nvda.solidon.near".parse().unwrap())
                .predecessor_account_id("nvda.solidon.near".parse().unwrap())
                .block_timestamp((HOUR + 60) * 1_000_000_000)
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![near_sdk::PromiseResult::Successful(
                b"{\"price\": 42".to_vec()
            )],
        );
        assert_eq!(
            m.on_redeem_price(accounts(2), U128(held / 10), U128(0)).0,
            0
        );
        assert_eq!(m.ft_balance_of(accounts(2)).0, held, "tokens returned");
        assert_eq!(m.engine.pending_redeem, 0);
    }

    #[test]
    #[should_panic(expected = "Redemption window is closed")]
    fn redeem_needs_an_open_window() {
        let mut m = market();
        at(HOUR, accounts(2).as_str(), 1);
        m.redeem(U128(1), U128(0));
    }

    #[test]
    fn redemption_cannot_pay_more_than_cash() {
        let mut m = market();
        m.treasury.chains[ROBINHOOD].stock = 10u128.pow(20); // $18,000 of stock, almost no cash
        m.treasury_usdc = USDC;
        m.evaluate(price(HOUR), HOUR, &accounts(3));
        assert!(m.engine.redemption_open);
        let held = m.ft_balance_of(accounts(2)).0;
        at(HOUR + 60, accounts(2).as_str(), 1);
        m.redeem(U128(held), U128(0));
        at(HOUR + 60, "nvda.solidon.near", 0);
        assert_eq!(
            m.finish_redeem(accounts(2), U128(held), U128(0), price(HOUR))
                .0,
            0
        );
        assert_eq!(
            m.ft_balance_of(accounts(2)).0,
            held,
            "refunded, cash untouched"
        );
        assert_eq!(m.treasury_usdc, USDC);
    }
}
