"use client";

import { Lock, LockOpen, Wallet } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Notice } from "./notice";
import { Term } from "./term";
import { useToast } from "./toast";
import { GetTestUsdcButton } from "./wallet-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MEME_DECIMALS, NEARBLOCKS, USDC, USDC_DECIMALS } from "@/lib/config";
import { fmtRaw, parseUnits, toBig, toDecimalString, toNumber } from "@/lib/format";
import { PRICE_SCALE, quoteBuy, quoteSell, scaledToUsd, withSlippage } from "@/lib/math";
import { fmtPrice } from "@/lib/price";
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

function Line({ k, v }: { k: ReactNode; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <dt className="font-semibold text-soft">{k}</dt>
      <dd className="text-right font-extrabold">{v}</dd>
    </div>
  );
}

/** The big "you get" figure and its fine print. */
function Quote({ label, value, unit, children }: { label: string; value: string; unit: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-page p-4" aria-live="polite">
      <p className="text-sm font-bold text-soft">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="type-num text-[2rem] break-all">{value}</span>
        <span className="font-extrabold text-soft">{unit}</span>
      </p>
      <dl className="mt-2 border-t-2 border-line pt-2">{children}</dl>
    </div>
  );
}

/** Amount input with a unit suffix, quick chips and a balance / error line. */
function AmountField({
  id,
  label,
  unit,
  value,
  onChange,
  chips,
  hint,
  error,
  disabled,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  chips: { label: string; value: string | null }[];
  hint: string;
  error: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder="0"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          className="h-14 pr-24 font-heading text-2xl font-extrabold tracking-tight"
        />
        <span className="pointer-events-none absolute top-1/2 right-4 max-w-20 -translate-y-1/2 truncate text-sm font-extrabold text-soft">
          {unit}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Quick amounts for ${label}`}>
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            className="chip !min-h-8 flex-1 !px-2"
            disabled={disabled || c.value === null}
            aria-pressed={c.value !== null && c.value === value}
            onClick={() => c.value !== null && onChange(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p id={`${id}-hint`} className={cn("text-sm font-semibold", error ? "text-red-ink" : "text-soft")}>
        {error ?? hint}
      </p>
    </div>
  );
}

/** A share of a raw balance as a decimal string, for the percentage chips. */
function share(balance: bigint | undefined, pct: number, decimals: number): string | null {
  if (!balance || balance <= 0n) return null;
  return toDecimalString((balance * BigInt(pct)) / 100n, decimals);
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
  const toast = useToast();
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
  const explorer = accountId ? `${NEARBLOCKS}/address/${accountId}` : undefined;

  async function run(label: string, pending: string, done: string, calls: FnCall[], detail?: string) {
    setBusy(label);
    setMsg(null);
    const id = toast.show({ tone: "pending", title: pending, body: "Confirm it in your wallet." });
    try {
      await send(calls);
      setMsg({ tone: "quiet", text: detail ? `${done}. ${detail}` : `${done}.` });
      toast.update(id, {
        tone: "success",
        title: done,
        body: detail,
        href: explorer,
        hrefLabel: "Your transactions on NearBlocks",
        confetti: true,
      });
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
      toast.update(id, { tone: "error", title: "That did not go through", body: errorText(e) });
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
  const buyShort = !!user && !!buyRaw && buyRaw > user.usdc;
  const buyErr =
    buyIn && !buyRaw ? "Enter an amount with up to 6 decimals." :
    buyShort ? "More than your USDC balance." : null;

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
  const memeChips = [25, 50, 75].map((p) => ({ label: `${p}%`, value: share(user?.meme, p, MEME_DECIMALS) }));
  memeChips.push({ label: "Max", value: share(user?.meme, 100, MEME_DECIMALS) });

  const slippage = (
    <fieldset className="flex flex-wrap items-center gap-2 text-sm">
      <legend className="sr-only">Slippage tolerance</legend>
      <span className="mr-auto font-bold text-soft">
        <Term tip="How far the price may move against you before the trade is cancelled instead of filled." align="start">
          Slippage
        </Term>
      </span>
      {SLIPPAGES.map((s) => (
        <button key={s} type="button" aria-pressed={slip === s} onClick={() => setSlip(s)} className="chip !min-h-8 !px-2.5">
          {s / 100}%
        </button>
      ))}
    </fieldset>
  );

  /** One chunky button whose label always says exactly what will happen, or why it cannot. */
  function action(label: string, blocked: string | null, busyKey: string, onClick: () => void, variant: "default" | "golden" | "destructive" = "default") {
    if (!accountId) {
      return (
        <Button
          variant="blue"
          size="lg"
          className="w-full"
          onClick={() => connect().catch((e) => toast.show({ tone: "error", title: "Could not open the wallet picker", body: errorText(e) }))}
        >
          <Wallet aria-hidden />
          Connect a wallet
        </Button>
      );
    }
    const waiting = busy === busyKey;
    return (
      <Button variant={variant} size="lg" className="w-full whitespace-normal" disabled={!!blocked || !!busy} onClick={onClick}>
        {waiting ? <span className="dots">Waiting for your wallet</span> : (blocked ?? label)}
      </Button>
    );
  }

  if (!seeded) {
    return (
      <Notice sticker="lander" title="Trading has not opened yet">
        The creator still has to seed the pool with USDC from the launch page.
      </Notice>
    );
  }

  return (
    <div className="card p-4 sm:p-5">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(String(v));
          setMsg(null);
        }}
      >
        <TabsList aria-label="Trade">
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
          <TabsTrigger value="redeem">
            {redemptionOpen ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
            Redeem
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="grid gap-4">
          <AmountField
            id={ids.buy}
            label="You pay"
            unit="USDC"
            value={buyIn}
            onChange={setBuyIn}
            chips={[
              { label: "25", value: "25" },
              { label: "50", value: "50" },
              { label: "100", value: "100" },
              { label: "Max", value: share(user?.usdc, 100, USDC_DECIMALS) },
            ]}
            hint={user ? `Balance: ${fmtRaw(user.usdc, USDC_DECIMALS)} USDC` : "Connect a wallet to see your balance."}
            error={buyErr}
          />
          <Quote label="You get about" value={fmtRaw(buyOut, MEME_DECIMALS)} unit={sym}>
            <Line k="At least, after slippage" v={`${fmtRaw(buyMin, MEME_DECIMALS)} ${sym}`} />
            <Line k="Average price" v={buyAvg ? `${fmtPrice(buyAvg)} (spot ${fmtPrice(spotUsd)})` : "–"} />
            <Line k="Fee" v={fee} />
          </Quote>
          {slippage}
          {action(
            `Buy ~${fmtRaw(buyOut, MEME_DECIMALS)} ${sym} for ${buyRaw ? fmtRaw(buyRaw, USDC_DECIMALS) : "0"} USDC`,
            !buyIn.trim() || buyRaw === 0n ? "Enter an amount" : !buyRaw ? "Enter a valid amount" : buyShort ? "Not enough USDC" : buyOut <= 0n ? "Amount too small" : null,
            "buy",
            async () =>
              run("buy", `Buying ${sym}`, `Bought ${sym}`, [
                ...(await storageCall()),
                {
                  receiverId: USDC,
                  methodName: "ft_transfer_call",
                  args: { receiver_id: account, amount: buyRaw!.toString(), msg: JSON.stringify({ action: "buy", min_out: buyMin.toString() }) },
                  gas: 150,
                  deposit: "1",
                },
              ]),
          )}
          {accountId && (buyShort || (user && user.usdc === 0n)) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-golden-wash p-3">
              <p className="text-sm font-bold text-golden-ink">Out of USDC? It is free on testnet.</p>
              <GetTestUsdcButton onDone={onDone} />
            </div>
          )}
          {accountId && user && !user.registered && (
            <p className="text-sm font-semibold text-soft">
              Your first buy also registers your account on {sym} (0.00125 NEAR storage), so the wallet asks twice.
            </p>
          )}
        </TabsContent>

        <TabsContent value="sell" className="grid gap-4">
          <AmountField
            id={ids.sell}
            label="You sell"
            unit={sym}
            value={sellIn}
            onChange={setSellIn}
            chips={memeChips}
            hint={user ? `Balance: ${fmtRaw(user.meme, MEME_DECIMALS)} ${sym}` : "Connect a wallet to see your balance."}
            error={sellErr}
          />
          <Quote label="You get about" value={fmtRaw(sellOut, USDC_DECIMALS, 4)} unit="USDC">
            <Line k="At least, after slippage" v={`${fmtRaw(sellMin, USDC_DECIMALS, 4)} USDC`} />
            <Line k="Fee" v={fee} />
          </Quote>
          {slippage}
          {action(
            `Sell ${sellRaw ? fmtRaw(sellRaw, MEME_DECIMALS) : "0"} ${sym} for ~${fmtRaw(sellOut, USDC_DECIMALS, 4)} USDC`,
            !sellIn.trim() || sellRaw === 0n ? "Enter an amount" : !sellRaw ? "Enter a valid amount" : sellErr ? `Not enough ${sym}` : sellOut <= 0n ? "Amount too small" : null,
            "sell",
            () =>
              run(
                "sell",
                `Selling ${sym}`,
                `Sold ${sym}`,
                [{ receiverId: account, methodName: "sell", args: { amount: sellRaw!.toString(), min_out: sellMin.toString() }, gas: 100, deposit: "1" }],
                "USDC is on its way; if the transfer fails it becomes claimable.",
              ),
            "golden",
          )}
        </TabsContent>

        <TabsContent value="redeem" className="grid gap-4">
          <div
            className={cn(
              "flex items-start gap-3 rounded-2xl border-2 p-3.5 text-sm font-semibold",
              redemptionOpen ? "border-green bg-green-wash" : "border-line bg-page text-soft",
            )}
          >
            {redemptionOpen ? <LockOpen className="mt-0.5 size-5 shrink-0" aria-hidden /> : <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />}
            <p>
              {redemptionOpen
                ? "The window is open: mNAV fell below 0.9× at the last rebalance. Burn tokens for NAV per token in USDC from the cash buffer."
                : "The window is closed. It opens when a rebalance finds mNAV below 0.9×."}
            </p>
          </div>
          <AmountField
            id={ids.redeem}
            label="You burn"
            unit={sym}
            value={redeemIn}
            onChange={setRedeemIn}
            chips={memeChips}
            disabled={!redemptionOpen}
            hint="Paid at NAV with a fresh oracle price. If the price is stale or cash runs short, your tokens come back."
            error={redeemErr}
          />
          <Quote label="You get about, at the last NAV" value={fmtRaw(redeemEst, USDC_DECIMALS, 4)} unit="USDC">
            <Line k="At least, after slippage" v={`${fmtRaw(redeemMin, USDC_DECIMALS, 4)} USDC`} />
          </Quote>
          {slippage}
          {action(
            `Burn ${redeemRaw ? fmtRaw(redeemRaw, MEME_DECIMALS) : "0"} ${sym} for ~${fmtRaw(redeemEst, USDC_DECIMALS, 4)} USDC`,
            !redemptionOpen ? "Redemption is closed" : !redeemIn.trim() || redeemRaw === 0n ? "Enter an amount" : !redeemRaw ? "Enter a valid amount" : redeemErr ? `Not enough ${sym}` : null,
            "redeem",
            () =>
              run(
                "redeem",
                `Redeeming ${sym}`,
                `Redemption sent`,
                [{ receiverId: account, methodName: "redeem", args: { amount: redeemRaw!.toString(), min_usdc: redeemMin.toString() }, gas: 150, deposit: "1" }],
                "USDC arrives if the oracle price is fresh; otherwise your tokens are returned.",
              ),
            "destructive",
          )}
        </TabsContent>
      </Tabs>

      {user && user.claimable > 0n && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-golden-wash p-3.5">
          <p className="text-sm">
            <span className="font-extrabold">{fmtRaw(user.claimable, USDC_DECIMALS, 4)} USDC</span>{" "}
            <span className="font-semibold text-golden-ink">waiting for you (creator fees, tips or failed payouts)</span>
          </p>
          <Button
            variant="golden"
            size="sm"
            disabled={!!busy}
            onClick={() =>
              run("claim", "Claiming USDC", "Claimed USDC", [{ receiverId: account, methodName: "claim_usdc", args: {}, gas: 50, deposit: "0" }])
            }
          >
            {busy === "claim" ? <span className="dots">Waiting</span> : `Claim ${fmtRaw(user.claimable, USDC_DECIMALS, 4)} USDC`}
          </Button>
        </div>
      )}

      {msg && (
        <p
          role={msg.tone === "error" ? "alert" : "status"}
          className={cn(
            "pop mt-4 rounded-2xl border-2 p-3 text-sm font-bold break-words",
            msg.tone === "error" ? "border-red bg-red-wash text-red-ink" : "border-green bg-green-wash text-green-ink",
          )}
        >
          {msg.text}{" "}
          {msg.tone !== "error" && explorer && (
            <a className="link" href={explorer} target="_blank" rel="noreferrer">
              View on NearBlocks
            </a>
          )}
        </p>
      )}
    </div>
  );
}
