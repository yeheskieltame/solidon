//! Time-weighted average of the pool price, Uniswap v2 style.
//!
//! The pool calls `observe` after every reserve change. A cumulative sum of
//! `price * seconds` is checkpointed at most every 5 minutes (12 slots, so the
//! buffer always spans at least 55 minutes). `average` returns the mean price
//! since the newest checkpoint that is at least `window` seconds old.

use near_sdk::near;

/// Prices are USDC raw units per meme raw unit, scaled by 1e30.
pub const PRICE_SCALE: u128 = 1_000_000_000_000_000_000_000_000_000_000;
const CHECKPOINT_EVERY_SECS: u64 = 300;
const CHECKPOINTS: usize = 12;

#[near(serializers = [borsh])]
#[derive(Default)]
pub struct Twap {
    /// Sum of `price * seconds` since the pool was seeded. Wraps, like Uniswap v2;
    /// only differences are used.
    cumulative: u128,
    last_ts: u64,
    last_price: u128,
    /// (timestamp, cumulative) pairs, oldest first.
    checkpoints: Vec<(u64, u128)>,
}

impl Twap {
    fn cumulative_at(&self, now: u64) -> u128 {
        let elapsed = now.saturating_sub(self.last_ts) as u128;
        self.cumulative
            .wrapping_add(self.last_price.wrapping_mul(elapsed))
    }

    /// Records that the price is `price` from `now` on.
    pub fn observe(&mut self, now: u64, price: u128) {
        self.cumulative = self.cumulative_at(now);
        self.last_ts = now;
        self.last_price = price;
        let due = self
            .checkpoints
            .last()
            .is_none_or(|(ts, _)| now >= ts + CHECKPOINT_EVERY_SECS);
        if due {
            if self.checkpoints.len() == CHECKPOINTS {
                self.checkpoints.remove(0);
            }
            self.checkpoints.push((now, self.cumulative));
        }
    }

    /// Mean price over at least `window` seconds, or `None` while the pool is younger.
    pub fn average(&self, now: u64, window: u64) -> Option<u128> {
        let (ts, cum) = self
            .checkpoints
            .iter()
            .rev()
            .find(|(ts, _)| *ts + window <= now)?;
        let elapsed = (now - ts) as u128;
        Some(self.cumulative_at(now).wrapping_sub(*cum) / elapsed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINDOW: u64 = 1800;

    #[test]
    fn none_until_the_window_has_passed() {
        let mut t = Twap::default();
        t.observe(1_000, 100);
        assert_eq!(t.average(1_000 + WINDOW - 1, WINDOW), None);
        assert_eq!(t.average(1_000 + WINDOW, WINDOW), Some(100));
    }

    #[test]
    fn time_weighted_mean() {
        let mut t = Twap::default();
        t.observe(0, 100); // 100 for 20 minutes
        t.observe(1_200, 400); // 400 for 10 minutes
        assert_eq!(
            t.average(1_800, WINDOW),
            Some((100 * 1_200 + 400 * 600) / 1_800)
        );
    }

    #[test]
    fn a_last_second_spike_barely_moves_it() {
        let mut t = Twap::default();
        t.observe(0, 100);
        t.observe(1_799, 1_000_000); // manipulator pumps 1 second before the read
        let avg = t.average(1_800, WINDOW).unwrap();
        assert_eq!(avg, (100 * 1_799 + 1_000_000) / 1_800);
        assert!(
            avg < 700,
            "one second of a 10,000x spike moves the TWAP by ~6x at most"
        );
    }

    #[test]
    fn uses_the_newest_old_enough_checkpoint() {
        let mut t = Twap::default();
        for i in 0..20u64 {
            t.observe(i * 600, 100 + i as u128); // a checkpoint every 10 minutes
        }
        assert_eq!(t.checkpoints.len(), CHECKPOINTS);
        // At 19*600 + 1800, the newest checkpoint at least 30 minutes old is at 19*600.
        let now = 19 * 600 + WINDOW;
        assert_eq!(t.average(now, WINDOW), Some(119));
    }

    #[test]
    fn checkpoints_are_spaced() {
        let mut t = Twap::default();
        for s in 0..100 {
            t.observe(s, 1); // one trade per second
        }
        assert_eq!(t.checkpoints.len(), 1, "no new checkpoint within 5 minutes");
    }
}
