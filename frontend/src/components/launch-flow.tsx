"use client";

import { ArrowRight, Check, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { MemeIcon } from "./meme-icon";
import { MnavGauge } from "./mnav-gauge";
import { Notice } from "./notice";
import { Sticker } from "./sticker";
import { useToast } from "./toast";
import { GetTestUsdcButton, useUsdcBalance } from "./wallet-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { KNOWN_CHAINS, chainMeta } from "@/lib/chains";
import { FACTORY, NEARBLOCKS, USDC, USDC_DECIMALS } from "@/lib/config";
import { fmtAmount, fmtRaw, parseUnits, toBig, toDecimalString, toNumber } from "@/lib/format";
import { factory, tryView, type FtMetadata, type MemeInfo, type PoolView, type Stock, type StorageBalance, type TreasuryChainsRaw } from "@/lib/near";
import { useAsync } from "@/lib/use-async";
import { TESTNET_VENUES } from "@/lib/venues";
import { errorText, useWallet } from "@/lib/wallet";

const SYMBOL_RE = /^[A-Za-z0-9]{2,10}$/;
const MAX_ICON_BYTES = 8 * 1024;
const FALLBACK_STORAGE_DEPOSIT = "1250000000000000000000"; // 0.00125 NEAR

function memeAccountFor(symbol: string) {
  return `${symbol.toLowerCase()}.${FACTORY}`;
}

function stockChains(s: Stock): string[] {
  if (s.venues?.length) {
    return s.venues.map((v) => chainMeta(v.chain)?.label ?? v.chain);
  }
  const reg = TESTNET_VENUES[s.ticker];
  return KNOWN_CHAINS.filter((c) => reg?.[c.key as "base"]).map((c) => c.label);
}

/** Resizes an image file to a 64×64 data URL small enough for on-chain metadata. */
async function iconDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    const side = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 64, 64);
    for (const [type, q] of [["image/webp", 0.85], ["image/png", undefined], ["image/jpeg", 0.7]] as const) {
      const data = canvas.toDataURL(type, q);
      if (data.startsWith(`data:${type}`) && data.length <= MAX_ICON_BYTES) return data;
    }
    throw new Error("The icon is still larger than 8 KB after resizing. Try a simpler image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Progress = {
  exists: boolean;
  creator: string | null;
  seeded: boolean;
  usdcReserve: bigint;
  treasury: "ready" | "missing" | "unsupported";
  usdcRegistered: boolean;
  /** For the preview card when a launch is resumed. */
  meta: FtMetadata | null;
  ticker: string | null;
};

async function loadProgress(account: string): Promise<Progress> {
  const meta = await tryView<FtMetadata>(account, "ft_metadata");
  if (!meta) {
    return { exists: false, creator: null, seeded: false, usdcReserve: 0n, treasury: "missing", usdcRegistered: false, meta: null, ticker: null };
  }
  const [info, pool, chains, storage] = await Promise.all([
    tryView<MemeInfo>(account, "get_info"),
    tryView<PoolView>(account, "get_pool"),
    tryView<TreasuryChainsRaw>(account, "get_treasury_chains"),
    tryView<StorageBalance | null>(USDC, "storage_balance_of", { account_id: account }),
  ]);
  const reserve = toBig(pool?.usdc_reserve);
  return {
    exists: true,
    creator: info?.creator ?? null,
    seeded: reserve > 0n,
    usdcReserve: reserve,
    treasury: !chains ? "unsupported" : chains.address || chains.evm_address ? "ready" : "missing",
    usdcRegistered: !!storage,
    meta,
    ticker: info?.stock.ticker ?? null,
  };
}

const STEPS = [
  { title: "Create", hint: "Name it, pick its stock" },
  { title: "Seed", hint: "Add the first USDC" },
  { title: "Open treasury", hint: "Derive its addresses" },
];

/** The visible stepper: done steps get a green tick, the current one is raised. */
function Stepper({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Launch steps">
      {STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li
            key={s.title}
            aria-current={state === "active" ? "step" : undefined}
            className={cn(
              "relative flex flex-col items-start gap-1.5 rounded-2xl border-2 p-2.5 transition-colors sm:flex-row sm:items-center sm:gap-2.5 sm:p-3",
              state === "active" && "border-ink bg-white shadow-[0_4px_0_var(--ink)]",
              state === "done" && "border-green bg-green-wash",
              state === "todo" && "border-dashed border-line-strong",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border-2 font-heading text-lg font-black",
                state === "active" && "border-ink bg-golden",
                state === "done" && "border-ink bg-green",
                state === "todo" && "border-line-strong text-soft",
              )}
              aria-hidden
            >
              {state === "done" ? <Check className="size-5" strokeWidth={3.5} /> : i + 1}
            </span>
            <span className="min-w-0 leading-tight">
              <span className={cn("block text-[0.8125rem] font-extrabold sm:text-base", state === "todo" && "text-soft")}>
                {s.title}
                <span className="sr-only">
                  {state === "done" ? " (done)" : state === "active" ? " (current step)" : " (not yet)"}
                </span>
              </span>
              <span className="hidden truncate text-[0.8125rem] font-semibold text-soft sm:block">{s.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ n, title, intro, children, next }: { n: number; title: string; intro: ReactNode; children: ReactNode; next: string }) {
  return (
    <section className="card pop p-5 sm:p-7" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="type-h2 !text-[clamp(1.6rem,3vw,2.1rem)]">
        {title}
      </h2>
      <p className="mt-2 max-w-[56ch] font-semibold text-soft">{intro}</p>
      <div className="mt-6">{children}</div>
      <p className="mt-6 flex items-start gap-2 rounded-2xl bg-page p-3 text-sm font-bold">
        <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="text-soft">What happens next: </span>
          {next}
        </span>
      </p>
    </section>
  );
}

export function LaunchFlow() {
  const { accountId, connect, send } = useWallet();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const target = params.get("meme");

  const stocks = useAsync(() => factory.stocks(), []);
  const cost = useAsync(() => factory.launchCost(), []);
  const progress = useAsync(async () => (target ? loadProgress(target) : null), [target]);
  const usdc = useUsdcBalance(accountId);
  const mine = useAsync(async () => {
    if (!accountId) return [];
    const memes = await factory.memes();
    const infos = await Promise.all(
      memes.map(async (m) => ({ m, info: await tryView<MemeInfo>(m, "get_info") })),
    );
    return infos.filter((x) => x.info?.creator === accountId).map((x) => x.m);
  }, [accountId]);

  // Step 1 form.
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [ticker, setTicker] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [iconErr, setIconErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);
  const [seed, setSeed] = useState("1000");
  const ids = { name: useId(), symbol: useId(), stock: useId(), icon: useId(), seed: useId() };

  const symbolOk = SYMBOL_RE.test(symbol);
  const candidate = symbolOk ? memeAccountFor(symbol) : null;
  const taken = useAsync(async () => {
    if (!candidate) return null;
    await new Promise((r) => setTimeout(r, 350));
    return !!(await tryView(candidate, "ft_metadata"));
  }, [candidate]);

  const costNear = cost.data ? toNumber(toBig(cost.data), 24) : null;
  const costLabel = costNear !== null ? `${fmtAmount(costNear, 3)} NEAR` : "the launch cost";
  const p = progress.data;
  const resuming = !!target && progress.loading && !p;
  const current = !p?.exists ? 0 : !p.seeded ? 1 : p.treasury === "missing" ? 2 : 3;
  const isCreator = !!accountId && p?.creator === accountId;
  const seedRaw = parseUnits(seed, USDC_DECIMALS);
  const selected = stocks.data?.find((s) => s.ticker === ticker) ?? null;
  const seedShort = !!seedRaw && (usdc.data ?? 0n) < seedRaw;

  async function run(label: string, pending: string, done: string, fn: () => Promise<void>) {
    setBusy(label);
    setTxErr(null);
    const id = toast.show({ tone: "pending", title: pending, body: "Confirm it in your wallet." });
    try {
      await fn();
      toast.update(id, {
        tone: "success",
        title: done,
        href: accountId ? `${NEARBLOCKS}/address/${accountId}` : undefined,
        hrefLabel: "Your transactions on NearBlocks",
        confetti: true,
      });
    } catch (e) {
      setTxErr(errorText(e));
      toast.update(id, { tone: "error", title: "That did not go through", body: errorText(e) });
    } finally {
      setBusy(null);
      progress.reload();
      usdc.reload();
    }
  }

  const launch = () =>
    run("launch", `Creating ${symbol}`, `${symbol} is live`, async () => {
      if (!candidate || !cost.data) return;
      // Put the account in the URL first, so a redirecting wallet returns to step 2.
      router.replace(`${pathname}?meme=${candidate}`);
      await send([
        {
          receiverId: FACTORY,
          methodName: "create_meme",
          args: { name: name.trim(), symbol, thesis_stock: ticker, icon },
          gas: 300,
          deposit: cost.data,
        },
      ]);
    });

  const seedPool = () =>
    run("seed", "Seeding the pool", "Pool seeded", async () => {
      if (!target || !seedRaw) return;
      const calls = [];
      if (!p?.usdcRegistered) {
        const bounds = await tryView<{ min: string }>(USDC, "storage_balance_bounds");
        calls.push({
          receiverId: USDC,
          methodName: "storage_deposit",
          args: { account_id: target, registration_only: true },
          gas: 30,
          deposit: bounds?.min ?? FALLBACK_STORAGE_DEPOSIT,
        });
      }
      calls.push({
        receiverId: USDC,
        methodName: "ft_transfer_call",
        args: { receiver_id: target, amount: seedRaw.toString(), msg: JSON.stringify({ action: "seed" }) },
        gas: 150,
        deposit: "1",
      });
      await send(calls);
    });

  const initTreasury = () =>
    run("treasury", "Opening the treasury", "Treasury opened", async () => {
      if (!target) return;
      await send([{ receiverId: target, methodName: "init_treasury", args: {}, gas: 100, deposit: "0" }]);
    });

  const formValid =
    name.trim().length > 0 && symbolOk && taken.data === false && !!ticker && !!cost.data;
  const formBlocked = !name.trim()
    ? "Give it a name"
    : !symbolOk
      ? "Pick a ticker (2 to 10 letters)"
      : taken.loading || taken.data === null || taken.data === undefined
        ? "Checking the ticker…"
        : taken.data
          ? "That ticker is taken"
          : !ticker
            ? "Pick a stock"
            : !cost.data
              ? "Reading the launch cost…"
              : null;

  const connectBtn = (label: string) => (
    <Button
      type="button"
      variant="blue"
      size="lg"
      onClick={() => connect().catch((e) => toast.show({ tone: "error", title: "Could not open the wallet picker", body: errorText(e) }))}
    >
      <Wallet aria-hidden />
      {label}
    </Button>
  );

  // Preview: the form while creating, the on-chain metadata once the meme exists.
  const pvSymbol = p?.meta?.symbol ?? (symbol || "TICKER");
  const pvName = p?.meta?.name ?? (name.trim() || "Your meme's name");
  const pvIcon = p?.meta ? p.meta.icon : icon;
  const pvTicker = p?.ticker ?? (ticker || null);
  const pvSeed = p?.seeded ? toNumber(p.usdcReserve, USDC_DECIMALS) : seedRaw ? toNumber(seedRaw, USDC_DECIMALS) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="grid min-w-0 content-start gap-5">
        <Stepper current={current} />

        {txErr && (
          <Notice tone="error" title="The transaction did not go through">
            {txErr}
          </Notice>
        )}

        {resuming ? (
          <div className="card grid gap-4 p-7" aria-busy aria-label="Loading your launch">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-40" />
          </div>
        ) : current === 0 ? (
          <StepCard
            n={1}
            title="Create your meme"
            intro="Pick a name, a ticker and the stock its treasury will hold. The factory deploys it as its own contract with every rule locked."
            next="you seed its pool with USDC, which sets the opening price."
          >
            <form
              className="grid gap-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (formValid && accountId) launch();
              }}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor={ids.name}>Name</Label>
                  <Input id={ids.name} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Nvidia Meme" required />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor={ids.symbol}>Ticker</Label>
                  <Input
                    id={ids.symbol}
                    value={symbol}
                    maxLength={10}
                    onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                    placeholder="GPUDOGE"
                    aria-describedby={`${ids.symbol}-hint`}
                    aria-invalid={symbol.length > 0 && (!symbolOk || taken.data === true)}
                    required
                    className="font-heading font-extrabold tracking-tight uppercase"
                  />
                  <p
                    id={`${ids.symbol}-hint`}
                    className={cn("text-sm font-semibold [overflow-wrap:anywhere]", symbol && (!symbolOk || taken.data) ? "text-red-ink" : symbolOk && taken.data === false ? "text-green-ink" : "text-soft")}
                  >
                    {!symbol
                      ? "2 to 10 letters or digits. It becomes the contract address."
                      : !symbolOk
                        ? "Use 2 to 10 letters or digits."
                        : taken.loading
                          ? `Checking ${candidate}…`
                          : taken.data
                            ? `${candidate} is taken. Pick another ticker.`
                            : `Free: ${candidate}`}
                  </p>
                </div>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-extrabold">Which stock does it believe in?</legend>
                {stocks.error ? (
                  <Notice tone="error" title="Could not load the stock list">
                    {stocks.error}
                  </Notice>
                ) : !stocks.data ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-busy>
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-[4.25rem]" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {stocks.data.map((s) => (
                      <label
                        key={s.ticker}
                        className={cn(
                          "cursor-pointer rounded-2xl border-2 p-3 transition-[transform,box-shadow,border-color,background-color] duration-150 ease-[var(--ease-spring)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                          ticker === s.ticker
                            ? "-translate-y-0.5 border-ink bg-golden shadow-[0_4px_0_var(--ink)]"
                            : "border-line bg-white shadow-[0_3px_0_var(--line)] hover:-translate-y-0.5 hover:border-line-strong",
                        )}
                      >
                        <input
                          type="radio"
                          name="stock"
                          value={s.ticker}
                          checked={ticker === s.ticker}
                          onChange={() => setTicker(s.ticker)}
                          className="sr-only"
                        />
                        <span className="block font-heading text-lg font-black tracking-tight">{s.ticker}</span>
                        <span className={cn("block truncate text-[0.8125rem] font-bold", ticker === s.ticker ? "text-ink" : "text-soft")}>
                          {TESTNET_VENUES[s.ticker]?.name ?? "Listed stock"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {selected && (
                  <p className="mt-2 text-sm font-semibold text-soft">
                    The treasury buys {selected.ticker} on: {stockChains(selected).join(", ") || "none listed"}.
                    {!selected.venues && " This factory runs earlier code that lists no treasury venues."}
                  </p>
                )}
              </fieldset>

              <div className="grid gap-2">
                <Label htmlFor={ids.icon}>Icon (optional)</Label>
                <Input
                  id={ids.icon}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-describedby={`${ids.icon}-hint`}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    setIconErr(null);
                    if (!f) return setIcon(null);
                    try {
                      setIcon(await iconDataUrl(f));
                    } catch (err) {
                      setIcon(null);
                      setIconErr(errorText(err));
                    }
                  }}
                />
                <p id={`${ids.icon}-hint`} className={cn("text-sm font-semibold", iconErr ? "text-red-ink" : "text-soft")}>
                  {iconErr ?? "Resized to 64×64 and stored on-chain in the token metadata (8 KB max)."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t-2 border-line pt-5">
                {accountId ? (
                  <Button type="submit" size="lg" className="whitespace-normal" disabled={!formValid || !!busy}>
                    {busy === "launch" ? <span className="dots">Waiting for your wallet</span> : (formBlocked ?? `Create ${symbol} for ${costLabel}`)}
                  </Button>
                ) : (
                  connectBtn("Connect a wallet to launch")
                )}
                <span className="text-sm font-semibold text-soft">
                  Costs {costLabel}, which pays for the contract&apos;s storage.
                </span>
              </div>
            </form>
          </StepCard>
        ) : current === 1 ? (
          <StepCard
            n={2}
            title="Seed the pool"
            intro={
              <>
                <Link className="link" href={`/meme/${target}`}>
                  {target}
                </Link>{" "}
                is live with every rule locked. Your USDC becomes its first liquidity. Only the creator can seed, once.
              </>
            }
            next="you open the treasury, and trading fees start buying stock."
          >
            <div className="grid max-w-xl gap-5">
              {!isCreator && (
                <Notice title="Only the creator can seed this pool">
                  {p?.creator ? `Connect ${p.creator} to continue.` : "Connect the account that launched this meme."}
                </Notice>
              )}
              <div className="grid gap-2">
                <Label htmlFor={ids.seed}>How much USDC goes in?</Label>
                <div className="relative">
                  <Input
                    id={ids.seed}
                    inputMode="decimal"
                    autoComplete="off"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    aria-describedby={`${ids.seed}-hint`}
                    aria-invalid={seed !== "" && !seedRaw}
                    className="h-14 pr-20 font-heading text-2xl font-extrabold tracking-tight"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-extrabold text-soft">USDC</span>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick seed amounts">
                  {["100", "500", "1000"].map((v) => (
                    <button key={v} type="button" className="chip flex-1" aria-pressed={seed === v} onClick={() => setSeed(v)}>
                      {Number(v).toLocaleString("en-US")}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chip flex-1"
                    disabled={!usdc.data}
                    onClick={() => usdc.data && setSeed(toDecimalString(usdc.data, USDC_DECIMALS))}
                  >
                    Max
                  </button>
                </div>
                <p id={`${ids.seed}-hint`} className="text-sm font-semibold text-soft">
                  All 1,000,000,000 tokens start in the pool, so the opening price is{" "}
                  <span className="font-extrabold text-ink">
                    {seedRaw ? `$${fmtAmount(toNumber(seedRaw, USDC_DECIMALS) / 1e9)}` : "seed ÷ 1,000,000,000"}
                  </span>{" "}
                  per token. Your balance: {usdc.data != null ? `${fmtRaw(usdc.data, USDC_DECIMALS)} USDC` : "–"}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {accountId ? (
                  <Button
                    size="lg"
                    className="whitespace-normal"
                    disabled={!isCreator || !seedRaw || seedRaw <= 0n || seedShort || !!busy}
                    onClick={seedPool}
                  >
                    {busy === "seed" ? (
                      <span className="dots">Waiting for your wallet</span>
                    ) : !isCreator ? (
                      "Only the creator can seed"
                    ) : !seedRaw || seedRaw <= 0n ? (
                      "Enter an amount"
                    ) : seedShort ? (
                      "Not enough USDC"
                    ) : (
                      `Seed the pool with ${fmtRaw(seedRaw, USDC_DECIMALS)} USDC`
                    )}
                  </Button>
                ) : (
                  connectBtn("Connect a wallet to seed")
                )}
                <GetTestUsdcButton onDone={usdc.reload} size="default" />
              </div>
              <p className="text-sm font-semibold text-soft">
                {p?.usdcRegistered
                  ? "One transaction: the USDC transfer that seeds the pool."
                  : "Two transactions: registering the meme on USDC (0.00125 NEAR storage), then the transfer that seeds the pool."}
              </p>
            </div>
          </StepCard>
        ) : current === 2 ? (
          <StepCard
            n={3}
            title="Open the treasury"
            intro={`Seeded with ${fmtRaw(p?.usdcReserve ?? 0n, USDC_DECIMALS)} USDC. Now the meme derives its own addresses on Base, Robinhood Chain and Solana through NEAR Chain Signatures. Anyone can do this, once.`}
            next="your meme is tradable, and every trade starts filling its balance sheet."
          >
            <div className="flex flex-wrap items-center gap-3">
              {accountId ? (
                <Button size="lg" disabled={!!busy} onClick={initTreasury}>
                  {busy === "treasury" ? <span className="dots">Waiting for your wallet</span> : "Open the treasury"}
                </Button>
              ) : (
                connectBtn("Connect a wallet to open it")
              )}
              <span className="text-sm font-semibold text-soft">Free apart from gas. Calls init_treasury().</span>
            </div>
          </StepCard>
        ) : (
          <section className="card pop relative overflow-hidden p-6 sm:p-8" aria-labelledby="launched">
            <Sticker name="rocket" className="absolute -right-6 -bottom-8 w-44 rotate-12 opacity-90 sm:w-56" />
            <div className="relative max-w-[32rem]">
              <span className="pill pill-green">All three steps done</span>
              <h2 id="launched" className="type-h2 mt-3">
                {p?.meta?.symbol ?? "Your meme"} has lifted off.
              </h2>
              <p className="mt-3 font-semibold text-soft">
                {p?.treasury === "unsupported"
                  ? "It is seeded and tradable. This meme runs earlier contract code without a multichain treasury."
                  : "It is seeded, its treasury addresses exist, and every trade now feeds the balance sheet."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/meme/${target}`} className={buttonVariants({ size: "lg" })}>
                  Open {p?.meta?.symbol ?? "the meme"}
                </Link>
                <Link href="/launch" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Launch another
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-5" aria-label="Preview and details">
        <div>
          <p className="mb-2 text-sm font-extrabold">{p?.exists ? "Your meme" : "Live preview"}</p>
          <div className="card flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <MemeIcon icon={pvIcon} symbol={pvSymbol} size={56} />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-heading text-2xl leading-tight font-black tracking-tight", !p?.meta && !symbol && "text-soft")}>{pvSymbol}</p>
                <p className="truncate text-sm font-semibold text-soft">{pvName}</p>
              </div>
            </div>
            <p className="text-[0.9375rem] font-semibold">
              {pvTicker ? (
                <>
                  Holds <span className="font-extrabold">{pvTicker}</span>
                  {TESTNET_VENUES[pvTicker] && <span className="text-soft"> ({TESTNET_VENUES[pvTicker].name})</span>}
                </>
              ) : (
                <span className="text-soft">Pick a stock to hold</span>
              )}
            </p>
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-page px-2.5 py-2">
                <dt className="text-xs font-bold text-soft">Opening price</dt>
                <dd className="type-num mt-1 text-[1.0625rem]">{pvSeed ? `$${fmtAmount(pvSeed / 1e9)}` : "–"}</dd>
              </div>
              <div className="rounded-xl bg-page px-2.5 py-2">
                <dt className="text-xs font-bold text-soft">Supply</dt>
                <dd className="type-num mt-1 text-[1.0625rem]">1B</dd>
              </div>
            </dl>
            <MnavGauge value={null} size="sm" />
            <p className="text-xs font-semibold break-all text-soft">
              {target && p?.exists ? target : (candidate ?? `ticker.${FACTORY}`)}
            </p>
            {p?.exists && target && (
              <Link href={`/meme/${target}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open its page
              </Link>
            )}
          </div>
        </div>

        <div className="card p-5">
          <p className="type-h3">What it costs</p>
          <ul className="mt-2 grid gap-1.5 text-sm font-semibold text-soft">
            <li>
              <span className="font-extrabold text-ink">{costLabel}</span> to create the contract (storage)
            </li>
            <li>
              <span className="font-extrabold text-ink">Your seed USDC</span>, which becomes the pool&apos;s liquidity
            </li>
            <li>Gas for three transactions</li>
          </ul>
        </div>

        <div className="card p-5">
          <p className="type-h3">What gets locked</p>
          <p className="mt-2 text-sm font-semibold text-soft">
            1% pool fee (0.8% treasury, 0.2% creator), issuance above 2.0× mNAV capped at 1% of
            supply a day, buyback below 1.0×, redemption below 0.9×, 20% cash buffer. The meme has
            no owner and no setter.
          </p>
        </div>

        {accountId && (mine.data?.length ?? 0) > 0 && (
          <div className="card p-5">
            <p className="type-h3">Your memes</p>
            <ul className="mt-2 grid gap-1 text-sm">
              {mine.data!.map((m) => (
                <li key={m}>
                  <Link href={`/launch?meme=${m}`} className={cn("link break-all", m === target && "text-ink")} aria-current={m === target ? "page" : undefined}>
                    {m}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-semibold text-soft">Pick one to continue its setup.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
