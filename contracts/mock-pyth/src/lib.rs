//! Test-only stand-in for `pyth-oracle.near`. Anyone can set a price.
//! Read methods and their staleness rule match the Pyth NEAR receiver
//! (pyth-network/pyth-crosschain, target_chains/near/receiver). Never use on mainnet.

use near_sdk::json_types::{I64, U64};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, PanicOnDefault};

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Price {
    pub price: I64,
    pub conf: U64,
    pub expo: i32,
    pub publish_time: i64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockPyth {
    prices: LookupMap<String, Price>,
}

#[near]
impl MockPyth {
    #[init]
    pub fn new() -> Self {
        Self {
            prices: LookupMap::new(b"p"),
        }
    }

    /// Sets a price; `publish_time` defaults to the current block time.
    pub fn set_price(
        &mut self,
        price_id: String,
        price: I64,
        expo: i32,
        publish_time: Option<i64>,
    ) {
        let publish_time = publish_time.unwrap_or((env::block_timestamp() / 1_000_000_000) as i64);
        self.prices.insert(
            price_id,
            Price {
                price,
                conf: U64(0),
                expo,
                publish_time,
            },
        );
    }

    pub fn get_price_unsafe(&self, price_identifier: String) -> Option<Price> {
        self.prices.get(&price_identifier).cloned()
    }

    pub fn get_price_no_older_than(&self, price_id: String, age: u64) -> Option<Price> {
        let now = env::block_timestamp() / 1_000_000_000;
        self.prices
            .get(&price_id)
            .filter(|p| now.abs_diff(p.publish_time as u64) <= age)
            .cloned()
    }
}
