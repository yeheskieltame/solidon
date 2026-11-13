"use client";

import { ChevronDown, LockOpen, Wallet } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { LogoTile } from "./brand-logo";
import { MemeIcon } from "./meme-icon";
import { Notice } from "./notice";
import { PayFromChain } from "./pay-from-chain";
import { useToast } from "./toast";
import { FaucetLine, GetTestFundsButton } from "./wallet-controls";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHAIN_LOGOS, PLATFORM_LOGOS } from "@/lib/brands";
import { MEME_DECIMALS, NEARBLOCKS, NETWORK, USDC, USDC_DECIMALS } from "@/lib/config";
import { fmtCompact } from "@/lib/figure";
import { fmtRaw, fmtUsd, parseUnits, toBig, toDecimalString, toNumber } from "@/lib/format";
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
  // balanceTick moves after the faucet or any send, so a fresh demo wallet sees its USDC here too.
  const { balanceTick } = useWallet();
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
  }, [account, accountId, balanceTick]);
}

/** One summary row: label on the left, value on the right. */
function Row({ k, v, icon }: { k: ReactNode; v: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="flex shrink-0 items-center gap-2 text-ink-2">
        {icon}
        {k}
      </dt>
      <dd className="min-w-0 text-right tabular-nums">{v}</dd>
    </div>
  );
}

/**
 * Morpho-style amount card: label and token icon on top, a big light number, the dollar value
 * and the balance with MAX underneath. The border turns blue while it has focus.
 */
function AmountCard({
  id,
  label,
  unit,
  icon,
  value,
  onChange,
  usd,
  balance,
  quick,
  error,
}: {
  id: string;
  label: string;
  unit: string;
  icon: ReactNode;
  value: string;
  onChange?: (v: string) => void;
  usd: string;
  balance?: string | null;
  quick?: { label: string; value: string | null }[];
  error?: string | null;
}) {
  return (
    <div>
      <div className="input-card" data-invalid={!!error || undefined}>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={id} className="text-[0.9375rem] text-ink-2">
            {label} <span className="sr-only">{unit}</span>
          </label>
          <span className="inline-flex items-center gap-2 text-[0.9375rem] text-ink" aria-hidden>
            {icon}
            {unit}
          </span>
        </div>
        <input
          id={id}
          className="mt-3"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <div className="mt-3 flex min-h-7 items-center justify-between gap-3 text-sm">
          <span className="text-soft tabular-nums">{usd}</span>
          {balance !== undefined && (
            <span className="flex items-center gap-1.5">
              <span className="text-ink-2 tabular-nums">{balance ?? "–"}</span>
              {quick?.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className="max-chip"
                  disabled={q.value === null}
                  aria-pressed={q.value !== null && q.value === value}
                  onClick={() => q.value !== null && onChange?.(q.value)}
                >
                  {q.label}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-2 px-1 text-[0.8125rem] text-red-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** A share of a raw balance as a decimal string, for the quick-amount chips. */
function share(balance: bigint | undefined, pct: number, decimals: number): string | null {
  if (!balance || balance <= 0n) return null;
  return toDecimalString((balance * BigInt(pct)) / 100n, decimals);
}

const pctText = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

export function TradePanel({
  snap,
  user,
  onDone,
}: {
  snap: MemeSnapshot;
  user: UserBalances | null;
  onDone: () => void;
}) {
  const { accountId, connect, send, signHint, kind } = useWallet();
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
  const [showDetails, setShowDetails] = useState(false);
  const ids = { buy: useId(), sell: useId(), redeem: useId(), details: useId(), slip: useId() };

  const seeded = pool ? toBig(pool.usdc_reserve) > 0n : false;
  const redemptionOpen = !!treasury?.redemption_open;
  // The Redeem tab exists only while the window is open; fall back to Buy when it closes.
  const active = tab === "redeem" && !redemptionOpen ? "buy" : tab;
  const explorer = accountId ? `${NEARBLOCKS}/address/${accountId}` : undefined;

  async function run(label: string, pending: string, done: string, calls: FnCall[], detail?: string) {
    setBusy(label);
    setMsg(null);
    const id = toast.show({ tone: "pending", title: pending, body: signHint });
    try {
      const hashes = await send(calls);
      const hash = hashes.filter(Boolean).at(-1);
      setMsg({ tone: "quiet", text: detail ? `${done}. ${detail}` : `${done}.` });
      toast.update(id, {
        tone: "success",
        title: done,
        body: detail,
        href: hash ? `${NEARBLOCKS}/txns/${hash}` : explorer,
        hrefLabel: hash ? "The transaction on NearBlocks" : "Your transactions on NearBlocks",
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
  const sellAvg = sellRaw && sellOut > 0n ? toNumber(sellOut, USDC_DECIMALS) / toNumber(sellRaw, MEME_DECIMALS) : 0;
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

  const fee = `${params.pool_fee_bps / 100}%`;
  const memeQuick = [{ label: "MAX", value: share(user?.meme, 100, MEME_DECIMALS) }];
  const memeBalance = user ? `${fmtRaw(user.meme, MEME_DECIMALS)} ${sym}` : null;
  const memeUsd = (raw: bigint | null) => fmtUsd(raw ? toNumber(raw, MEME_DECIMALS) * spotUsd : 0);
  const usdcUsd = (raw: bigint | null, frac = 2) => (raw ? `$${fmtRaw(raw, USDC_DECIMALS, frac)}` : "$0");

  const memeIcon = <MemeIcon icon={metadata.icon} symbol={sym} size={22} />;
  const usdcIcon = <LogoTile logo={PLATFORM_LOGOS.usdc} size={22} decorative className="!ring-0" />;

  const slippage = (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-ink-2" id={ids.slip}>
        Max slippage
      </span>
      <span className="seg !p-0.5" role="group" aria-labelledby={ids.slip}>
        {SLIPPAGES.map((s) => (
          <button key={s} type="button" aria-pressed={slip === s} onClick={() => setSlip(s)} className="!px-2 !py-0.5 !text-[0.8125rem]">
            {s / 100}%
          </button>
        ))}
      </span>
    </div>
  );

  const network = (
    <Row
      k="Network"
      v={
        <span className="inline-flex items-center gap-2">
          <LogoTile logo={CHAIN_LOGOS.near} size={18} decorative />
          NEAR {NETWORK}
        </span>
      }
    />
  );

  /** The one-line answer to "what do I get", then the fine print behind a disclosure. */
  function quote(line: ReactNode, rows: ReactNode) {
    return (
      <div className="px-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[0.9375rem] text-ink-2" aria-live="polite">
            {line}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md text-sm text-soft hover:text-ink"
            aria-expanded={showDetails}
            aria-controls={ids.details}
            onClick={() => setShowDetails((v) => !v)}
          >
            Details
            <ChevronDown className={cn("size-4 transition-transform", showDetails && "rotate-180")} aria-hidden />
          </button>
        </div>
        <dl id={ids.details} hidden={!showDetails} className="mt-2 border-t border-line pt-1">
          {rows}
          {slippage}
          {network}
        </dl>
      </div>
    );
  }

  const feeRow = <Row k="Fee" v={`${fee} (${params.treasury_fee_bps / 100}% treasury, ${params.creator_fee_bps / 100}% creator)`} />;

  /** One full-width button whose label always says exactly what will happen, or why it cannot. */
  function action(label: string, blocked: string | null, busyKey: string, onClick: () => void, variant: "default" | "golden" | "destructive" = "default") {
    if (!accountId) {
      return (
        <Button
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
        {waiting ? <span className="dots">{kind === "demo" ? "Signing" : "Waiting for your wallet"}</span> : (blocked ?? label)}
      </Button>
    );
  }

  if (!seeded) {
    return (
      <Notice title="Trading has not opened yet">
        The creator still has to seed the pool with USDC from the launch page.
      </Notice>
    );
  }

  return (
    <div>
      <Tabs
        value={active}
        onValueChange={(v) => {
          setTab(String(v));
          setMsg(null);
        }}
      >
        <TabsList aria-label="Trade">
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
          {redemptionOpen && (
            <TabsTrigger value="redeem">
              <LockOpen aria-hidden />
              Redeem
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="buy" className="grid gap-3">
          <AmountCard
            id={ids.buy}
            label="You pay"
            unit="USDC"
            icon={usdcIcon}
            value={buyIn}
            onChange={setBuyIn}
            usd={usdcUsd(buyRaw)}
            balance={user ? `${fmtRaw(user.usdc, USDC_DECIMALS)} USDC` : null}
            quick={[{ label: "MAX", value: share(user?.usdc, 100, USDC_DECIMALS) }]}
            error={buyErr}
          />
          {quote(
            <>
              You get <span className="text-ink tabular-nums" title={`${fmtRaw(buyOut, MEME_DECIMALS)} ${sym}`}>≈ {fmtCompact(toNumber(buyOut, MEME_DECIMALS))} {sym}</span>
              <span className="text-soft"> · fee {fee}</span>
            </>,
            <>
              <Row k="Minimum received" v={`${fmtRaw(buyMin, MEME_DECIMALS)} ${sym}`} />
              <Row k="Average price" v={buyAvg ? fmtPrice(buyAvg) : "–"} />
              <Row k="Price impact, fee included" v={buyAvg && spotUsd ? pctText(buyAvg / spotUsd - 1) : "–"} />
              {feeRow}
            </>,
          )}
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
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <p className="text-sm text-ink-2">Out of USDC? It is free on testnet.</p>
                <FaucetLine />
              </div>
              <GetTestFundsButton onDone={onDone} memeId={account} />
            </div>
          )}
          {accountId && user && !user.registered && kind === "wallet" && (
            <p className="px-1 text-[0.8125rem] text-soft">
              Your first buy also registers your account on {sym} (0.00125 NEAR storage), so the wallet asks twice.
            </p>
          )}
          <PayFromChain className="mt-1 border-t border-line px-1 pt-3" onFunded={onDone} />
        </TabsContent>

        <TabsContent value="sell" className="grid gap-3">
          <AmountCard
            id={ids.sell}
            label="You sell"
            unit={sym}
            icon={memeIcon}
            value={sellIn}
            onChange={setSellIn}
            usd={memeUsd(sellRaw)}
            balance={memeBalance}
            quick={memeQuick}
            error={sellErr}
          />
          {quote(
            <>
              You get <span className="text-ink tabular-nums">≈ {fmtRaw(sellOut, USDC_DECIMALS, 4)} USDC</span>
              <span className="text-soft"> · fee {fee}</span>
            </>,
            <>
              <Row k="Minimum received" v={`${fmtRaw(sellMin, USDC_DECIMALS, 4)} USDC`} />
              <Row k="Average price" v={sellAvg ? fmtPrice(sellAvg) : "–"} />
              <Row k="Price impact, fee included" v={sellAvg && spotUsd ? pctText(sellAvg / spotUsd - 1) : "–"} />
              {feeRow}
            </>,
          )}
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
          )}
        </TabsContent>

        {redemptionOpen && (
        <TabsContent value="redeem" className="grid gap-3">
          <p className="flex items-start gap-2.5 px-1 text-sm text-green-ink">
            <LockOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
            The redemption window is open: burn tokens for NAV per token in USDC from the cash buffer.
          </p>
          <AmountCard
            id={ids.redeem}
            label="You burn"
            unit={sym}
            icon={memeIcon}
            value={redeemIn}
            onChange={setRedeemIn}
            usd={memeUsd(redeemRaw)}
            balance={memeBalance}
            quick={memeQuick}
            error={redeemErr}
          />
          {quote(
            <>
              You get <span className="text-ink tabular-nums">≈ {fmtRaw(redeemEst, USDC_DECIMALS, 4)} USDC</span>
              <span className="text-soft"> at the last NAV</span>
            </>,
            <>
              <Row k="Minimum received" v={`${fmtRaw(redeemMin, USDC_DECIMALS, 4)} USDC`} />
              <Row k="Paid at" v="NAV with a fresh oracle price" />
              <p className="py-2 text-[0.8125rem] text-soft">If the oracle price is stale or cash runs short, your tokens come back.</p>
            </>,
          )}
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
        )}
      </Tabs>

      {user && user.claimable > 0n && (
        <div className="panel mt-3 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm">
            <span className="tabular-nums">{fmtRaw(user.claimable, USDC_DECIMALS, 4)} USDC</span>{" "}
            <span className="text-soft">waiting for you (creator fees, tips or failed payouts)</span>
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
            "toast mt-3 rounded-xl p-3 text-sm break-words",
            msg.tone === "error" ? "bg-red-wash text-red-ink" : "bg-green-wash text-green-ink",
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
