"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowUpRight, ChevronDown, Coins, FlaskConical, KeyRound, LogOut, Trash2, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { useToast } from "./toast";
import { LogoTile } from "./brand-logo";
import { CopyButton } from "./copy-button";
import { Button } from "@/components/ui/button";
import { PLATFORM_LOGOS } from "@/lib/brands";
import { NEARBLOCKS, NETWORK, USDC, USDC_DECIMALS } from "@/lib/config";
import { DEMO_ENABLED } from "@/lib/demo-wallet";
import { FAUCET_LINE, requestFaucet } from "@/lib/faucet";
import { fmtRaw, toBig, shortAddr } from "@/lib/format";
import { nearBalance, tryView } from "@/lib/near";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet } from "@/lib/wallet";

const YOCTO = 10n ** 24n;
/** Below this a real wallet cannot pay gas for a call: show the "no NEAR" banner. */
export const LOW_GAS = YOCTO / 20n; // 0.05 NEAR

/** USDC balance of the connected account, refreshed on demand and after every send. */
export function useUsdcBalance(accountId: string | null) {
  const { balanceTick } = useWallet();
  return useAsync(
    async () =>
      accountId
        ? toBig(await tryView<string>(USDC, "ft_balance_of", { account_id: accountId }))
        : null,
    [accountId, balanceTick],
  );
}

/** Liquid NEAR of the connected account (0n for an account that does not exist yet). */
export function useNearBalance(accountId: string | null) {
  const { balanceTick } = useWallet();
  return useAsync(async () => (accountId ? nearBalance(accountId) : null), [accountId, balanceTick]);
}

export const fmtNear = (y: bigint) => fmtRaw(y, 24, y < YOCTO ? 3 : 2);

const txUrl = (hash: string) => `${NEARBLOCKS}/txns/${hash}`;

/** Calls the gasless faucet for `accountId` and reports progress and the result as toasts. */
export function useFaucet() {
  const toast = useToast();
  const { refreshBalances } = useWallet();
  const [busy, setBusy] = useState(false);
  async function run(accountId: string, opts: { memeId?: string; title?: string } = {}): Promise<boolean> {
    setBusy(true);
    const id = toast.show({
      tone: "pending",
      title: opts.title ?? "Getting test funds",
      body: "The Solidon faucet pays: no signature, no gas.",
    });
    try {
      const r = await requestFaucet(accountId, opts.memeId);
      const links: ReactNode[] = [];
      if (r.near) links.push(<TxLink key="near" hash={r.near.hash} label={r.created ? "Account created + 0.5 NEAR" : "0.5 NEAR for gas"} />);
      links.push(<TxLink key="usdc" hash={r.usdc.hash} label="1,000 test USDC" />);
      if (r.meme) links.push(<TxLink key="meme" hash={r.meme.hash} label="Registered on the meme" />);
      toast.update(id, {
        tone: "success",
        title: r.near ? "Test NEAR and 1,000 USDC sent" : "1,000 test USDC minted",
        body: (
          <span className="grid gap-0.5">
            {links}
            {r.notes.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        ),
        href: `${NEARBLOCKS}/address/${accountId}`,
        hrefLabel: "Your account on NearBlocks",
        confetti: true,
      });
      return true;
    } catch (e) {
      toast.update(id, { tone: "error", title: "The faucet did not send", body: errorText(e) });
      return false;
    } finally {
      refreshBalances();
      setBusy(false);
    }
  }
  return { busy, run };
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a className="link" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {label}
      <span className="sr-only"> (transaction on NearBlocks, opens in a new tab)</span>
    </a>
  );
}

/** "Free testnet NEAR for gas + 1,000 test USDC". */
export function FaucetLine({ className }: { className?: string }) {
  return <p className={cn("text-[0.8125rem] text-soft", className)}>{FAUCET_LINE}</p>;
}

/**
 * Gasless faucet button: the server sends NEAR for gas (when low), registers USDC storage
 * and mints 1,000 test USDC. `memeId` also pre-registers the account on that meme.
 */
export function GetTestFundsButton({
  onDone,
  memeId,
  size = "sm",
  className,
  label = "Get test funds",
}: {
  onDone?: () => void;
  memeId?: string;
  size?: "sm" | "default";
  className?: string;
  label?: string;
}) {
  const { accountId } = useWallet();
  const faucet = useFaucet();
  if (!accountId || NETWORK !== "testnet") return null;
  return (
    <Button
      variant="outline"
      size={size}
      className={className}
      disabled={faucet.busy}
      title={FAUCET_LINE}
      onClick={async () => {
        await faucet.run(accountId, { memeId });
        onDone?.();
      }}
    >
      <Coins aria-hidden />
      {faucet.busy ? <span className="dots">Sending</span> : label}
    </Button>
  );
}

/** Header chip menu for the demo wallet: copy id, export key, disconnect, forget. */
function DemoMenu({ accountId }: { accountId: string }) {
  const { demoSecret, forgetDemo, disconnect } = useWallet();
  const [reveal, setReveal] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const item =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-page-deep hover:text-ink";
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) {
          setReveal(false);
          setConfirmForget(false);
        }
      }}
    >
      <Popover.Trigger
        className="flex cursor-pointer items-center gap-1.5 rounded-[7px] px-1.5 py-1 text-[0.8125rem] hover:bg-page-deep"
        aria-label={`Demo wallet ${accountId}: menu`}
      >
        <span className="rounded-[5px] bg-lilac-wash px-1.5 py-0.5 text-[0.6875rem] font-medium text-lilac-ink">Demo</span>
        <span className="max-sm:hidden" title={accountId}>{shortAddr(accountId, 6, 4)}</span>
        <ChevronDown className="size-3.5 text-soft" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line-strong bg-panel p-2 shadow-[var(--shadow-lg)] outline-none">
            <div className="px-2.5 pt-1.5 pb-2">
              <Popover.Title className="text-sm font-medium">Demo wallet</Popover.Title>
              <Popover.Description className="mt-0.5 text-[0.8125rem] text-soft">
                Testnet only, the key lives in this browser.
              </Popover.Description>
              <p className="mt-2 flex items-center gap-1 rounded-[8px] bg-page-deep px-2 py-1.5 font-mono text-[0.75rem] break-all text-ink-2">
                <span className="min-w-0 flex-1">{accountId}</span>
                <CopyButton value={accountId} label="account id" />
              </p>
            </div>
            <a className={item} href={`${NEARBLOCKS}/address/${accountId}`} target="_blank" rel="noreferrer">
              <ArrowUpRight className="size-4" aria-hidden />
              View on NearBlocks
            </a>
            {!reveal ? (
              <button type="button" className={item} onClick={() => setReveal(true)}>
                <KeyRound className="size-4" aria-hidden />
                Export key
              </button>
            ) : (
              <div className="mx-1 my-1 rounded-xl bg-orange-wash p-2.5">
                <p className="text-[0.8125rem] text-orange-ink">
                  Anyone with this key controls the demo account. Never paste it anywhere you do not trust, and never send real
                  funds to it.
                </p>
                <p className="mt-2 flex items-center gap-1 rounded-[8px] bg-panel px-2 py-1.5 font-mono text-[0.6875rem] break-all">
                  <span className="min-w-0 flex-1">{demoSecret()}</span>
                  <CopyButton value={demoSecret() ?? ""} label="secret key" />
                </p>
              </div>
            )}
            <button type="button" className={item} onClick={() => disconnect()}>
              <LogOut className="size-4" aria-hidden />
              Disconnect (keep the key)
            </button>
            {!confirmForget ? (
              <button type="button" className={cn(item, "hover:bg-red-wash hover:text-red-ink")} onClick={() => setConfirmForget(true)}>
                <Trash2 className="size-4" aria-hidden />
                Forget demo wallet
              </button>
            ) : (
              <div className="mx-1 my-1 rounded-xl bg-red-wash p-2.5">
                <p className="text-[0.8125rem] text-red-ink">
                  This deletes the key from this browser. Without an exported copy, the account and its test tokens are gone for
                  good.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => forgetDemo()}>
                    Forget it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmForget(false)}>
                    Keep
                  </Button>
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function WalletControls() {
  const { accountId, kind, ready, connect, disconnect } = useWallet();
  const usdc = useUsdcBalance(accountId);

  if (!accountId) {
    return (
      <div className="flex items-center gap-2">
        {DEMO_ENABLED && <TryDemoButton className="max-md:hidden" />}
        <Button size="sm" disabled={!ready} onClick={() => connect()}>
          <Wallet aria-hidden />
          {ready ? (
            <span>
              Connect<span className="max-[420px]:sr-only"> wallet</span>
            </span>
          ) : (
            <span className="dots">Loading</span>
          )}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <GetTestFundsButton className="max-md:hidden" />
      <div className="flex min-h-[2.5rem] items-center gap-2 rounded-[10px] bg-panel py-1 pr-1 pl-1.5">
        <span className="flex items-center gap-1.5 rounded-[7px] bg-page-deep px-2 py-1 max-sm:hidden" title={`USDC on ${USDC}`}>
          <LogoTile logo={PLATFORM_LOGOS.usdc} size={16} decorative rounded="full" className="!ring-0" />
          <span className="text-[0.8125rem] tabular-nums">
            {usdc.data != null ? fmtRaw(usdc.data, USDC_DECIMALS) : "…"}
          </span>
        </span>
        {kind === "demo" ? (
          <DemoMenu accountId={accountId} />
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-[0.8125rem]" title={accountId}>
              <span className="size-2 rounded-full bg-green max-sm:ml-2" aria-hidden />
              {shortAddr(accountId, 10, 6)}
            </span>
            <button
              type="button"
              onClick={() => disconnect()}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[7px] text-soft transition-colors hover:bg-red-wash hover:text-red-ink"
              aria-label={`Disconnect ${accountId}`}
              title="Disconnect"
            >
              <LogOut className="size-3.5" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Starts (or resumes) the demo wallet and funds it through the faucet when it is new or
 * out of NEAR. Shared by the header button and the connect modal.
 */
export function useStartDemo() {
  const { startDemo } = useWallet();
  const faucet = useFaucet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const { accountId, fresh } = await startDemo();
      const near = fresh ? 0n : await nearBalance(accountId);
      if (near !== null && near < LOW_GAS * 2n) {
        await faucet.run(accountId, { title: fresh ? "Creating and funding your demo wallet" : "Topping up your demo wallet" });
      }
    } catch (e) {
      toast.show({ tone: "error", title: "The demo wallet did not start", body: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  return { busy: busy || faucet.busy, run };
}

export function TryDemoButton({ className, size = "sm" }: { className?: string; size?: "sm" | "default" }) {
  const { hasDemo } = useWallet();
  const demo = useStartDemo();
  return (
    <Button variant="outline" size={size} className={className} disabled={demo.busy} onClick={() => demo.run()}>
      <FlaskConical aria-hidden />
      {demo.busy ? <span className="dots">Starting</span> : hasDemo ? "Resume demo wallet" : "Try a demo wallet"}
    </Button>
  );
}
