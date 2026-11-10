"use client";

import { Coins, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useToast } from "./toast";
import { Button } from "@/components/ui/button";
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
}: {
  onDone?: () => void;
  size?: "sm" | "default";
  className?: string;
}) {
  const { accountId, send } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!accountId) return null;
  return (
    <Button
      variant="golden"
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
            title: "1,000 test USDC landed",
            body: "Free testnet money. Spend it boldly.",
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
      {busy ? <span className="dots">Minting</span> : "Get test USDC"}
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
        variant="blue"
        className="max-sm:min-h-11 max-sm:px-3"
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <GetTestUsdcButton onDone={usdc.reload} />
      <div className="flex min-h-[2.375rem] items-center gap-2 rounded-xl border-2 border-line-strong bg-white py-1 pr-1 pl-3 shadow-[0_3px_0_var(--line-strong)]">
        <span className="size-2.5 rounded-full bg-green" aria-hidden />
        <span className="text-sm leading-tight font-extrabold" title={accountId}>
          {shortAddr(accountId, 10, 8)}
        </span>
        <span className="hidden text-sm font-bold text-soft sm:inline" title={`USDC on ${USDC}`}>
          {usdc.data != null ? `${fmtRaw(usdc.data, USDC_DECIMALS)} USDC` : "… USDC"}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-soft hover:bg-red-wash hover:text-red-ink"
          aria-label={`Disconnect ${accountId}`}
          title="Disconnect"
        >
          <LogOut className="size-4" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
