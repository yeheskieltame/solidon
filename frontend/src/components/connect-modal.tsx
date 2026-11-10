"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, Coins, FlaskConical, X } from "lucide-react";
import { useState } from "react";
import { FaucetLine, useFaucet, useStartDemo } from "./wallet-controls";
import { Button } from "@/components/ui/button";
import { NETWORK } from "@/lib/config";
import { DEMO_ENABLED } from "@/lib/demo-wallet";
import { errorText, useWallet } from "@/lib/wallet";
import { useToast } from "./toast";

/** Faucet for any testnet account id, without connecting: for wallets that hold 0 NEAR. */
function FaucetForAccount() {
  const faucet = useFaucet();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  if (!open) {
    return (
      <button type="button" className="link text-sm" onClick={() => setOpen(true)}>
        Your wallet has 0 NEAR? Get test funds for any testnet account
      </button>
    );
  }
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (id.trim()) faucet.run(id.trim());
      }}
    >
      <label htmlFor="faucet-account" className="text-sm text-ink-2">
        Testnet account to fund
      </label>
      <div className="flex gap-2">
        <input
          id="faucet-account"
          className="h-9 min-w-0 flex-1 rounded-[10px] border border-line-strong bg-page px-3 text-sm outline-none focus:border-blue"
          placeholder="you.testnet"
          autoComplete="off"
          spellCheck={false}
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={faucet.busy || !id.trim()}>
          <Coins aria-hidden />
          {faucet.busy ? <span className="dots">Sending</span> : "Get test funds"}
        </Button>
      </div>
      <FaucetLine />
    </form>
  );
}

/**
 * The connect modal: a one-click demo wallet (testnet) first, then the real wallets from
 * near-connect, each with one line on what it is and where it opens.
 */
export function ConnectModal() {
  const { pickerOpen, setPickerOpen, wallets, connectWallet, hasDemo } = useWallet();
  const demo = useStartDemo();
  const toast = useToast();

  const pick = (id?: string) =>
    connectWallet(id).catch((e) => {
      if (errorText(e) !== "User rejected") toast.show({ tone: "error", title: "Could not connect the wallet", body: errorText(e) });
    });

  return (
    <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border border-line-strong bg-card p-5 shadow-[var(--shadow-lg)] outline-none transition-[opacity,transform] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="type-h2">Connect</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-soft">
                {NETWORK === "testnet" ? "NEAR testnet. Every token here is free and has no value." : "NEAR mainnet."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-btn -mt-1 -mr-1 !size-8" aria-label="Close">
              <X aria-hidden />
            </Dialog.Close>
          </div>

          {DEMO_ENABLED && (
            <div className="mt-5 rounded-[18px] bg-panel p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lilac-wash text-lilac-ink" aria-hidden>
                  <FlaskConical className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{hasDemo ? "Resume your demo wallet" : "Try a demo wallet"}</p>
                  <p className="mt-0.5 text-sm text-soft">
                    One click, no extension, no popups. A new testnet account with NEAR for gas and 1,000 test USDC.
                  </p>
                </div>
              </div>
              <Button className="mt-3 w-full" disabled={demo.busy} onClick={() => demo.run()}>
                {demo.busy ? <span className="dots">Starting</span> : hasDemo ? "Resume demo wallet" : "Start with a demo wallet"}
              </Button>
              <p className="mt-2 text-center text-[0.75rem] text-faint">Demo wallet — testnet only, the key lives in this browser.</p>
            </div>
          )}

          <p className="mt-5 mb-2 text-sm text-soft">{DEMO_ENABLED ? "Or use your own wallet" : "Choose a wallet"}</p>
          <ul className="grid gap-1">
            {wallets.length === 0 && <li className="px-2 py-3 text-sm text-soft"><span className="dots">Loading wallets</span></li>}
            {wallets.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => pick(w.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-panel"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote wallet icons from the manifest */}
                  <img src={w.icon} alt="" width={32} height={32} className="size-8 shrink-0 rounded-[9px] bg-page-deep object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem]">{w.name}</span>
                    <span className="block text-[0.8125rem] text-soft">{w.help}</span>
                  </span>
                  <ChevronRight className="size-4 text-faint" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="link mt-1 px-2 text-sm" onClick={() => pick()}>
            More wallets
          </button>

          {NETWORK === "testnet" && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-[0.8125rem] text-soft">
                A new testnet wallet holds 0 NEAR, so it cannot pay gas yet. After you connect, press Get test funds.
              </p>
              <FaucetForAccount />
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
