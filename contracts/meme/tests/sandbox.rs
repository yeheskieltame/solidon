//! Sandbox test of the pool against a real NEP-141 USDC (mock-ft).
//! Requires the wasm files: run `./build.sh` first.

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;

const USDC: u128 = 1_000_000;

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
            "creator": creator.id(), "usdc": usdc.id(),
            "name": "Nvidia Meme", "symbol": "NVDA", "thesis_stock": "NVDA", "icon": null
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
            "creator": bob.id(), "usdc": usdc.id(),
            "name": "X", "symbol": "X", "thesis_stock": "X", "icon": null
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
