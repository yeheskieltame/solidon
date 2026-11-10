"use client";

import { Coins, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useToast } from "./toast";
import { LogoTile } from "./brand-logo";
import { Button } from "@/components/ui/button";
import { PLATFORM_LOGOS } from "@/lib/brands";
import { FAUCET_USDC, NEARBLOCKS, USDC, USDC_DECIMALS } from "@/lib/config";
import { fmtRaw, toBig, shortAddr } from "@/lib/format";
import { tryView } from "@/lib/near";
import { useAsync } from "@/lib/use-async";
import { errorText, useWallet } from "@/lib/wallet";

/** USDC balance of the connected account, refreshed on demand. */
export function useUsdcBalance(accountId: string | null) {
  return useAsync(
    async () =>
      accountId
        ? toBig(await tryView<string>(USDC, "ft_balance_of", { account_id: accountId }))
        : null,
    [accountId],
  );
}

/** Mints test USDC to the connected account: `mint` on the mock token is open to anyone. */
export function GetTestUsdcButton({
  onDone,
  size = "sm",
  className,
  label = "Get test USDC",
}: {
  onDone?: () => void;
  size?: "sm" | "default";
  className?: string;
  label?: string;
}) {
  const { accountId, send } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!accountId) return null;
  return (
    <Button
      variant="outline"
      size={size}
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const id = toast.show({ tone: "pending", title: "Minting 1,000 test USDC", body: "Confirm it in your wallet." });
        try {
          await send([
            {
              receiverId: USDC,
              methodName: "mint",
              args: { account_id: accountId, amount: FAUCET_USDC.toString() },
              gas: 30,
              deposit: "0",
            },
          ]);
          toast.update(id, {
            tone: "success",
            title: "1,000 test USDC minted",
            body: "Testnet money with no value. Spend it boldly.",
            href: `${NEARBLOCKS}/address/${accountId}`,
            hrefLabel: "Your account on NearBlocks",
            confetti: true,
          });
          onDone?.();
        } catch (e) {
          toast.update(id, { tone: "error", title: "The mint did not go through", body: errorText(e) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Coins aria-hidden />
      {busy ? <span className="dots">Minting</span> : label}
    </Button>
  );
}

export function WalletControls() {
  const { accountId, ready, connect, disconnect } = useWallet();
  const usdc = useUsdcBalance(accountId);
  const toast = useToast();

  if (!accountId) {
    return (
      <Button
        size="sm"
        disabled={!ready}
        onClick={() =>
          connect().catch((e) => toast.show({ tone: "error", title: "Could not open the wallet picker", body: errorText(e) }))
        }
      >
        <Wallet aria-hidden />
        {ready ? (
          <span>
            Connect<span className="max-[420px]:sr-only"> wallet</span>
          </span>
        ) : (
          <span className="dots">Loading</span>
        )}
      </Button>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <GetTestUsdcButton onDone={usdc.reload} className="max-md:hidden" />
      <div className="flex min-h-[2.125rem] items-center gap-2 rounded-full border border-line bg-card py-0.5 pr-0.5 pl-1 shadow-[var(--shadow-xs)]">
        <span className="flex items-center gap-1.5 rounded-full bg-page px-2 py-1 max-sm:hidden" title={`USDC on ${USDC}`}>
          <LogoTile logo={PLATFORM_LOGOS.usdc} size={16} decorative rounded="full" className="!ring-0" />
          <span className="text-[0.8125rem] font-medium tabular-nums">
            {usdc.data != null ? fmtRaw(usdc.data, USDC_DECIMALS) : "…"}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium" title={accountId}>
          <span className="size-2 rounded-full bg-green max-sm:ml-2" aria-hidden />
          {shortAddr(accountId, 10, 6)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-soft transition-colors hover:bg-red-wash hover:text-red-ink"
          aria-label={`Disconnect ${accountId}`}
          title="Disconnect"
        >
          <LogOut className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
