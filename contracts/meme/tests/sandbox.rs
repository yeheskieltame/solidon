//! Sandbox test of the pool against a real NEP-141 USDC (mock-ft).
//! Requires the wasm files: run `./build.sh` first.

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;

const USDC: u128 = 1_000_000;

pub fn nvda() -> serde_json::Value {
    json!({"ticker": "NVDA",
           "price_id": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
           "venues": [
               {"chain": "base", "token": "0x8f13563130684478E617C1797308A081Cb2c2654", "decimals": 8},
               {"chain": "robinhood", "token": "0x82289af84B9a0faf598a4D2052E16c8D1619f7f4", "decimals": 18}]})
}

pub fn chains() -> serde_json::Value {
    json!({"mpc": "v1.signer-prod.testnet", "bridge": "keeper.solidon.testnet",
           "relayer": "keeper.solidon.testnet", "evm": [
        {"name": "base", "chain_id": 84532, "usdc": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
         "usdc_decimals": 6, "swap_router": "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
         "pool_fee": 3000, "max_fee_per_gas": "100000000", "max_priority_fee_per_gas": "1000000",
         "max_swap_usdc": "5000000", "proof": {"Mpc": {"foreign_chain": "Base", "finality": "Latest"}}},
        {"name": "robinhood", "chain_id": 46630, "usdc": "0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F",
         "usdc_decimals": 18, "swap_router": "0x3ce954107b1a675826b33bf23060dd655e3758fe",
         "pool_fee": 3000, "max_fee_per_gas": "100000000", "max_priority_fee_per_gas": "10000000",
         "max_swap_usdc": "5000000000000000000", "proof": "Relayer"}]})
}

fn wasm(name: &str) -> Vec<u8> {
    let path = format!(
        "{}/../target/near/{name}/{name}.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    std::fs::read(&path).unwrap_or_else(|_| panic!("{path} missing, run ./build.sh"))
}

async fn balance(token: &Contract, account: &Account) -> u128 {
    let v: String = token
        .view("ft_balance_of")
        .args_json(json!({"account_id": account.id()}))
        .await
        .unwrap()
        .json()
        .unwrap();
    v.parse().unwrap()
}

async fn view_u128(c: &Contract, method: &str, args: serde_json::Value) -> u128 {
    let v: String = c
        .view(method)
        .args_json(args)
        .await
        .unwrap()
        .json()
        .unwrap();
    v.parse().unwrap()
}

async fn ft_call(from: &Account, token: &Contract, to: &Contract, amount: u128, msg: &str) {
    from.call(token.id(), "ft_transfer_call")
        .args_json(json!({"receiver_id": to.id(), "amount": amount.to_string(), "msg": msg}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
}

async fn storage_deposit(from: &Account, token: &Contract, account: &str) {
    from.call(token.id(), "storage_deposit")
        .args_json(json!({"account_id": account}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
}

#[tokio::test]
async fn seed_buy_sell_claim() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let new_account = |name: &'static str| {
        let root = root.clone();
        async move {
            root.create_subaccount(name)
                .initial_balance(NearToken::from_near(20))
                .transact()
                .await
                .unwrap()
                .into_result()
                .unwrap()
        }
    };
    let creator = new_account("creator").await;
    let bob = new_account("bob").await;
    let carol = new_account("carol").await;

    let usdc = new_account("usdc")
        .await
        .deploy(&wasm("mock_ft"))
        .await?
        .into_result()?;
    usdc.call("new")
        .args_json(json!({"name": "USD Coin", "symbol": "USDC", "decimals": 6}))
        .transact()
        .await?
        .into_result()?;

    let meme = new_account("nvda")
        .await
        .deploy(&wasm("meme"))
        .await?
        .into_result()?;
    meme.call("new")
        .args_json(json!({
            "creator": creator.id(), "usdc": usdc.id(), "oracle": "pyth.test.near", "stock": nvda(), "chains": chains(),
            "name": "Nvidia Meme", "symbol": "NVDA", "icon": null
        }))
        .transact()
        .await?
        .into_result()?;

    for a in [&creator, &bob, &carol] {
        a.call(usdc.id(), "mint")
            .args_json(json!({"account_id": a.id(), "amount": (1_000 * USDC).to_string()}))
            .transact()
            .await?
            .into_result()?;
    }
    storage_deposit(&creator, &usdc, meme.id().as_str()).await;
    storage_deposit(&bob, &meme, bob.id().as_str()).await;

    // A second `new` must fail: no re-initialisation, no admin path.
    let again = meme
        .call("new")
        .args_json(json!({
            "creator": bob.id(), "usdc": usdc.id(), "oracle": "pyth.test.near", "stock": nvda(), "chains": chains(),
            "name": "X", "symbol": "X", "icon": null
        }))
        .transact()
        .await?;
    assert!(again.is_failure());

    // Seed: creator provides 1,000 USDC of first liquidity.
    ft_call(&creator, &usdc, &meme, 1_000 * USDC, r#"{"action":"seed"}"#).await;
    assert_eq!(balance(&usdc, meme.as_account()).await, 1_000 * USDC);

    // Buy: bob pays 100 USDC, receives exactly the quote.
    let quote = view_u128(
        &meme,
        "quote_buy",
        json!({"usdc_in": (100 * USDC).to_string()}),
    )
    .await;
    let msg = format!(r#"{{"action":"buy","min_out":"{quote}"}}"#);
    ft_call(&bob, &usdc, &meme, 100 * USDC, &msg).await;
    assert_eq!(balance(&meme, &bob).await, quote);
    assert_eq!(balance(&usdc, &bob).await, 900 * USDC);

    // Buy with an unreachable min_out: bob's USDC is refunded in full.
    let msg = format!(r#"{{"action":"buy","min_out":"{}"}}"#, u128::MAX);
    ft_call(&bob, &usdc, &meme, 50 * USDC, &msg).await;
    assert_eq!(balance(&usdc, &bob).await, 900 * USDC);

    // Buy without a meme storage registration: carol is refunded in full.
    ft_call(
        &carol,
        &usdc,
        &meme,
        50 * USDC,
        r#"{"action":"buy","min_out":"0"}"#,
    )
    .await;
    assert_eq!(balance(&usdc, &carol).await, 1_000 * USDC);

    // Sell everything back: bob receives exactly the quote.
    let out = view_u128(&meme, "quote_sell", json!({"meme_in": quote.to_string()})).await;
    bob.call(meme.id(), "sell")
        .args_json(json!({"amount": quote.to_string(), "min_out": out.to_string()}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(balance(&meme, &bob).await, 0);
    assert_eq!(balance(&usdc, &bob).await, 900 * USDC + out);

    // Creator claims the 0.2% fee from both legs.
    let owed = view_u128(&meme, "claimable_of", json!({"account_id": creator.id()})).await;
    assert!(owed > 0);
    creator
        .call(meme.id(), "claim_usdc")
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(balance(&usdc, &creator).await, owed);

    // The contract's USDC equals pool reserve + treasury cash: nothing leaked.
    let pool: serde_json::Value = meme.view("get_pool").await?.json()?;
    let reserve: u128 = pool["usdc_reserve"].as_str().unwrap().parse()?;
    let treasury: u128 = pool["treasury_usdc"].as_str().unwrap().parse()?;
    assert_eq!(balance(&usdc, meme.as_account()).await, reserve + treasury);
    Ok(())
}

const NVDA_ID: &str = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";

async fn advance(worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>, secs: u64) {
    let target = worker.view_block().await.unwrap().timestamp() + secs * 1_000_000_000;
    while worker.view_block().await.unwrap().timestamp() < target {
        worker.fast_forward(2_000).await.unwrap();
    }
}

async fn set_nvda(pyth: &Contract, usd_cents: i64) {
    pyth.call("set_price")
        .args_json(
            json!({"price_id": NVDA_ID, "price": (usd_cents * 1_000_000).to_string(), "expo": -8}),
        )
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
}

async fn rebalance(
    caller: &Account,
    meme: &Contract,
) -> near_workspaces::result::ExecutionFinalResult {
    caller
        .call(meme.id(), "rebalance")
        .max_gas()
        .transact()
        .await
        .unwrap()
}

/// The engine end to end with real promises: stale price, young pool, issuance,
/// cooldown, then a sell-off that opens the redemption window, and a redemption.
#[tokio::test]
async fn rebalance_issue_then_redeem() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let make = |name: &'static str| {
        let root = root.clone();
        async move {
            root.create_subaccount(name)
                .initial_balance(NearToken::from_near(20))
                .transact()
                .await
                .unwrap()
                .into_result()
                .unwrap()
        }
    };
    let (creator, bob, keeper) = (
        make("creator").await,
        make("bob").await,
        make("keeper").await,
    );
    let usdc = make("usdc")
        .await
        .deploy(&wasm("mock_ft"))
        .await?
        .into_result()?;
    usdc.call("new")
        .args_json(json!({"name": "USD Coin", "symbol": "USDC", "decimals": 6}))
        .transact()
        .await?
        .into_result()?;
    let pyth = make("pyth")
        .await
        .deploy(&wasm("mock_pyth"))
        .await?
        .into_result()?;
    pyth.call("new").transact().await?.into_result()?;
    let meme = make("nvda")
        .await
        .deploy(&wasm("meme"))
        .await?
        .into_result()?;
    meme.call("new")
        .args_json(json!({
            "creator": creator.id(), "usdc": usdc.id(), "oracle": pyth.id(), "stock": nvda(), "chains": chains(),
            "name": "Nvidia Meme", "symbol": "NVDA", "icon": null
        }))
        .transact()
        .await?
        .into_result()?;
    for a in [&creator, &bob] {
        a.call(usdc.id(), "mint")
            .args_json(json!({"account_id": a.id(), "amount": (10_000 * USDC).to_string()}))
            .transact()
            .await?
            .into_result()?;
    }
    storage_deposit(&creator, &usdc, meme.id().as_str()).await;
    storage_deposit(&bob, &meme, bob.id().as_str()).await;
    ft_call(&creator, &usdc, &meme, 1_000 * USDC, r#"{"action":"seed"}"#).await;
    ft_call(
        &bob,
        &usdc,
        &meme,
        1_000 * USDC,
        r#"{"action":"buy","min_out":"1"}"#,
    )
    .await;

    // 1. No Pyth price yet: nothing happens, cooldown not consumed.
    let out: serde_json::Value = rebalance(&keeper, &meme).await.into_result()?.json()?;
    assert_eq!(out, json!("stale_price"));

    // 2. Fresh price but the pool is younger than the 30-minute TWAP window.
    set_nvda(&pyth, 18_000).await;
    let out: serde_json::Value = rebalance(&keeper, &meme).await.into_result()?.json()?;
    assert_eq!(out, json!("no_market"));

    // 3. After 30 minutes: mNAV is huge (treasury = fees), so the engine issues.
    advance(&worker, 31 * 60).await;
    set_nvda(&pyth, 18_000).await;
    let supply0 = view_u128(&meme, "ft_total_supply", json!({})).await;
    let out: serde_json::Value = rebalance(&keeper, &meme).await.into_result()?.json()?;
    let issued: u128 = out["issued"]["meme"].as_str().unwrap().parse()?;
    assert!(issued > 0, "{out}");
    assert_eq!(
        view_u128(&meme, "ft_total_supply", json!({})).await,
        supply0 + issued
    );
    assert!(
        view_u128(&meme, "claimable_of", json!({"account_id": keeper.id()})).await > 0,
        "caller tip"
    );

    // 4. Cooldown: a second call within the hour is rejected.
    assert!(rebalance(&keeper, &meme).await.is_failure());

    // 5. Bob dumps 95% into the pool: circulating falls, NAV per token jumps,
    //    and the next rebalance (after TWAP + cooldown) opens the redemption window.
    let held = balance(&meme, &bob).await;
    bob.call(meme.id(), "sell")
        .args_json(json!({"amount": (held * 95 / 100).to_string(), "min_out": "1"}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    advance(&worker, 61 * 60).await;
    set_nvda(&pyth, 18_000).await;
    rebalance(&keeper, &meme).await.into_result()?;
    let t: serde_json::Value = meme.view("get_treasury").await?.json()?;
    assert_eq!(t["redemption_open"], true, "{t}");

    // 6. Bob redeems a slice and receives NAV per token in USDC.
    let left = balance(&meme, &bob).await;
    let usdc_before = balance(&usdc, &bob).await;
    let paid: String = bob
        .call(meme.id(), "redeem")
        .args_json(json!({"amount": (left / 10).to_string(), "min_usdc": "1"}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?
        .json()?;
    let paid: u128 = paid.parse()?;
    assert!(paid > 0);
    assert_eq!(balance(&meme, &bob).await, left - left / 10);
    assert_eq!(balance(&usdc, &bob).await, usdc_before + paid);

    // Nothing leaks: contract USDC = pool reserve + treasury cash + claimable.
    let pool: serde_json::Value = meme.view("get_pool").await?.json()?;
    let reserve: u128 = pool["usdc_reserve"].as_str().unwrap().parse()?;
    let cash: u128 = pool["treasury_usdc"].as_str().unwrap().parse()?;
    let mut owed = 0;
    for a in [&creator, &keeper] {
        owed += view_u128(&meme, "claimable_of", json!({"account_id": a.id()})).await;
    }
    assert_eq!(
        balance(&usdc, meme.as_account()).await,
        reserve + cash + owed
    );
    Ok(())
}
