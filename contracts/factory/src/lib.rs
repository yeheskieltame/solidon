//! Solidon factory: anyone launches a meme as `<symbol>.<factory>`.
//!
//! The factory has no owner. It fixes the USDC token at init so a creator
//! cannot launch a meme against a fake stablecoin.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::IterableSet;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};

/// Built by `contracts/build.sh` before the factory.
// ponytail: each launch stores its own copy of the code (~2.5 NEAR). Switch to
// a NEAR global contract (deploy once, `use_global_contract`) if launch cost matters.
const MEME_WASM: &[u8] = include_bytes!("../../target/near/meme/meme.wasm");

const GAS_MEME_NEW: Gas = Gas::from_tgas(30);
const GAS_ON_CREATE: Gas = Gas::from_tgas(10);
/// Bytes reserved for the meme's own state on top of its code.
const STATE_BYTES: u128 = 20_000;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    usdc: AccountId,
    memes: IterableSet<AccountId>,
}

#[near]
impl Factory {
    #[init]
    pub fn new(usdc: AccountId) -> Self {
        Self {
            usdc,
            memes: IterableSet::new(b"m"),
        }
    }

    /// NEAR a creator must attach to `create_meme` to pay for the meme's storage.
    pub fn launch_cost(&self) -> U128 {
        U128(
            env::storage_byte_cost()
                .saturating_mul(MEME_WASM.len() as u128 + STATE_BYTES)
                .as_yoctonear(),
        )
    }

    /// Deploys a meme to `<symbol lowercased>.<factory>`. The whole deposit
    /// funds the meme's storage. If the deploy fails, the deposit is refunded.
    #[payable]
    pub fn create_meme(
        &mut self,
        name: String,
        symbol: String,
        thesis_stock: String,
        icon: Option<String>,
    ) -> Promise {
        require!(
            (2..=10).contains(&symbol.len()) && symbol.bytes().all(|b| b.is_ascii_alphanumeric()),
            "Symbol must be 2-10 ASCII letters or digits"
        );
        let deposit = env::attached_deposit();
        require!(
            deposit.as_yoctonear() >= self.launch_cost().0,
            "Attach at least launch_cost() yoctoNEAR"
        );
        let meme: AccountId = format!("{}.{}", symbol.to_lowercase(), env::current_account_id())
            .parse()
            .unwrap();
        require!(!self.memes.contains(&meme), "Symbol already launched");

        let creator = env::predecessor_account_id();
        let args = json!({
            "creator": creator, "usdc": self.usdc, "name": name,
            "symbol": symbol, "thesis_stock": thesis_stock, "icon": icon,
        });
        Promise::new(meme.clone())
            .create_account()
            .transfer(deposit)
            .deploy_contract(MEME_WASM.to_vec())
            .function_call(
                "new",
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_MEME_NEW,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_CREATE)
                    .on_create(meme, creator, U128(deposit.as_yoctonear())),
            )
    }

    #[private]
    pub fn on_create(&mut self, meme: AccountId, creator: AccountId, deposit: U128) -> bool {
        if near_sdk::is_promise_success() {
            self.memes.insert(meme.clone());
            env::log_str(&format!(
                "EVENT_JSON:{}",
                json!({"standard": "solidon", "version": "1.0.0", "event": "launch",
                       "data": [{"meme": meme, "creator": creator}]})
            ));
            true
        } else {
            // A failed batch returns the deposit to the factory; pass it back.
            Promise::new(creator)
                .transfer(NearToken::from_yoctonear(deposit.0))
                .detach();
            false
        }
    }

    pub fn get_memes(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<AccountId> {
        self.memes
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50) as usize)
            .cloned()
            .collect()
    }

    pub fn get_usdc(&self) -> AccountId {
        self.usdc.clone()
    }
}
