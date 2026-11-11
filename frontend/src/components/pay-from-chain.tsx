"use client";

// "Pay from another chain": a NEAR Intents 1Click quote for any asset 1Click routes into USDC on
// NEAR, the asset a Solidon buy is paid in. On testnet it is a preview of the mainnet route (dry
// quotes only); with NEXT_PUBLIC_NETWORK=mainnet it requests a deposit address and follows the
// swap until the USDC lands in the user's NEAR account.

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { LogoTile } from "./brand-logo";
import { CopyButton } from "./copy-button";
import { Button } from "@/components/ui/button";
import { CHAIN_LOGOS, PLATFORM_LOGOS, type BrandLogo } from "@/lib/brands";
import { fmtAmount, fmtUsd, parseUnits, shortAddr, toDecimalString } from "@/lib/format";
import {
  CURATED,
  ONECLICK_LIVE,
  assetLogoKey,
  chainName,
  fetchOneClickQuote,
  fetchOneClickStatus,
  fetchOneClickTokens,
  friendlyQuoteError,
  isMainnetRecipient,
  type OneClickQuoteResponse,
  type OneClickStatus,
  type OneClickToken,
} from "@/lib/oneclick";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet } from "@/lib/wallet";

/** A mainnet account that exists, used as recipient while previewing for a testnet-only account. */
const STAND_IN = "intents.near";
const START_USD = 25;

const LOGOS: Record<string, BrandLogo> = { ...CHAIN_LOGOS, usdc: PLATFORM_LOGOS.usdc };

function AssetLogo({ t, size = 22 }: { t: Pick<OneClickToken, "symbol" | "blockchain">; size?: number }) {
  const key = assetLogoKey(t);
  const logo = key ? LOGOS[key] : undefined;
  if (logo) return <LogoTile logo={logo} size={size} decorative className={key === "usdc" ? "!ring-0" : undefined} />;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-page-deep font-medium text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {t.symbol.slice(0, 3)}
    </span>
  );
}

/** About `usd` worth of the token, rounded to two significant digits, as a decimal string. */
function startAmount(t: OneClickToken): string {
  if (!t.price || t.price <= 0) return "";
  const n = START_USD / t.price;
  const digits = Math.max(0, Math.min(t.decimals, 1 - Math.floor(Math.log10(n))));
  return Number(n.toFixed(digits)).toString();
}

const secs = (s?: number) => (s === undefined ? "–" : s < 90 ? `about ${s} s` : `about ${Math.round(s / 60)} min`);

const STATUS_TEXT: Record<OneClickStatus, string> = {
  PENDING_DEPOSIT: "Waiting for your deposit",
  KNOWN_DEPOSIT_TX: "Deposit seen, waiting for confirmations",
  PROCESSING: "Swapping into USDC on NEAR",
  SUCCESS: "Done: the USDC is in your NEAR account",
  INCOMPLETE_DEPOSIT: "The deposit was smaller than quoted; it will be refunded",
  REFUNDED: "Refunded",
  FAILED: "The swap failed; the deposit is refunded",
};

export function PayFromChain({ className, onFunded }: { className?: string; onFunded?: () => void }) {
  const { accountId, connect } = useWallet();
  const [open, setOpen] = useState(false);
  const ids = { panel: useId(), amount: useId(), search: useId(), list: useId(), refund: useId(), details: useId() };

  return (
    <div className={className}>
      <button
        type="button"
        className="group flex w-full items-center gap-3 rounded-lg py-1 text-left text-sm text-ink-2 hover:text-ink"
        aria-expanded={open}
        aria-controls={ids.panel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex shrink-0 -space-x-1.5" aria-hidden>
          <LogoTile logo={CHAIN_LOGOS.solana} size={18} decorative />
          <LogoTile logo={CHAIN_LOGOS.base} size={18} decorative />
          <LogoTile logo={CHAIN_LOGOS.bitcoin} size={18} decorative />
        </span>
        <span className="flex-1">Pay from another chain</span>
        <ChevronDown className={cn("size-4 text-soft transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={ids.panel} hidden={!open}>
        {open && <Body ids={ids} accountId={accountId} connect={connect} onFunded={onFunded} />}
      </div>
    </div>
  );
}

type QuoteState = { key: string; data?: OneClickQuoteResponse; error?: string };

function Body({
  ids,
  accountId,
  connect,
  onFunded,
}: {
  ids: { amount: string; search: string; list: string; refund: string; details: string };
  accountId: string | null;
  connect: () => Promise<unknown>;
  onFunded?: () => void;
}) {
  const tokens = useAsync(fetchOneClickTokens, []);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [amountIn, setAmountIn] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [refundTo, setRefundTo] = useState("");
  const [deposit, setDeposit] = useState<{ res: OneClickQuoteResponse; token: OneClickToken } | null>(null);
  const [depositErr, setDepositErr] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const list = useMemo(() => tokens.data ?? [], [tokens.data]);
  const curated = useMemo(
    () => CURATED.map(([chain, sym]) => list.find((t) => t.blockchain === chain && t.symbol === sym)).filter((t): t is OneClickToken => !!t),
    [list],
  );
  // USDC on NEAR is the destination itself, not something to pay with.
  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    const curatedIds = new Set(curated.map((t) => t.assetId));
    return list
      .filter((t) => !curatedIds.has(t.assetId) && !(t.blockchain === "near" && t.symbol === "USDC"))
      .filter((t) => !q || t.symbol.toLowerCase().includes(q) || chainName(t.blockchain).toLowerCase().includes(q))
      .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.blockchain.localeCompare(b.blockchain));
  }, [list, curated, query]);

  const token = list.find((t) => t.assetId === assetId) ?? curated[0] ?? null;
  const amount = amountIn ?? (token ? startAmount(token) : "");
  const raw = token ? parseUnits(amount, token.decimals) : null;
  const usdIn = token?.price && raw ? Number(toDecimalString(raw, token.decimals)) * token.price : null;

  const preview = !ONECLICK_LIVE;
  const recipient = isMainnetRecipient(accountId) ? accountId : preview ? STAND_IN : null;
  const standIn = recipient === STAND_IN && accountId !== STAND_IN;
  const key = token && raw && recipient ? `${token.assetId}|${raw}|${recipient}` : "";

  // A dry quote, 500 ms after the last keystroke; an older answer never overwrites a newer one.
  useEffect(() => {
    if (!key || !token || !raw || !recipient) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetchOneClickQuote({ originAsset: token.assetId, amount: raw.toString(), recipient, dry: true }, ctrl.signal)
        .then((data) => setQuote({ key, data }))
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setQuote({ key, error: friendlyQuoteError(errorText(e), token) });
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // token and raw are captured through key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = quote?.key === key ? quote : null;
  const loading = !!key && !current;
  const q = current?.data?.quote;
  const feeBps = current?.data?.quoteRequest?.appFees?.reduce((s, f) => s + f.fee, 0) ?? 0;
  const costUsd = q?.amountInUsd && q.amountOutUsd ? Number(q.amountInUsd) - Number(q.amountOutUsd) : null;
  const inputErr = amount && !raw ? `Enter an amount with up to ${token?.decimals ?? 6} decimals.` : null;

  function pick(t: OneClickToken) {
    setAssetId(t.assetId);
    setAmountIn(null);
    setPicking(false);
    setQuery("");
    setDeposit(null);
  }

  async function requestDeposit() {
    if (!token || !raw || !recipient) return;
    setRequesting(true);
    setDepositErr(null);
    try {
      const res = await fetchOneClickQuote({
        originAsset: token.assetId,
        amount: raw.toString(),
        recipient,
        refundTo: refundTo.trim() || undefined,
        dry: false,
      });
      if (!res.quote.depositAddress) throw new Error("1Click returned no deposit address.");
      setDeposit({ res, token });
    } catch (e) {
      setDepositErr(friendlyQuoteError(errorText(e), token));
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3">
      {preview && (
        <p className="rounded-xl bg-blue-wash px-3 py-2 text-[0.8125rem] text-blue-ink">
          Mainnet route preview — on testnet use Get test funds. Quotes are live; no deposit address is issued and nothing is swapped.
        </p>
      )}

      {tokens.error ? (
        <p className="px-1 text-sm text-red-ink" role="alert">
          {friendlyQuoteError(tokens.error, null)}{" "}
          <button type="button" className="link" onClick={tokens.reload}>
            Try again
          </button>
        </p>
      ) : (
        <div>
          <div className="input-card" data-invalid={!!inputErr || undefined}>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={ids.amount} className="text-[0.9375rem] text-ink-2">
                You send
              </label>
              <button
                type="button"
                className="-my-1 inline-flex items-center gap-2 rounded-full bg-page-deep py-1 pr-2.5 pl-1 text-[0.9375rem] text-ink hover:bg-[var(--hover)] disabled:opacity-60"
                aria-expanded={picking}
                aria-controls={ids.list}
                disabled={!token}
                onClick={() => setPicking((v) => !v)}
              >
                {token ? (
                  <>
                    <AssetLogo t={token} />
                    {token.symbol}
                    <span className="text-[0.8125rem] text-soft">{chainName(token.blockchain)}</span>
                  </>
                ) : (
                  <span className="dots px-2 text-soft">Loading</span>
                )}
                <ChevronDown className="size-3.5 text-soft" aria-hidden />
                <span className="sr-only">: change the asset</span>
              </button>
            </div>
            <input
              id={ids.amount}
              className="mt-3"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmountIn(e.target.value);
                setDeposit(null);
              }}
              aria-invalid={!!inputErr}
            />
            <p className="mt-2 text-sm text-soft tabular-nums">{usdIn !== null ? `≈ ${fmtUsd(usdIn)}` : " "}</p>
          </div>
          {inputErr && <p className="mt-2 px-1 text-[0.8125rem] text-red-ink">{inputErr}</p>}
        </div>
      )}

      {picking && (
        <div id={ids.list} className="panel p-2">
          <ul className="grid grid-cols-2 gap-1" aria-label="Common assets">
            {curated.map((t) => (
              <li key={t.assetId}>
                <AssetButton t={t} selected={t.assetId === token?.assetId} onPick={pick} />
              </li>
            ))}
          </ul>
          <div className="relative mt-2 border-t border-line pt-2">
            <label htmlFor={ids.search} className="sr-only">
              Search all assets
            </label>
            <Search className="pointer-events-none absolute top-[calc(50%+0.25rem)] left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              id={ids.search}
              type="search"
              className="field !min-h-9 pl-9 !text-sm"
              placeholder={`Search ${list.length} assets`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="mt-1 max-h-56 overflow-y-auto" aria-label="All assets">
            {others.slice(0, 60).map((t) => (
              <li key={t.assetId}>
                <AssetButton t={t} selected={t.assetId === token?.assetId} onPick={pick} wide />
              </li>
            ))}
            {others.length === 0 && <li className="px-2 py-3 text-sm text-soft">No asset matches.</li>}
            {others.length > 60 && <li className="px-2 py-2 text-[0.8125rem] text-soft">Type to narrow {others.length - 60} more.</li>}
          </ul>
        </div>
      )}

      {token && !tokens.error && (
        <div className="px-1" aria-live="polite">
          {!recipient ? (
            <p className="text-sm text-soft">
              <button type="button" className="link" onClick={() => connect().catch(() => undefined)}>
                Connect a NEAR wallet
              </button>{" "}
              to quote a route into your account.
            </p>
          ) : current?.error ? (
            <p className="text-sm text-red-ink">{current.error}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className={cn("text-[0.9375rem] text-ink-2", loading && "opacity-60")}>
                  You get{" "}
                  <span className="text-ink tabular-nums">{q ? `≈ ${fmtAmount(Number(q.amountOutFormatted), 2)} USDC` : loading ? <span className="dots">Quoting</span> : "–"}</span>
                  <span className="text-soft"> on NEAR{q ? ` · ${secs(q.timeEstimate)}` : ""}</span>
                </p>
                {q && (
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
                )}
              </div>
              {q && (
                <dl id={ids.details} hidden={!showDetails} className="mt-2 border-t border-line pt-1 text-sm">
                  <Line k="Minimum received" v={`${fmtAmount(Number(q.minAmountOut) / 1e6, 4)} USDC`} />
                  <Line
                    k="Route cost"
                    v={costUsd !== null ? `${fmtUsd(Math.max(0, costUsd))}${feeBps ? ` (incl. ${feeBps / 100}% 1Click fee)` : ""}` : "–"}
                  />
                  <Line k="Arrives in" v={secs(q.timeEstimate)} />
                  <Line k="To" v={<span title={recipient}>{shortAddr(recipient, 8, 6)} on NEAR</span>} />
                </dl>
              )}
              {standIn && (
                <p className="mt-1 text-[0.8125rem] text-soft">
                  {accountId ? `${accountId} exists only on testnet, so` : "Without a wallet,"} this preview quotes to {STAND_IN} on mainnet.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {ONECLICK_LIVE && token && recipient && !deposit && (
        <div className="grid gap-2">
          <label htmlFor={ids.refund} className="px-1 text-[0.8125rem] text-soft">
            Refund address on {chainName(token.blockchain)} (optional; otherwise refunds go to your NEAR account in NEAR Intents)
          </label>
          <input id={ids.refund} className="field !min-h-10 !text-sm" value={refundTo} onChange={(e) => setRefundTo(e.target.value)} autoComplete="off" />
          <Button size="lg" className="w-full" disabled={!q || requesting} onClick={requestDeposit}>
            {requesting ? <span className="dots">Requesting</span> : `Get a ${token.symbol} deposit address`}
          </Button>
          {depositErr && (
            <p className="px-1 text-sm text-red-ink" role="alert">
              {depositErr}
            </p>
          )}
        </div>
      )}

      {deposit && <DepositBox res={deposit.res} token={deposit.token} onFunded={onFunded} />}
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-ink-2">{k}</dt>
      <dd className="min-w-0 text-right tabular-nums">{v}</dd>
    </div>
  );
}

function AssetButton({ t, selected, onPick, wide }: { t: OneClickToken; selected: boolean; onPick: (t: OneClickToken) => void; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onPick(t)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]",
        selected && "bg-page-deep",
      )}
    >
      <AssetLogo t={t} size={wide ? 22 : 24} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-ink">{t.symbol}</span>
        <span className="block truncate text-[0.75rem] text-soft">{chainName(t.blockchain)}</span>
      </span>
      {selected && <Check className="size-4 shrink-0 text-blue-ink" aria-hidden />}
    </button>
  );
}

/** Mainnet only: where to send, then the swap's status every 5 seconds until it settles. */
function DepositBox({ res, token, onFunded }: { res: OneClickQuoteResponse; token: OneClickToken; onFunded?: () => void }) {
  const address = res.quote.depositAddress!;
  const [status, setStatus] = useState<OneClickStatus>("PENDING_DEPOSIT");
  const [pollErr, setPollErr] = useState<string | null>(null);
  const funded = useRef(false);

  useEffect(() => {
    let live = true;
    const tick = () =>
      fetchOneClickStatus(address)
        .then((s) => {
          if (!live) return;
          setStatus(s.status);
          setPollErr(null);
          if (s.status === "SUCCESS" && !funded.current) {
            funded.current = true;
            onFunded?.();
          }
        })
        .catch((e: unknown) => live && setPollErr(errorText(e)));
    const timer = setInterval(() => {
      if (!["SUCCESS", "REFUNDED", "FAILED"].includes(status)) void tick();
    }, 5_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [address, status, onFunded]);

  const done = status === "SUCCESS";
  const bad = status === "REFUNDED" || status === "FAILED" || status === "INCOMPLETE_DEPOSIT";
  return (
    <div className="panel grid gap-3 p-4">
      <p className="text-sm text-ink-2">
        Send exactly <span className="text-ink tabular-nums">{res.quote.amountInFormatted} {token.symbol}</span> on {chainName(token.blockchain)} to
      </p>
      <p className="flex items-center gap-1 rounded-lg bg-page-deep px-3 py-2 font-mono text-[0.8125rem] break-all">
        <span className="min-w-0 flex-1">{address}</span>
        <CopyButton value={address} label="deposit address" />
      </p>
      {res.quote.depositMemo && (
        <p className="text-sm text-orange-ink">
          Include the memo <span className="font-mono">{res.quote.depositMemo}</span>, or the deposit cannot be matched.
        </p>
      )}
      {res.quote.deadline && <p className="text-[0.8125rem] text-soft">Valid until {new Date(res.quote.deadline).toLocaleTimeString()}.</p>}
      <p role="status" className={cn("text-sm", done ? "text-green-ink" : bad ? "text-orange-ink" : "text-ink-2")}>
        {!done && !bad && <span className="live-dot mr-2" aria-hidden />}
        {STATUS_TEXT[status]}
      </p>
      {pollErr && <p className="text-[0.8125rem] text-soft">Status check failed ({pollErr}); retrying.</p>}
    </div>
  );
}
