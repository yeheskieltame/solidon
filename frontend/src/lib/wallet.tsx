"use client";

// One wallet abstraction for two kinds of signer:
// - "wallet": @hot-labs/near-connect (Meteor, Intear, HOT, MyNearWallet and others from its
//   manifest, each in a sandboxed iframe), which asks the user to approve every transaction;
// - "demo" (testnet only): a key generated in this browser (src/lib/demo-wallet.ts) that signs
//   locally and sends through RPC, with no popups.
// Every action in the app goes through `send`, so both kinds work everywhere.

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
import {
  createDemoKey,
  DEMO_ENABLED,
  forgetDemo as clearDemo,
  loadDemo,
  saveDemo,
  sendWithDemo,
  type DemoWallet,
} from "./demo-wallet";

export type FnCall = {
  receiverId: string;
  methodName: string;
  args: object;
  /** TGas. */
  gas: number;
  /** yoctoNEAR as a decimal string. */
  deposit: string;
};

export type WalletKind = "wallet" | "demo";

/** A wallet from the near-connect manifest, as the connect modal lists it. */
export type WalletOption = { id: string; name: string; icon: string; help: string };

type WalletState = {
  accountId: string | null;
  kind: WalletKind | null;
  ready: boolean;
  /** Opens the connect modal (demo wallet + real wallets). */
  connect: () => Promise<void>;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  /** Real wallets available on this network. */
  wallets: WalletOption[];
  /** Connects a real wallet; without an id, near-connect shows its own picker. */
  connectWallet: (walletId?: string) => Promise<void>;
  /** Resumes the stored demo wallet or creates one. `fresh` is true for a new key. */
  startDemo: () => Promise<{ accountId: string; fresh: boolean }>;
  /** True when this browser holds a demo key (active or not). */
  hasDemo: boolean;
  /** The demo secret key, for "Export key". */
  demoSecret: () => string | null;
  /** Deletes the demo key from this browser and disconnects it. */
  forgetDemo: () => void;
  disconnect: () => Promise<void>;
  /** Signs and sends the calls, one transaction per call, in order. Resolves to the tx hashes. */
  send: (calls: FnCall[]) => Promise<string[]>;
  /** One line for pending toasts: where the user approves. */
  signHint: string;
  /** Bumped after every send and faucet drip; balance hooks reload on it. */
  balanceTick: number;
  refreshBalances: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

const TGAS = 1_000_000_000_000n;

/** One line per wallet in the connect modal: what it is and where it opens. */
const HELP: Record<string, string> = {
  "meteor-wallet": "Browser extension, or a web wallet that opens a new tab",
  "intear-wallet": "Web wallet, opens a new tab",
  mynearwallet: "Web wallet, opens a new tab",
  "hot-wallet": "Telegram mini app, mobile app or browser extension",
  "nightly-wallet": "Browser extension",
  "okx-wallet": "Browser extension or mobile app",
  "hana-wallet": "Browser extension or mobile app",
  ledger: "Hardware wallet over USB",
  "ethereum-wallets": "Sign NEAR transactions with MetaMask or another EVM wallet",
  "near-cli": "Sign in your terminal with near-cli-rs (for developers)",
  "near-mobile": "Mobile app, scan a QR code",
};

type Manifest = { id: string; name: string; icon: string; type: string; platform?: unknown };

function helpFor(m: Manifest): string {
  if (HELP[m.id]) return HELP[m.id];
  if (m.type === "injected") return "Browser extension";
  const p = (m.platform ?? {}) as Record<string, unknown>;
  if (p.chrome || p.firefox) return "Browser extension";
  if (p.web) return "Web wallet, opens a new tab";
  if (p.ios || p.android) return "Mobile app";
  return "Wallet";
}

/** Transaction hash from a near-connect outcome (shapes differ slightly between wallets). */
function outcomeHash(o: unknown): string {
  const x = o as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | null;
  return x?.transaction?.hash ?? x?.transaction_outcome?.id ?? "";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const demoRef = useRef<DemoWallet | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [kind, setKind] = useState<WalletKind | null>(null);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [hasDemo, setHasDemo] = useState(false);
  const [balanceTick, setBalanceTick] = useState(0);
  const refreshBalances = useCallback(() => setBalanceTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const demo = loadDemo();
    demoRef.current = demo;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the demo session from localStorage after hydration
    setHasDemo(!!demo);
    if (demo?.active) {
      setAccountId(demo.accountId);
      setKind("demo");
    }
    (async () => {
      try {
        const { NearConnector } = await import("@hot-labs/near-connect");
        const connector = new NearConnector({
          network: NETWORK,
          features: { signAndSendTransactions: true, [NETWORK]: true },
          footerBranding: null,
        });
        connectorRef.current = connector;
        connector.on("wallet:signIn", (t) => {
          // A real wallet replaces the demo session; the demo key stays for later.
          const d = demoRef.current;
          if (d?.active) {
            demoRef.current = { ...d, active: false };
            saveDemo(demoRef.current);
          }
          setAccountId(t.accounts[0]?.accountId ?? null);
          setKind("wallet");
        });
        connector.on("wallet:signOut", () => {
          if (!demoRef.current?.active) {
            setAccountId(null);
            setKind(null);
          }
        });
        connector.whenManifestLoaded.then(() => {
          if (cancelled) return;
          setWallets(
            connector.availableWallets.map((w) => {
              const m = w.manifest as Manifest;
              return { id: m.id, name: m.name, icon: m.icon, help: helpFor(m) };
            }),
          );
        });
        if (!demo?.active) {
          try {
            const { accounts } = await connector.getConnectedWallet();
            if (!cancelled && accounts[0]) {
              setAccountId(accounts[0].accountId);
              setKind("wallet");
            }
          } catch {
            // Not signed in.
          }
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
    setPickerOpen(true);
  }, []);

  const connectWallet = useCallback(async (walletId?: string) => {
    const c = connectorRef.current;
    if (!c) throw new Error("The wallet connector is still loading");
    setPickerOpen(false);
    await c.connect(walletId ? { walletId } : undefined);
  }, []);

  const startDemo = useCallback(async () => {
    if (!DEMO_ENABLED) throw new Error("The demo wallet is only available on testnet");
    const existing = demoRef.current;
    const fresh = !existing;
    const demo = existing ? { ...existing, active: true } : await createDemoKey();
    saveDemo(demo);
    demoRef.current = demo;
    setHasDemo(true);
    // One account at a time: sign a connected real wallet out.
    if (kind === "wallet") await connectorRef.current?.disconnect().catch(() => undefined);
    setAccountId(demo.accountId);
    setKind("demo");
    setPickerOpen(false);
    return { accountId: demo.accountId, fresh };
  }, [kind]);

  const demoSecret = useCallback(() => demoRef.current?.secretKey ?? null, []);

  const forgetDemo = useCallback(() => {
    const wasActive = !!demoRef.current?.active;
    clearDemo();
    demoRef.current = null;
    setHasDemo(false);
    if (wasActive) {
      setAccountId(null);
      setKind(null);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (kind === "demo" && demoRef.current) {
      demoRef.current = { ...demoRef.current, active: false };
      saveDemo(demoRef.current);
    } else {
      await connectorRef.current?.disconnect();
    }
    setAccountId(null);
    setKind(null);
  }, [kind]);

  const send = useCallback(
    async (calls: FnCall[]): Promise<string[]> => {
      if (!accountId) throw new Error("Connect a wallet first");
      if (kind === "demo") {
        const demo = demoRef.current;
        if (!demo) throw new Error("The demo wallet key is gone from this browser");
        try {
          return await sendWithDemo(demo, calls);
        } finally {
          refreshBalances();
        }
      }
      const c = connectorRef.current;
      if (!c) throw new Error("Connect a wallet first");
      const wallet = await c.wallet();
      const outcomes = await wallet.signAndSendTransactions({
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
      refreshBalances();
      return (outcomes ?? []).map(outcomeHash);
    },
    [accountId, kind, refreshBalances],
  );

  const signHint = kind === "demo" ? "Signing in this browser with the demo wallet." : "Confirm it in your wallet.";

  const value = useMemo(
    () => ({
      accountId,
      kind,
      ready,
      connect,
      pickerOpen,
      setPickerOpen,
      wallets,
      connectWallet,
      startDemo,
      hasDemo,
      demoSecret,
      forgetDemo,
      disconnect,
      send,
      signHint,
      balanceTick,
      refreshBalances,
    }),
    [accountId, kind, ready, connect, pickerOpen, wallets, connectWallet, startDemo, hasDemo, demoSecret, forgetDemo, disconnect, send, signHint, balanceTick, refreshBalances],
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
