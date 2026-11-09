//! Solana treasury: the exact message bytes the MPC EdDSA domain signs (S21, S25).
//!
//! The treasury is one Solana address, the MPC ed25519 key derived from this contract's
//! account. It is the fee payer, the only signer, and the owner of its token accounts.
//! The contract signs one shape: a legacy message with the associated token account
//! `CreateIdempotent` for the stock account and a Raydium CLMM `swap_v2` from USDC into
//! the stock. The layout is the one `backend/solana-spike/2_swap.js` built by hand and
//! the MPC signed on devnet (spec in `backend/solana-spike/README.md`).
//!
//! No curve math here: a program-derived address (PDA) is checked by hashing its seeds
//! with a bump supplied by the keeper (see [`create_program_address`]).

use near_sdk::{bs58, env, require};

pub type Pubkey = [u8; 32];

pub const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";
/// SPL Token, the program of USDC.
pub const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/// Token-2022, the program of the stock tokens (xStocks and the devnet synthetics).
pub const TOKEN_2022_PROGRAM: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
pub const ATA_PROGRAM: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
pub const MEMO_PROGRAM: &str = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
/// `sha256("global:swap_v2")[..8]`.
const SWAP_V2: [u8; 8] = [0x2b, 0x04, 0xed, 0x0b, 0x1a, 0xc9, 0x1e, 0x62];
/// One-sided pools need two (S25 follow-up); a third leaves room for a long swap.
pub const MAX_TICK_ARRAYS: usize = 3;

// --- Encoding -----------------------------------------------------------------

/// `None` unless `s` is base58 for exactly 32 bytes.
pub fn decode_pubkey(s: &str) -> Option<Pubkey> {
    let mut out = [0u8; 32];
    match bs58::decode(s).onto(&mut out) {
        Ok(32) => Some(out),
        _ => None,
    }
}

pub fn parse_pubkey(s: &str) -> Pubkey {
    decode_pubkey(s).unwrap_or_else(|| env::panic_str("Solana address must be 32 bytes, base58"))
}

pub fn encode_pubkey(key: &Pubkey) -> String {
    bs58::encode(key).into_string()
}

/// Solana's compact-u16 length prefix: 7 bits per byte, high bit = more bytes follow.
fn push_shortvec(out: &mut Vec<u8>, mut n: usize) {
    loop {
        let byte = (n & 0x7f) as u8;
        n >>= 7;
        if n == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

// --- Program-derived addresses ------------------------------------------------

/// The address Solana's `create_program_address` gives for `seeds` and `bump` under
/// `program`: `sha256(seeds || bump || program || "ProgramDerivedAddress")`.
///
/// Solana also rejects a result that lies on the ed25519 curve, and the canonical bump
/// is the highest one whose result is off the curve. Neither check is done here: the
/// keeper supplies the bump and the contract accepts an address only if this hash
/// matches. A non-canonical bump cannot redirect funds, it can only make the
/// transaction fail:
/// - Token accounts: only the ATA program creates accounts at ATA addresses, and only at
///   the canonical one (it derives the address itself and checks it). Any other hash
///   output is either off the curve (nobody can sign for it) or a curve point whose
///   private key nobody knows, so no initialized token account can exist there, and the
///   token program rejects a transfer into an uninitialized account.
/// - CLMM pool, vaults, observation, bitmap extension, tick arrays: owned by the CLMM
///   program, which creates them only at canonical addresses and re-derives every PDA it
///   is given, so a wrong address fails its seed or ownership checks.
pub fn create_program_address(seeds: &[&[u8]], bump: u8, program: &Pubkey) -> Pubkey {
    let mut preimage = Vec::with_capacity(160);
    for seed in seeds {
        preimage.extend_from_slice(seed);
    }
    preimage.push(bump);
    preimage.extend_from_slice(program);
    preimage.extend_from_slice(b"ProgramDerivedAddress");
    env::sha256_array(&preimage)
}

/// Associated token account of `owner` for `mint`; `token_program` is the mint's
/// program (SPL Token for USDC, Token-2022 for the stocks).
pub fn associated_token_address(
    owner: &Pubkey,
    token_program: &Pubkey,
    mint: &Pubkey,
    bump: u8,
) -> Pubkey {
    let ata = parse_pubkey(ATA_PROGRAM);
    create_program_address(&[owner, token_program, mint], bump, &ata)
}

/// CLMM pool of two mints, in either order (the program sorts them bytewise).
pub fn clmm_pool_address(
    clmm: &Pubkey,
    amm_config: &Pubkey,
    mint_a: &Pubkey,
    mint_b: &Pubkey,
    bump: u8,
) -> Pubkey {
    let (mint0, mint1) = if mint_a < mint_b {
        (mint_a, mint_b)
    } else {
        (mint_b, mint_a)
    };
    create_program_address(&[b"pool", amm_config, mint0, mint1], bump, clmm)
}

pub fn clmm_vault_address(clmm: &Pubkey, pool: &Pubkey, mint: &Pubkey, bump: u8) -> Pubkey {
    create_program_address(&[b"pool_vault", pool, mint], bump, clmm)
}

pub fn clmm_observation_address(clmm: &Pubkey, pool: &Pubkey, bump: u8) -> Pubkey {
    create_program_address(&[b"observation", pool], bump, clmm)
}

pub fn clmm_bitmap_extension_address(clmm: &Pubkey, pool: &Pubkey, bump: u8) -> Pubkey {
    create_program_address(&[b"pool_tick_array_bitmap_extension", pool], bump, clmm)
}

pub fn clmm_tick_array_address(clmm: &Pubkey, pool: &Pubkey, start_index: i32, bump: u8) -> Pubkey {
    create_program_address(
        &[b"tick_array", pool, &start_index.to_be_bytes()],
        bump,
        clmm,
    )
}

// --- Swap message -------------------------------------------------------------

/// Every account of a USDC -> stock buy. The contract derives these from locked config
/// and keeper-supplied bumps; only the tick arrays depend on live pool state.
pub struct SwapAccounts {
    pub treasury: Pubkey,
    pub usdc_mint: Pubkey,
    /// Token-2022.
    pub stock_mint: Pubkey,
    /// The treasury's USDC account (ATA under SPL Token).
    pub usdc_account: Pubkey,
    /// The treasury's stock account (ATA under Token-2022), created if missing.
    pub stock_account: Pubkey,
    pub clmm: Pubkey,
    pub amm_config: Pubkey,
    pub pool: Pubkey,
    pub usdc_vault: Pubkey,
    pub stock_vault: Pubkey,
    pub observation: Pubkey,
    pub bitmap_extension: Pubkey,
    /// 1 to 3 initialized tick arrays in the swap direction, nearest first.
    pub tick_arrays: Vec<Pubkey>,
}

struct Instruction {
    program: Pubkey,
    /// (account, writable); the treasury is the only signer.
    accounts: Vec<(Pubkey, bool)>,
    data: Vec<u8>,
}

/// Legacy message buying the stock with `amount_in` raw USDC, reverting below `min_out`
/// raw stock. Swap direction needs no flag: the vaults are named by token and the price
/// limit is 0 (no limit), which the program reads per direction.
pub fn swap_message(
    a: &SwapAccounts,
    recent_blockhash: &Pubkey,
    amount_in: u64,
    min_out: u64,
) -> Vec<u8> {
    require!(
        (1..=MAX_TICK_ARRAYS).contains(&a.tick_arrays.len()),
        "Pass 1 to 3 tick arrays"
    );
    let system = parse_pubkey(SYSTEM_PROGRAM);
    let token = parse_pubkey(TOKEN_PROGRAM);
    let token_2022 = parse_pubkey(TOKEN_2022_PROGRAM);
    let (w, r) = (true, false);

    let create_stock_account = Instruction {
        program: parse_pubkey(ATA_PROGRAM),
        accounts: vec![
            (a.treasury, w),
            (a.stock_account, w),
            (a.treasury, r),
            (a.stock_mint, r),
            (system, r),
            (token_2022, r),
        ],
        data: vec![1], // CreateIdempotent
    };

    let mut data = Vec::with_capacity(41);
    data.extend_from_slice(&SWAP_V2);
    data.extend_from_slice(&amount_in.to_le_bytes());
    data.extend_from_slice(&min_out.to_le_bytes()); // other_amount_threshold
    data.extend_from_slice(&0u128.to_le_bytes()); // sqrt_price_limit_x64
    data.push(1); // is_base_input
    let mut accounts = vec![
        (a.treasury, r),
        (a.amm_config, r),
        (a.pool, w),
        (a.usdc_account, w),
        (a.stock_account, w),
        (a.usdc_vault, w),
        (a.stock_vault, w),
        (a.observation, w),
        (token, r),
        (token_2022, r),
        (parse_pubkey(MEMO_PROGRAM), r),
        (a.usdc_mint, r),
        (a.stock_mint, r),
        (a.bitmap_extension, w), // remaining accounts from here on
    ];
    accounts.extend(a.tick_arrays.iter().map(|t| (*t, w)));
    let swap = Instruction {
        program: a.clmm,
        accounts,
        data,
    };

    compile(&a.treasury, &[create_stock_account, swap], recent_blockhash)
}

/// Compiles a legacy message with `fee_payer` as its only signer. Keys are deduplicated
/// (a key is writable if any use is) and ordered fee payer, writable, read-only, each
/// class in order of first appearance, programs counted after their instruction's
/// accounts.
fn compile(fee_payer: &Pubkey, instructions: &[Instruction], recent_blockhash: &Pubkey) -> Vec<u8> {
    let mut keys: Vec<(Pubkey, bool)> = vec![(*fee_payer, true)];
    let mut add = |key: Pubkey, writable: bool| match keys.iter_mut().find(|k| k.0 == key) {
        Some(k) => k.1 |= writable,
        None => keys.push((key, writable)),
    };
    for ix in instructions {
        for &(key, writable) in &ix.accounts {
            add(key, writable);
        }
        add(ix.program, false);
    }
    let (writable, readonly): (Vec<(Pubkey, bool)>, Vec<_>) = keys[1..].iter().partition(|k| k.1);
    let order: Vec<Pubkey> = core::iter::once(*fee_payer)
        .chain(writable.iter().map(|k| k.0))
        .chain(readonly.iter().map(|k| k.0))
        .collect();
    let index = |key: &Pubkey| order.iter().position(|k| k == key).unwrap() as u8;

    // Header: signatures, read-only signed, read-only unsigned.
    let mut out = vec![1, 0, readonly.len() as u8];
    push_shortvec(&mut out, order.len());
    for key in &order {
        out.extend_from_slice(key);
    }
    out.extend_from_slice(recent_blockhash);
    push_shortvec(&mut out, instructions.len());
    for ix in instructions {
        out.push(index(&ix.program));
        push_shortvec(&mut out, ix.accounts.len());
        out.extend(ix.accounts.iter().map(|(key, _)| index(key)));
        push_shortvec(&mut out, ix.data.len());
        out.extend_from_slice(&ix.data);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test vectors from `backend/solana-spike/2_swap.js` (DRY_RUN=1 PRINT_INPUTS=1
    // MPC_SIGNER=creator.solidon.testnet AMOUNT_USDC=1) against the devnet pools in
    // contracts/stocks/solana-devnet.json, simulated OK on 2026-11-10. Bumps are from
    // `PublicKey.findProgramAddressSync`.
    const TREASURY: &str = "GXhnfvC6yYEXgYEtSwEZNfKF2tcCd7vFn5onqEyK2UH5";
    const USDC: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    const CLMM: &str = "devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH";
    const AMM_CONFIG: &str = "GVSwm4smQBYcgAJU7qjFHLQBHTc4AdB3F2HbZp6KqKof";
    const USDC_ATA: (&str, u8) = ("318qibizcq962JSymQtW3KfuZuQhMi2UrRFuVmzTcHn7", 253);

    /// One venue; (address, bump) pairs.
    struct Venue {
        stock: &'static str,
        usdc_is_mint0: bool,
        pool: (&'static str, u8),
        usdc_vault: (&'static str, u8),
        stock_vault: (&'static str, u8),
        observation: (&'static str, u8),
        bitmap_extension: (&'static str, u8),
        tick_arrays: [(i32, &'static str, u8); 2],
        stock_ata: (&'static str, u8),
        blockhash: &'static str,
        min_out: u64,
        message: &'static str,
    }

    /// USDC is mint0: the buy is zero_for_one.
    const NVDA: Venue = Venue {
        stock: "88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB",
        usdc_is_mint0: true,
        pool: ("FEstNywAgrVXixWbLkFaqqMjT7jbdjwmkoPdmudtRCqU", 254),
        usdc_vault: ("7QxxoL5DRDo2Q1Z6nvXkFa7Z55cN7r8YRyj4ig8i5sPB", 254),
        stock_vault: ("2x5h8nw3sH9zEo7g8G3e3ub7n9GMXJWLvivrXtJ18BN6", 255),
        observation: ("AggvhJqcKyXuGnW2xx52MeY3veqwsm4JSCVJDg1bfiVF", 252),
        bitmap_extension: ("5nUE56LNNXaxeYwZWSfpWfD2qBLXmzy2F41nSrxBKhPu", 255),
        tick_arrays: [
            (-6000, "EWC4cMDc1LwSgE5YFNVAtU32ATh9bLrwrDtu6bgexrjt", 255),
            (-13200, "ENQLLQvW9fjQhkGUkQghxofUmSkae7L3UxS46JcTkHA7", 254),
        ],
        stock_ata: ("7NZMuaey6A1bx5dthm78J1wR3PFxrLWWJSAhJMBpbx3p", 255),
        blockhash: "4F2j8AiUzJGACzdjQBfmhBpssPp7vBRm8EmNDJYjmcRm",
        min_out: 560_337,
        message: "01000913e6bcd8bee029c0225dabdd6c65232c0bf3bbf3db4c9876f3bb532afbc02a80f85eabe89c4e737560bf3e7b7a06f5be4f670a0e1a9a890027ffb1b98ffafc885fd391b44caca2123d844a6f1d4101a2023f39c1fa960f9efa5f89bf3d524476f71dc03d0f4d6c6702905ecddf9d6ceed2c42a47c36256e96d6a589b77b888c5305f49c1b435a61dad775a4a23fb8547a8d105be948cc09b983a5dfc14aabde6de1cf7efc896e50b94e7e026f739be9e5240e094f571702a0ab3e8f9d86148b7a78fe3fa6559605bc5aded5b2d433d3dd1d2414ed3b96fc81a5664dd6f8299fdfa4714aafccf3c8cea4378d6c649f6aef4c1f697bf188299b5f8958b056442a360c8a24817af4239e5f8856ffb9abce6d44efc5b6f6567c4c624f58560a08cfde3c6a38298c9c3d8b54b2b2098481a4f31091668ad3df672180aabea5270e1e14869d92b2c6eea3b0ce3d5f359f27a4ab5b4dba98ecc30db2290f4de336ffd94a6000000000000000000000000000000000000000000000000000000000000000006ddf6e1ee758fde18425dbce46ccddab61afc4d83b90d27febdf928d8a18bfc8c97258f4e2489f1bb3d1029148e0d830b5a1399daff1084048e7bd8dbe9f859e628e6d430307a9b8e8fcca00c3c674021b299b5ebc5609c01c26b0ee892219a06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d3b442cb3912157f13a933d0134282d032b5ffecd01a2dbf1b7790608df002ea70963cacd2f204f20079288694d44c6e67979817303746f08b32aa0ced1fb272a302b24dd75cde5d263734b8c1ec8b8b52b24667d76b47f16bbf831f21ddf94a8020d060001000a0b0c01011210000e0203010405060f0c10110a070809292b04ed0b1ac91e6240420f0000000000d18c0800000000000000000000000000000000000000000001",
    };

    /// The stock is mint0: the buy is one_for_zero.
    const GOOGL: Venue = Venue {
        stock: "XLYZw9YeVrUNsp4dAVVYayMdT5jWrmk6wFjUNWu8AnH",
        usdc_is_mint0: false,
        pool: ("5dRjF2Zpc7crjrqp8NzrpntYnhGTVcLFN5QumB2iftu9", 254),
        usdc_vault: ("CAh6n78PmKpRoftKYjRxPjxzwnHCq4DMqTqjxQkTV3kP", 252),
        stock_vault: ("8DsaXeQgXNQpMrBimuocwBPi3p77yY5DdxgaSd8FMHg1", 249),
        observation: ("FmtdYsahFkFya4Gt5WbsaFC687QaxouQBFfu5UY7Uvbc", 252),
        bitmap_extension: ("AVxbcjxh7Jk1w9T44a8sfiR6yvJJEqf5K7ZHfMXMm5PE", 255),
        tick_arrays: [
            (10200, "2gvGY6JcqZ7rvh4ariYRRzfC5y3R8BEHZcZwoGHfqXBf", 254),
            (17400, "EChHcjx6MephSvNizkRRAmxshKkqHR9J7PUT999s3jfw", 255),
        ],
        stock_ata: ("HhMe8gN1bZGTvPNKFm8W4BdUzKVCWvGQ4y2qtC6Uyfeq", 254),
        blockhash: "96sxP4E1ksgQF6rCm1BLkDCmRK7eqjBddqhCPAJmEDBn",
        min_out: 340_760,
        message: "01000913e6bcd8bee029c0225dabdd6c65232c0bf3bbf3db4c9876f3bb532afbc02a80f8f8118fa76f36005f11841410d704a1e244199c60deafdf5e1ae6e15f33e62fba44c39e020bf943ee57d83231aa1310f343629b509092a120164e7bc1103c879c1dc03d0f4d6c6702905ecddf9d6ceed2c42a47c36256e96d6a589b77b888c530a5ec1fceea9e5411a31639160c31ca819c08bcd0eedaa1c07dbdf22ba72b193c6b4df78da90f2ade29d3c980cf312bfaeaa516f0746649c2981444f11fb88ef6db838d0d15ce915961736a53e47d196ef41605df3a214f9ff49b019428cfaa038d244efbc00baa18bd42ab3f322d7cf67f06a81e9489e9075adf463f8b6aca7919159192b99586bc6ae63729c5ff9eb46624ec0d97e8ea10edd3d5869b702142c426defb0749859487470551a2dad5ec392b1a79489c7d1a52f5a39f6887752a07c585e6bafb36d7df2a4c32aac2d899534fdff7a70325907ab9097df12216be000000000000000000000000000000000000000000000000000000000000000006ddf6e1ee758fde18425dbce46ccddab61afc4d83b90d27febdf928d8a18bfc8c97258f4e2489f1bb3d1029148e0d830b5a1399daff1084048e7bd8dbe9f859e628e6d430307a9b8e8fcca00c3c674021b299b5ebc5609c01c26b0ee892219a06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d3b442cb3912157f13a933d0134282d032b5ffecd01a2dbf1b7790608df002ea70963cacd2f204f20079288694d44c6e67979817303746f08b32aa0ced1fb272a785f03a71c7d4200b2008c0bf94fdf10bd0eca6407edd2386ed1e5ad299bfcc9020d060001000a0b0c01011210000e0203010405060f0c10110a070809292b04ed0b1ac91e6240420f000000000018330500000000000000000000000000000000000000000001",
    };

    fn pk(s: &str) -> Pubkey {
        decode_pubkey(s).unwrap()
    }

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    fn accounts(v: &Venue, tick_arrays: usize) -> SwapAccounts {
        SwapAccounts {
            treasury: pk(TREASURY),
            usdc_mint: pk(USDC),
            stock_mint: pk(v.stock),
            usdc_account: pk(USDC_ATA.0),
            stock_account: pk(v.stock_ata.0),
            clmm: pk(CLMM),
            amm_config: pk(AMM_CONFIG),
            pool: pk(v.pool.0),
            usdc_vault: pk(v.usdc_vault.0),
            stock_vault: pk(v.stock_vault.0),
            observation: pk(v.observation.0),
            bitmap_extension: pk(v.bitmap_extension.0),
            tick_arrays: (0..tick_arrays)
                // Devnet pools have 2 initialized arrays; further ones are placeholders.
                .map(|i| v.tick_arrays.get(i).map_or([i as u8; 32], |t| pk(t.1)))
                .collect(),
        }
    }

    #[test]
    fn base58_round_trip_and_rejects() {
        let t = pk(TREASURY);
        assert_eq!(encode_pubkey(&t), TREASURY);
        assert_eq!(pk(SYSTEM_PROGRAM), [0u8; 32]);
        for p in [TOKEN_PROGRAM, TOKEN_2022_PROGRAM, ATA_PROGRAM, MEMO_PROGRAM] {
            assert_eq!(encode_pubkey(&pk(p)), p);
        }
        assert_eq!(decode_pubkey(""), None);
        assert_eq!(decode_pubkey("1111111111111111111111111111111"), None); // 31 bytes
        assert_eq!(decode_pubkey(&format!("{TREASURY}1")), None); // 33 bytes
        assert_eq!(decode_pubkey("0OIl1111111111111111111111111111"), None); // not base58
    }

    #[test]
    fn shortvec() {
        for (n, want) in [
            (0, vec![0x00]),
            (0x7f, vec![0x7f]),
            (0x80, vec![0x80, 0x01]),
            (0x3fff, vec![0xff, 0x7f]),
            (0x4000, vec![0x80, 0x80, 0x01]),
        ] {
            let mut out = Vec::new();
            push_shortvec(&mut out, n);
            assert_eq!(out, want, "{n}");
        }
    }

    #[test]
    fn swap_message_matches_2_swap_js_zero_for_one() {
        let msg = swap_message(
            &accounts(&NVDA, 2),
            &pk(NVDA.blockhash),
            1_000_000,
            NVDA.min_out,
        );
        assert_eq!(msg, hex(NVDA.message));
        assert_eq!(msg.len(), 715);
    }

    #[test]
    fn swap_message_matches_2_swap_js_one_for_zero() {
        let msg = swap_message(
            &accounts(&GOOGL, 2),
            &pk(GOOGL.blockhash),
            1_000_000,
            GOOGL.min_out,
        );
        assert_eq!(msg, hex(GOOGL.message));
    }

    #[test]
    fn swap_message_size_per_tick_array() {
        // README formula: each tick array adds a key and an account index (33 bytes).
        let len = |n| swap_message(&accounts(&NVDA, n), &[7; 32], 1, 1).len();
        assert_eq!((len(1), len(2), len(3)), (682, 715, 748));
    }

    #[test]
    #[should_panic(expected = "Pass 1 to 3 tick arrays")]
    fn swap_message_needs_a_tick_array() {
        swap_message(&accounts(&NVDA, 0), &[7; 32], 1, 1);
    }

    #[test]
    #[should_panic(expected = "Pass 1 to 3 tick arrays")]
    fn swap_message_caps_tick_arrays() {
        swap_message(&accounts(&NVDA, 4), &[7; 32], 1, 1);
    }

    #[test]
    fn pdas_match_devnet() {
        let (clmm, config, usdc) = (pk(CLMM), pk(AMM_CONFIG), pk(USDC));
        let treasury = pk(TREASURY);
        let usdc_ata = associated_token_address(&treasury, &pk(TOKEN_PROGRAM), &usdc, USDC_ATA.1);
        assert_eq!(encode_pubkey(&usdc_ata), USDC_ATA.0);
        for v in [NVDA, GOOGL] {
            let stock = pk(v.stock);
            assert_eq!(usdc < stock, v.usdc_is_mint0);
            let pool = clmm_pool_address(&clmm, &config, &usdc, &stock, v.pool.1);
            assert_eq!(encode_pubkey(&pool), v.pool.0);
            let check = |got: Pubkey, want: (&str, u8)| assert_eq!(encode_pubkey(&got), want.0);
            check(
                clmm_vault_address(&clmm, &pool, &usdc, v.usdc_vault.1),
                v.usdc_vault,
            );
            check(
                clmm_vault_address(&clmm, &pool, &stock, v.stock_vault.1),
                v.stock_vault,
            );
            check(
                clmm_observation_address(&clmm, &pool, v.observation.1),
                v.observation,
            );
            check(
                clmm_bitmap_extension_address(&clmm, &pool, v.bitmap_extension.1),
                v.bitmap_extension,
            );
            for (start, address, bump) in v.tick_arrays {
                check(
                    clmm_tick_array_address(&clmm, &pool, start, bump),
                    (address, bump),
                );
            }
            check(
                associated_token_address(&treasury, &pk(TOKEN_2022_PROGRAM), &stock, v.stock_ata.1),
                v.stock_ata,
            );
        }
    }

    #[test]
    fn pool_address_ignores_mint_order() {
        let (clmm, config, usdc, stock) = (pk(CLMM), pk(AMM_CONFIG), pk(USDC), pk(GOOGL.stock));
        assert_eq!(
            clmm_pool_address(&clmm, &config, &stock, &usdc, GOOGL.pool.1),
            pk(GOOGL.pool.0)
        );
    }

    #[test]
    fn wrong_bump_or_seed_is_rejected() {
        let (clmm, config, usdc, stock) = (pk(CLMM), pk(AMM_CONFIG), pk(USDC), pk(NVDA.stock));
        let treasury = pk(TREASURY);
        let pool = pk(NVDA.pool.0);
        for bump in [NVDA.pool.1 - 1, NVDA.pool.1.wrapping_add(1)] {
            assert_ne!(clmm_pool_address(&clmm, &config, &usdc, &stock, bump), pool);
        }
        // Another program, AMM config, token program, owner or tick start.
        assert_ne!(
            clmm_pool_address(&pk(ATA_PROGRAM), &config, &usdc, &stock, NVDA.pool.1),
            pool
        );
        assert_ne!(
            clmm_pool_address(&clmm, &treasury, &usdc, &stock, NVDA.pool.1),
            pool
        );
        let ata = pk(NVDA.stock_ata.0);
        let bump = NVDA.stock_ata.1;
        assert_ne!(
            associated_token_address(&treasury, &pk(TOKEN_PROGRAM), &stock, bump),
            ata
        );
        assert_ne!(
            associated_token_address(&pool, &pk(TOKEN_2022_PROGRAM), &stock, bump),
            ata
        );
        assert_ne!(
            associated_token_address(&treasury, &pk(TOKEN_2022_PROGRAM), &stock, bump - 1),
            ata
        );
        let (start, address, bump) = NVDA.tick_arrays[0];
        assert_ne!(
            clmm_tick_array_address(&clmm, &pool, start + 600, bump),
            pk(address)
        );
        assert_ne!(
            clmm_tick_array_address(&clmm, &pool, -start, bump),
            pk(address)
        );
    }
}
