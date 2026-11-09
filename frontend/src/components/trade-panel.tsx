"use client";

import { useId, useState } from "react";
import { cn } from "cn";
import { Notice } from "./notice";
import { GetTestUsdcButton } from "./wallet-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MEME_DECIMALS, USDC, USDC_DECIMALS } from "@/lib/config";
import { fmtRaw, fmtUsd, parseUnits, toBig, toDecimalString, toNumber } from "@/lib/format";
import { PRICE_SCALE, quoteBuy, quoteSell, scaledToUsd, withSlippage } from "@/lib/math";
import type { MemeSnapshot } from "@/lib/meme";
import { tryView, type StorageBalance } from "@/lib/near";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet, type FnCall } from "@/lib/wallet";

const SLIPPAGES = [50, 100, 300];
const FALLBACK_STORAGE_DEPOSIT = "1250000000000000000000";

export type UserBalances = {
  meme: bigint;
  usdc: bigint;
  claimable: bigint;
  registered: boolean;
};

export function useUserBalances(account: string, accountId: string | null) {
  return useAsync(async (): Promise<UserBalances | null> => {
    if (!accountId) return null;
    const [meme, usdc, claimable, storage] = await Promise.all([
      tryView<string>(account, "ft_balance_of", { account_id: accountId }),
      tryView<string>(USDC, "ft_balance_of", { account_id: accountId }),
      tryView<string>(account, "claimable_of", { account_id: accountId }),
      tryView<StorageBalance | null>(account, "storage_balance_of", { account_id: accountId }),
    ]);
    return {
      meme: toBig(meme),
      usdc: toBig(usdc),
      claimable: toBig(claimable),
      registered: !!storage,
    };
  }, [account, accountId]);
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-graphite">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

export function TradePanel({
  snap,
  user,
  onDone,
}: {
  snap: MemeSnapshot;
  user: UserBalances | null;
  onDone: () => void;
}) {
  const { accountId, connect, send } = useWallet();
  const { pool, params, treasury, metadata, account } = snap;
  const sym = metadata.symbol;
  const [tab, setTab] = useState<string>("buy");
  const [buyIn, setBuyIn] = useState("10");
  const [sellIn, setSellIn] = useState("");
  const [redeemIn, setRedeemIn] = useState("");
  const [slip, setSlip] = useState(100);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "quiet" | "error"; text: string } | null>(null);
  const ids = { buy: useId(), sell: useId(), redeem: useId() };

  const seeded = pool ? toBig(pool.usdc_reserve) > 0n : false;
  const redemptionOpen = !!treasury?.redemption_open;

  async function run(label: string, done: string, calls: FnCall[]) {
    setBusy(label);
    setMsg(null);
    try {
      await send(calls);
      setMsg({ tone: "quiet", text: done });
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(null);
      onDone();
    }
  }

  async function storageCall(): Promise<FnCall[]> {
    if (user?.registered) return [];
    const bounds = await tryView<{ min: string }>(account, "storage_balance_bounds");
    return [
      {
        receiverId: account,
        methodName: "storage_deposit",
        args: { account_id: accountId, registration_only: true },
        gas: 30,
        deposit: bounds?.min ?? FALLBACK_STORAGE_DEPOSIT,
      },
    ];
  }

  // Buy
  const buyRaw = parseUnits(buyIn, USDC_DECIMALS);
  const buyOut = pool && buyRaw ? quoteBuy(buyRaw, pool, params) : 0n;
  const buyMin = withSlippage(buyOut, slip);
  const spotUsd = pool ? scaledToUsd(toBig(pool.spot_price)) : 0;
  const buyAvg = buyRaw && buyOut > 0n ? toNumber(buyRaw, USDC_DECIMALS) / toNumber(buyOut, MEME_DECIMALS) : 0;
  const buyErr =
    buyIn && !buyRaw ? "Enter an amount with up to 6 decimals." :
    user && buyRaw && buyRaw > user.usdc ? "More than your USDC balance." : null;

  // Sell
  const sellRaw = parseUnits(sellIn, MEME_DECIMALS);
  const sellOut = pool && sellRaw ? quoteSell(sellRaw, pool, params) : 0n;
  const sellMin = withSlippage(sellOut, slip);
  const sellErr =
    sellIn && !sellRaw ? "Enter a valid amount." :
    user && sellRaw && sellRaw > user.meme ? `More than your ${sym} balance.` : null;

  // Redeem: estimate at the last NAV; the contract pays NAV at a fresh oracle price.
  const redeemRaw = parseUnits(redeemIn, MEME_DECIMALS);
  const lastNav = toBig(treasury?.last_nav);
  const redeemEst = redeemRaw ? (redeemRaw * lastNav) / PRICE_SCALE : 0n;
  const redeemMin = withSlippage(redeemEst, slip);
  const redeemErr =
    redeemIn && !redeemRaw ? "Enter a valid amount." :
    user && redeemRaw && redeemRaw > user.meme ? `More than your ${sym} balance.` : null;

  const fee = `${params.pool_fee_bps / 100}% (${params.treasury_fee_bps / 100}% treasury, ${params.creator_fee_bps / 100}% creator)`;

  const slippage = (
    <fieldset className="flex flex-wrap items-center gap-2 text-sm">
      <legend className="sr-only">Slippage tolerance</legend>
      <span className="text-graphite">Slippage</span>
      {SLIPPAGES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={slip === s}
          onClick={() => setSlip(s)}
          className={cn("border border-ink px-2 py-0.5", slip === s && "bg-ink text-paper")}
        >
          {s / 100}%
        </button>
      ))}
    </fieldset>
  );

  const connectBtn = (
    <Button className="h-11 w-full text-base" onClick={() => connect().catch((e) => setMsg({ tone: "error", text: errorText(e) }))}>
      Connect wallet
    </Button>
  );

  if (!seeded) {
    return (
      <Notice title="The pool is not seeded yet">
        Trading opens once the creator seeds the pool with USDC from the launch page.
      </Notice>
    );
  }

  return (
    <div className="frame p-5">
      <Tabs value={tab} onValueChange={(v) => { setTab(String(v)); setMsg(null); }}>
        <TabsList variant="line" className="w-full justify-start gap-4 border-b border-rule">
          <TabsTrigger value="buy" className="type-wide flex-none px-0 text-base">Buy</TabsTrigger>
          <TabsTrigger value="sell" className="type-wide flex-none px-0 text-base">Sell</TabsTrigger>
          <TabsTrigger value="redeem" className="type-wide flex-none px-0 text-base">Redeem</TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={ids.buy}>You pay (USDC)</Label>
            <Input id={ids.buy} inputMode="decimal" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} aria-invalid={!!buyErr} aria-describedby={`${ids.buy}-e`} className="h-11 text-lg" />
            <p id={`${ids.buy}-e`} className="text-xs text-graphite">
              {buyErr ?? (user ? `Balance: ${fmtRaw(user.usdc, USDC_DECIMALS)} USDC` : "")}
            </p>
          </div>
          <div className="border-y border-rule py-2">
            <Line k="You receive" v={`${fmtRaw(buyOut, MEME_DECIMALS)} ${sym}`} />
            <Line k="Minimum after slippage" v={`${fmtRaw(buyMin, MEME_DECIMALS)} ${sym}`} />
            <Line k="Average price" v={buyAvg ? `${fmtUsd(buyAvg)} (spot ${fmtUsd(spotUsd)})` : "–"} />
            <Line k="Fee" v={fee} />
          </div>
          {slippage}
          {!accountId ? connectBtn : (
            <div className="grid gap-2">
              <Button
                className="h-11 text-base"
                disabled={!buyRaw || buyOut <= 0n || !!buyErr || !!busy}
                onClick={async () =>
                  run("buy", `Bought ${sym}.`, [
                    ...(await storageCall()),
                    {
                      receiverId: USDC,
                      methodName: "ft_transfer_call",
                      args: { receiver_id: account, amount: buyRaw!.toString(), msg: JSON.stringify({ action: "buy", min_out: buyMin.toString() }) },
                      gas: 150,
                      deposit: "1",
                    },
                  ])
                }
              >
                {busy === "buy" ? "Waiting for the wallet…" : `Buy ${sym}`}
              </Button>
              {!user?.registered && (
                <p className="text-xs text-graphite">First buy also registers your account on {sym} (0.00125 NEAR storage).</p>
              )}
              {user && user.usdc === 0n && <GetTestUsdcButton onDone={onDone} />}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sell" className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={ids.sell}>You sell ({sym})</Label>
              {user && user.meme > 0n && (
                <button type="button" className="text-xs underline underline-offset-4" onClick={() => setSellIn(toDecimalString(user.meme, MEME_DECIMALS))}>
                  Max
                </button>
              )}
            </div>
            <Input id={ids.sell} inputMode="decimal" value={sellIn} onChange={(e) => setSellIn(e.target.value)} aria-invalid={!!sellErr} aria-describedby={`${ids.sell}-e`} className="h-11 text-lg" placeholder="0" />
            <p id={`${ids.sell}-e`} className="text-xs text-graphite">
              {sellErr ?? (user ? `Balance: ${fmtRaw(user.meme, MEME_DECIMALS)} ${sym}` : "")}
            </p>
          </div>
          <div className="border-y border-rule py-2">
            <Line k="You receive" v={`${fmtRaw(sellOut, USDC_DECIMALS, 4)} USDC`} />
            <Line k="Minimum after slippage" v={`${fmtRaw(sellMin, USDC_DECIMALS, 4)} USDC`} />
            <Line k="Fee" v={fee} />
          </div>
          {slippage}
          {!accountId ? connectBtn : (
            <Button
              className="h-11 text-base"
              disabled={!sellRaw || sellOut <= 0n || !!sellErr || !!busy}
              onClick={() =>
                run("sell", `Sold ${sym}. USDC is on its way; if the transfer fails it becomes claimable.`, [
                  { receiverId: account, methodName: "sell", args: { amount: sellRaw!.toString(), min_out: sellMin.toString() }, gas: 100, deposit: "1" },
                ])
              }
            >
              {busy === "sell" ? "Waiting for the wallet…" : `Sell ${sym}`}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="redeem" className="mt-4 grid gap-4">
          <p className={cn("border p-3 text-sm", redemptionOpen ? "border-ink bg-ink text-paper" : "border-dashed border-ink")}>
            {redemptionOpen
              ? "The redemption window is open: mNAV fell below 0.9× at the last rebalance. Burn tokens for NAV per token in USDC from the cash buffer."
              : "The redemption window is closed. It opens when a rebalance finds mNAV below 0.9×."}
          </p>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={ids.redeem}>You burn ({sym})</Label>
              {user && user.meme > 0n && (
                <button type="button" className="text-xs underline underline-offset-4" onClick={() => setRedeemIn(toDecimalString(user.meme, MEME_DECIMALS))}>
                  Max
                </button>
              )}
            </div>
            <Input id={ids.redeem} inputMode="decimal" value={redeemIn} onChange={(e) => setRedeemIn(e.target.value)} disabled={!redemptionOpen} aria-invalid={!!redeemErr} aria-describedby={`${ids.redeem}-e`} className="h-11 text-lg" placeholder="0" />
            <p id={`${ids.redeem}-e`} className="text-xs text-graphite">
              {redeemErr ?? "Paid at NAV with a fresh oracle price. If the price is stale or cash runs short, your tokens come back."}
            </p>
          </div>
          <div className="border-y border-rule py-2">
            <Line k="Estimate at last NAV" v={`${fmtRaw(redeemEst, USDC_DECIMALS, 4)} USDC`} />
            <Line k="Minimum after slippage" v={`${fmtRaw(redeemMin, USDC_DECIMALS, 4)} USDC`} />
          </div>
          {slippage}
          {!accountId ? connectBtn : (
            <Button
              className="h-11 text-base"
              disabled={!redemptionOpen || !redeemRaw || !!redeemErr || !!busy}
              onClick={() =>
                run("redeem", "Redemption sent. USDC arrives if the oracle price is fresh; otherwise your tokens are returned.", [
                  { receiverId: account, methodName: "redeem", args: { amount: redeemRaw!.toString(), min_usdc: redeemMin.toString() }, gas: 150, deposit: "1" },
                ])
              }
            >
              {busy === "redeem" ? "Waiting for the wallet…" : `Redeem ${sym}`}
            </Button>
          )}
        </TabsContent>
      </Tabs>

      {user && user.claimable > 0n && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink pt-4">
          <p className="text-sm">
            <span className="font-semibold">{fmtRaw(user.claimable, USDC_DECIMALS, 4)} USDC</span>{" "}
            <span className="text-graphite">claimable (creator fees, tips or failed payouts)</span>
          </p>
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              run("claim", "Claim sent.", [{ receiverId: account, methodName: "claim_usdc", args: {}, gas: 50, deposit: "0" }])
            }
          >
            {busy === "claim" ? "Waiting…" : "Claim USDC"}
          </Button>
        </div>
      )}

      {msg && (
        <p role={msg.tone === "error" ? "alert" : "status"} className={cn("mt-4 p-3 text-sm", msg.tone === "error" ? "bg-ink text-paper" : "border border-ink")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
