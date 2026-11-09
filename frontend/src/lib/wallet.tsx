"use client";

// Wallet connection through @hot-labs/near-connect (HOT, Meteor, MyNearWallet, Intear
// and others, loaded from the connector's manifest in a sandboxed iframe).

import type { NearConnector } from "@hot-labs/near-connect";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NETWORK } from "./config";

export type FnCall = {
  receiverId: string;
  methodName: string;
  args: object;
  /** TGas. */
  gas: number;
  /** yoctoNEAR as a decimal string. */
  deposit: string;
};

type WalletState = {
  accountId: string | null;
  ready: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Signs and sends the calls, one transaction per call, in order. */
  send: (calls: FnCall[]) => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

const TGAS = 1_000_000_000_000n;

export function WalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { NearConnector } = await import("@hot-labs/near-connect");
        const connector = new NearConnector({
          network: NETWORK,
          features: { signAndSendTransactions: true, [NETWORK]: true },
          footerBranding: null,
        });
        connectorRef.current = connector;
        connector.on("wallet:signIn", (t) => setAccountId(t.accounts[0]?.accountId ?? null));
        connector.on("wallet:signOut", () => setAccountId(null));
        try {
          const { accounts } = await connector.getConnectedWallet();
          if (!cancelled) setAccountId(accounts[0]?.accountId ?? null);
        } catch {
          // Not signed in.
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const c = connectorRef.current;
    if (!c) throw new Error("The wallet connector is still loading");
    await c.connect();
  }, []);

  const disconnect = useCallback(async () => {
    await connectorRef.current?.disconnect();
    setAccountId(null);
  }, []);

  const send = useCallback(
    async (calls: FnCall[]) => {
      const c = connectorRef.current;
      if (!c || !accountId) throw new Error("Connect a wallet first");
      const wallet = await c.wallet();
      await wallet.signAndSendTransactions({
        network: NETWORK,
        signerId: accountId,
        transactions: calls.map((call) => ({
          receiverId: call.receiverId,
          actions: [
            {
              type: "FunctionCall" as const,
              params: {
                methodName: call.methodName,
                args: call.args,
                gas: (BigInt(call.gas) * TGAS).toString(),
                deposit: call.deposit,
              },
            },
          ],
        })),
      });
    },
    [accountId],
  );

  const value = useMemo(
    () => ({ accountId, ready, connect, disconnect, send }),
    [accountId, ready, connect, disconnect, send],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}

/** Human message for a wallet or contract error. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e).slice(0, 300);
  } catch {
    return "Unknown error";
  }
}
