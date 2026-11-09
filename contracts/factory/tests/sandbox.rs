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

pub fn chains() -> serde_json::Value {
    json!({"mpc": "v1.signer-prod.testnet", "evm": [
        {"name": "base", "chain_id": 84532, "usdc": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
         "usdc_decimals": 6, "swap_router": "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
         "pool_fee": 3000, "max_fee_per_gas": "100000000", "max_priority_fee_per_gas": "1000000",
         "max_swap_usdc": "5000000"},
        {"name": "robinhood", "chain_id": 46630, "usdc": "0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F",
         "usdc_decimals": 18, "swap_router": "0x3ce954107b1a675826b33bf23060dd655e3758fe",
         "pool_fee": 3000, "max_fee_per_gas": "100000000", "max_priority_fee_per_gas": "10000000",
         "max_swap_usdc": "5000000000000000000"}]})
}

#[allow(non_snake_case)]
fn NVDA() -> serde_json::Value {
    json!({"ticker": "NVDA",
           "price_id": "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
           "venues": [
               {"chain": "base", "token": "0x8f13563130684478E617C1797308A081Cb2c2654", "decimals": 8},
               {"chain": "robinhood", "token": "0x82289af84B9a0faf598a4D2052E16c8D1619f7f4", "decimals": 18}]})
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
        .args_json(
            json!({"usdc": "usdc.test.near", "oracle": "pyth.test.near", "chains": chains(), "stocks": [NVDA()]}),
        )
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
    let launch_on = |symbol: &str, stock: &str, deposit: NearToken| {
        alice
            .call(factory.id(), "create_meme")
            .args_json(json!({"name": "Nvidia Meme", "symbol": symbol, "thesis_stock": stock, "icon": null}))
            .deposit(deposit)
            .max_gas()
            .transact()
    };
    let launch = |symbol: &str, deposit: NearToken| launch_on(symbol, "NVDA", deposit);

    // A stock outside the factory's list is rejected.
    assert!(launch_on("TSLA", "TSLA", cost).await?.is_failure());

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
    assert_eq!(info["oracle"], "pyth.test.near");
    assert_eq!(info["stock"], NVDA());
    let params: serde_json::Value = worker.view(&meme_id.parse()?, "get_params").await?.json()?;
    assert_eq!(params["issuance_mnav_bps"], 20_000);

    // The meme got the factory's chains: one EVM treasury, a ledger per chain.
    let got: serde_json::Value = factory.view("get_chains").await?.json()?;
    assert_eq!(got, chains());
    let t: serde_json::Value = worker
        .view(&meme_id.parse()?, "get_treasury_chains")
        .await?
        .json()?;
    assert_eq!(t["address"], serde_json::Value::Null);
    assert_eq!(t["mpc"], "v1.signer-prod.testnet");
    assert_eq!(t["chains"][0]["config"], chains()["evm"][0]);
    assert_eq!(t["chains"][1]["venue"], NVDA()["venues"][1]);
    assert_eq!(t["chains"][1]["nonce"], 0);
    assert_eq!(t["chains"][1]["usdc"], "0");

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
