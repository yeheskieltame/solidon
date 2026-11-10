"use client";

import { Fuel } from "lucide-react";
import { GetTestFundsButton, LOW_GAS, fmtNear, useNearBalance } from "./wallet-controls";
import { NETWORK } from "@/lib/config";
import { useWallet } from "@/lib/wallet";

/**
 * Shown under the header when the connected account cannot pay gas (< 0.05 NEAR), so the
 * next call does not fail with "does not have enough balance". Testnet only: it offers the faucet.
 */
export function GasBanner() {
  const { accountId } = useWallet();
  const near = useNearBalance(accountId);
  if (!accountId || NETWORK !== "testnet" || near.data == null || near.data >= LOW_GAS) return null;
  return (
    <div role="status" className="mx-4 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-orange-wash px-4 py-2.5 sm:mx-6">
      <Fuel className="size-4 shrink-0 text-orange-ink" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-ink">
        Your wallet has no NEAR for gas
        <span className="text-soft"> ({fmtNear(near.data)} NEAR)</span>. Every transaction would fail until it holds some.
      </p>
      <GetTestFundsButton />
    </div>
  );
}
