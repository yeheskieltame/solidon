"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FAUCET_USDC, USDC, USDC_DECIMALS } from "@/lib/config";
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
  variant = "outline",
}: {
  onDone?: () => void;
  variant?: "outline" | "default";
}) {
  const { accountId, send } = useWallet();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!accountId) return null;
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant={variant}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
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
            setMsg("Minted 1,000 test USDC.");
            onDone?.();
          } catch (e) {
            setMsg(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Minting…" : "Get test USDC"}
      </Button>
      {msg && (
        <span className="text-xs text-graphite" role="status">
          {msg}
        </span>
      )}
    </span>
  );
}

export function WalletControls() {
  const { accountId, ready, connect, disconnect } = useWallet();
  const usdc = useUsdcBalance(accountId);
  const [err, setErr] = useState<string | null>(null);

  if (!accountId) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Button
          disabled={!ready}
          onClick={() => connect().catch((e) => setErr(errorText(e)))}
        >
          {ready ? "Connect wallet" : "Loading wallets…"}
        </Button>
        {err && <span className="text-xs text-graphite">{err}</span>}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-graphite" title={`USDC on ${USDC}`}>
        {usdc.data != null ? `${fmtRaw(usdc.data, USDC_DECIMALS)} USDC` : "… USDC"}
      </span>
      <GetTestUsdcButton onDone={usdc.reload} />
      <Button variant="ghost" onClick={() => disconnect()} title="Disconnect">
        {shortAddr(accountId, 14, 8)}
        <span className="sr-only">, disconnect</span>
      </Button>
    </div>
  );
}
