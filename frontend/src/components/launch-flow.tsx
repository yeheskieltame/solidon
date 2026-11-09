"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { cn } from "cn";
import { Notice } from "./notice";
import { Step, type StepStatus } from "./step";
import { GetTestUsdcButton, useUsdcBalance } from "./wallet-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KNOWN_CHAINS, chainMeta } from "@/lib/chains";
import { FACTORY, USDC, USDC_DECIMALS } from "@/lib/config";
import { fmtAmount, fmtRaw, parseUnits, toBig, toNumber } from "@/lib/format";
import { factory, tryView, type MemeInfo, type PoolView, type Stock, type StorageBalance, type TreasuryChainsRaw } from "@/lib/near";
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
};

async function loadProgress(account: string): Promise<Progress> {
  const meta = await tryView<{ symbol: string }>(account, "ft_metadata");
  if (!meta) {
    return { exists: false, creator: null, seeded: false, usdcReserve: 0n, treasury: "missing", usdcRegistered: false };
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
  };
}

export function LaunchFlow() {
  const { accountId, connect, send } = useWallet();
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
  const p = progress.data;
  const step1: StepStatus = p?.exists ? "done" : "active";
  const step2: StepStatus = !p?.exists ? "todo" : p.seeded ? "done" : "active";
  const step3: StepStatus =
    !p?.exists || !p.seeded ? "todo" : p.treasury === "missing" ? "active" : "done";
  const isCreator = !!accountId && p?.creator === accountId;
  const seedRaw = parseUnits(seed, USDC_DECIMALS);
  const selected = stocks.data?.find((s) => s.ticker === ticker) ?? null;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setTxErr(null);
    try {
      await fn();
    } catch (e) {
      setTxErr(errorText(e));
    } finally {
      setBusy(null);
      progress.reload();
      usdc.reload();
    }
  }

  const launch = () =>
    run("launch", async () => {
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
    run("seed", async () => {
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
    run("treasury", async () => {
      if (!target) return;
      await send([{ receiverId: target, methodName: "init_treasury", args: {}, gas: 100, deposit: "0" }]);
    });

  const formValid =
    name.trim().length > 0 && symbolOk && taken.data === false && !!ticker && !!cost.data;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_18rem]">
      <ol aria-label="Launch steps">
        <Step
          n={1}
          title="Create the meme"
          status={step1}
          summary={
            p?.exists ? (
              <>
                <Link className="underline underline-offset-4" href={`/meme/${target}`}>
                  {target}
                </Link>{" "}
                is live with every parameter locked.
              </>
            ) : (
              "Pick a name, a ticker and the stock its treasury will hold. The factory deploys it as its own contract."
            )
          }
        >
          <form
            className="grid max-w-xl gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (formValid) launch();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={ids.name}>Name</Label>
              <Input
                id={ids.name}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nvidia Meme"
                required
              />
            </div>
            <div className="grid gap-2">
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
                className="type-wide uppercase"
              />
              <p id={`${ids.symbol}-hint`} className="text-xs text-graphite">
                {!symbol
                  ? "2 to 10 letters or digits. The ticker becomes the contract address."
                  : !symbolOk
                    ? "Use 2 to 10 letters or digits."
                    : taken.loading
                      ? `Checking ${candidate}…`
                      : taken.data
                        ? `${candidate} is taken. Pick another ticker.`
                        : `Contract address: ${candidate}`}
              </p>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Thesis stock</legend>
              {stocks.error ? (
                <Notice tone="error" title="Could not load the stock list">
                  {stocks.error}
                </Notice>
              ) : !stocks.data ? (
                <p className="text-sm text-graphite">Loading the factory&apos;s stock list…</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {stocks.data.map((s) => (
                    <label
                      key={s.ticker}
                      className={cn(
                        "cursor-pointer border border-ink p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                        ticker === s.ticker && "bg-ink text-paper",
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
                      <span className="type-wide block text-lg">{s.ticker}</span>
                      <span className="block text-xs opacity-75">
                        {TESTNET_VENUES[s.ticker]?.name ?? "Listed stock"}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selected && (
                <p className="text-xs text-graphite">
                  Treasury chains for {selected.ticker}:{" "}
                  {stockChains(selected).join(", ") || "none listed"}.
                  {!selected.venues && " This factory runs earlier code that lists no treasury venues."}
                </p>
              )}
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor={ids.icon}>Icon (optional)</Label>
              <div className="flex items-center gap-3">
                {icon && (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                  <img src={icon} alt="Icon preview" width={40} height={40} className="border border-ink" />
                )}
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
              </div>
              <p id={`${ids.icon}-hint`} className="text-xs text-graphite">
                {iconErr ?? "Resized to 64×64 and stored on-chain in the token metadata (8 KB max)."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-5">
              {accountId ? (
                <Button type="submit" size="lg" className="h-11 px-5 text-base" disabled={!formValid || !!busy}>
                  {busy === "launch" ? "Waiting for the wallet…" : `Launch ${symbol || "meme"}`}
                </Button>
              ) : (
                <Button type="button" size="lg" className="h-11 px-5 text-base" onClick={() => connect().catch((e) => setTxErr(errorText(e)))}>
                  Connect wallet to launch
                </Button>
              )}
              <span className="text-sm text-graphite">
                Attaches {costNear !== null ? `${fmtAmount(costNear, 3)} NEAR` : "the launch cost"} for
                the contract&apos;s storage.
              </span>
            </div>
          </form>
        </Step>

        <Step
          n={2}
          title="Seed the pool"
          status={step2}
          summary={
            p?.seeded
              ? `Seeded with ${fmtRaw(p.usdcReserve, USDC_DECIMALS)} USDC.`
              : "Your USDC becomes the pool's first liquidity. Only the creator can seed, once."
          }
        >
          <div className="grid max-w-xl gap-5">
            {!isCreator && (
              <Notice title="Only the creator can seed this pool">
                {p?.creator
                  ? `Connect ${p.creator} to continue.`
                  : "Connect the account that launched this meme."}
              </Notice>
            )}
            <div className="grid gap-2">
              <Label htmlFor={ids.seed}>Seed amount (USDC)</Label>
              <Input
                id={ids.seed}
                inputMode="decimal"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                aria-describedby={`${ids.seed}-hint`}
                aria-invalid={seed !== "" && !seedRaw}
              />
              <p id={`${ids.seed}-hint`} className="text-xs text-graphite">
                All 1,000,000,000 tokens start in the pool, so the opening price is{" "}
                {seedRaw ? `$${fmtAmount(toNumber(seedRaw, USDC_DECIMALS) / 1e9)}` : "seed ÷ 1,000,000,000"} per
                token. Your balance: {usdc.data != null ? `${fmtRaw(usdc.data, USDC_DECIMALS)} USDC` : "–"}.
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <Button
                size="lg"
                className="h-11 px-5 text-base"
                disabled={!isCreator || !seedRaw || seedRaw <= 0n || (usdc.data ?? 0n) < (seedRaw ?? 0n) || !!busy}
                onClick={seedPool}
              >
                {busy === "seed" ? "Waiting for the wallet…" : "Seed pool"}
              </Button>
              <GetTestUsdcButton onDone={usdc.reload} />
            </div>
            <p className="text-xs text-graphite">
              {p?.usdcRegistered
                ? "Sends one transaction: ft_transfer_call on USDC with msg {\"action\":\"seed\"}."
                : "Sends two transactions: registers the meme on USDC (storage_deposit, 0.00125 NEAR), then ft_transfer_call with msg {\"action\":\"seed\"}."}
            </p>
          </div>
        </Step>

        <Step
          n={3}
          title="Open the treasury"
          status={step3}
          summary={
            p?.treasury === "ready"
              ? "Treasury addresses derived through Chain Signatures."
              : p?.treasury === "unsupported" && p.seeded
                ? "This meme runs earlier contract code without a multichain treasury."
                : "Derives the meme's own treasury address through Chain Signatures. Anyone can call it, once."
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-11 px-5 text-base" disabled={!accountId || !!busy} onClick={initTreasury}>
              {busy === "treasury" ? "Waiting for the wallet…" : "Open the treasury"}
            </Button>
            <span className="text-sm text-graphite">Calls init_treasury() with 100 TGas.</span>
          </div>
        </Step>
      </ol>

      <aside className="flex flex-col gap-6 lg:pt-8">
        {txErr && (
          <Notice tone="error" title="The transaction did not go through">
            {txErr}
          </Notice>
        )}
        {p?.exists && (
          <Link href={`/meme/${target}`} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
            Open {target}
          </Link>
        )}
        {accountId && (mine.data?.length ?? 0) > 0 && (
          <div>
            <p className="text-sm font-semibold">Your memes</p>
            <ul className="mt-2 grid gap-1 text-sm">
              {mine.data!.map((m) => (
                <li key={m}>
                  <Link
                    href={`/launch?meme=${m}`}
                    className={cn("underline-offset-4 hover:underline", m === target && "font-semibold")}
                  >
                    {m}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-graphite">Pick one to continue its setup.</p>
          </div>
        )}
        <div className="text-sm text-graphite">
          <p className="font-semibold text-ink">What gets locked</p>
          <p className="mt-1">
            1% pool fee (0.8% treasury, 0.2% creator), issuance above 2.0× mNAV capped at 1% of
            supply a day, buyback below 1.0×, redemption below 0.9×, 20% cash buffer. The meme has
            no owner and no setter.
          </p>
        </div>
      </aside>
    </div>
  );
}
