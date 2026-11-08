//! Sandbox test of launching memes through the factory.
//! Requires the wasm files: run `./build.sh` first.

use near_workspaces::types::NearToken;
use serde_json::json;

fn wasm(name: &str) -> Vec<u8> {
    let path = format!(
        "{}/../target/near/{name}/{name}.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    std::fs::read(&path).unwrap_or_else(|_| panic!("{path} missing, run ./build.sh"))
}

#[tokio::test]
async fn launch_meme_as_subaccount() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let factory = root
        .create_subaccount("solidon")
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?
        .into_result()?
        .deploy(&wasm("factory"))
        .await?
        .into_result()?;
    factory
        .call("new")
        .args_json(json!({"usdc": "usdc.test.near"}))
        .transact()
        .await?
        .into_result()?;
    let alice = root
        .create_subaccount("alice")
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?
        .into_result()?;

    let cost: String = factory.view("launch_cost").await?.json()?;
    let cost = NearToken::from_yoctonear(cost.parse()?);
    let launch = |symbol: &str, deposit: NearToken| {
        alice
            .call(factory.id(), "create_meme")
            .args_json(json!({"name": "Nvidia Meme", "symbol": symbol, "thesis_stock": "NVDA", "icon": null}))
            .deposit(deposit)
            .max_gas()
            .transact()
    };

    // Too little NEAR for storage: rejected before anything is created.
    assert!(launch("NVDA", NearToken::from_near(1)).await?.is_failure());

    // Launch NVDA: nvda.<factory> exists with the creator, USDC, and locked params.
    let ok: bool = launch("NVDA", cost).await?.into_result()?.json()?;
    assert!(ok);
    let meme_id = format!("nvda.{}", factory.id());
    let meta: serde_json::Value = worker
        .view(&meme_id.parse()?, "ft_metadata")
        .await?
        .json()?;
    assert_eq!(meta["symbol"], "NVDA");
    let info: serde_json::Value = worker.view(&meme_id.parse()?, "get_info").await?.json()?;
    assert_eq!(info["creator"], alice.id().as_str());
    assert_eq!(info["usdc"], "usdc.test.near");
    let params: serde_json::Value = worker.view(&meme_id.parse()?, "get_params").await?.json()?;
    assert_eq!(params["issuance_mnav_bps"], 20_000);

    let memes: Vec<String> = factory
        .view("get_memes")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(memes, vec![meme_id]);

    // Same symbol again: fails, and alice keeps her deposit (only gas is spent).
    let before = alice.view_account().await?.balance;
    assert!(launch("nvda", cost).await?.is_failure());
    let spent = before
        .as_yoctonear()
        .saturating_sub(alice.view_account().await?.balance.as_yoctonear());
    assert!(
        spent < NearToken::from_millinear(50).as_yoctonear(),
        "spent {spent}"
    );

    // Invalid symbol is rejected.
    assert!(launch("NV.DA", cost).await?.is_failure());
    Ok(())
}
