// Holders: candidate accounts from event shapes seen in data/events/*.jsonl, ranking, the cache and
// the API route, with a fake Near (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Holders, holderCandidates, rankHolders } from "../src/holders.js";
import { route } from "../src/api.js";

const MEME = "honey.solidon.testnet";
const EVENTS = [
  { signer: "alice.testnet", event: "buy", data: { account: "alice.testnet", usdc_in: "400000000", meme_out: "5" } },
  { signer: "alice.testnet", event: "ft_transfer", data: { old_owner_id: MEME, new_owner_id: "alice.testnet", amount: "5" } },
  { signer: "bob.testnet", event: "seed", data: { account: "bob.testnet", usdc_in: "1000000000" } },
  { signer: "carol.testnet", event: "ft_transfer", data: { old_owner_id: "bob.testnet", new_owner_id: "carol.testnet", amount: "1" } },
  { signer: "relayer.testnet", event: "ft_mint", data: { owner_id: MEME, amount: "1000" } },
];

test("candidates: every party and signer, the extras, never the meme itself", () => {
  assert.deepEqual(holderCandidates(EVENTS, MEME, ["creator.testnet", null]), [
    "alice.testnet",
    "bob.testnet",
    "carol.testnet",
    "creator.testnet",
    "relayer.testnet",
  ]);
  assert.deepEqual(holderCandidates([], MEME), []);
});

test("rank: drops zeros, biggest first (BigInt, not float), share of supply, limit", () => {
  const big = "283667621776504297994269340";
  const r = rankHolders(
    [
      { account: "a", balance: "0" },
      { account: "b", balance: "283667621776504297994269339" },
      { account: "c", balance: big },
      { account: "d", balance: "10" },
    ],
    "1000000000000000000000000000",
  );
  assert.deepEqual(r.map((h) => h.account), ["c", "b", "d"]);
  assert.equal(r[0].balance, big);
  assert.equal(r[0].share, 0.283667);
  assert.equal(r[2].share, 0);
  assert.equal(rankHolders([{ account: "x", balance: "5" }], null)[0].share, null);
  assert.equal(rankHolders([{ account: "x", balance: "5" }, { account: "y", balance: "6" }], "100", 1).length, 1);
});

function fakeNear(balances) {
  const calls = [];
  const view = async (contract, method, args) => {
    calls.push(method);
    if (method === "ft_total_supply") return "1000";
    if (method === "ft_balance_of") return balances[args.account_id] ?? "0";
    throw new Error(method);
  };
  let flaky = 1;
  return {
    calls,
    view: async (contract, method, args) => {
      if (method === "get_pool") return { meme_reserve: "700" };
      if (method === "ft_total_supply" && flaky-- > 0) throw new Error("-429 rate limited");
      return view(contract, method, args);
    },
  };
}

test("holders: live balances (a -429 retried), pool reserve apart, cached for 60 s", async () => {
  let now = 1_000_000;
  const near = fakeNear({ "alice.testnet": "200", "carol.testnet": "50", "bob.testnet": "0" });
  const h = new Holders(near, { now: () => now, retryMs: 1 });
  const r = await h.get(MEME, EVENTS, { creator: "creator.testnet" });
  assert.deepEqual(r, {
    meme: MEME,
    holders: [
      { account: "alice.testnet", balance: "200", share: 0.2 },
      { account: "carol.testnet", balance: "50", share: 0.05 },
    ],
    pool_reserve: "700",
    total_supply: "1000",
    updated_at: 1000,
  });
  const n = near.calls.length;
  assert.equal((await h.get(MEME, EVENTS, { limit: 1 })).holders.length, 1);
  assert.equal(near.calls.length, n, "served from cache");
  now += 61_000;
  await h.get(MEME, EVENTS);
  assert.ok(near.calls.length > n, "refreshed after 60 s");
});

test("route: holders resolves to 200, RPC failure to 502", async () => {
  const svc = (holders) => ({ store: { events: new Map() }, memes: () => [MEME], holders });
  const ok = await route(svc(async (id, limit) => ({ meme: id, limit })), "GET", `/v1/memes/${MEME}/holders?limit=5`);
  assert.deepEqual(ok, { status: 200, body: { meme: MEME, limit: 5 } });
  const bad = await route(svc(async () => { throw new Error("-429"); }), "GET", `/v1/memes/${MEME}/holders`);
  assert.equal(bad.status, 502);
  assert.equal((await route(svc(null), "GET", "/v1/memes/x.testnet/holders")).status, 404);
});
