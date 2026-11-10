"use client";

import { Check, LoaderCircle, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "cn";

type Tone = "pending" | "success" | "error";

export type ToastInput = {
  tone: Tone;
  title: string;
  body?: ReactNode;
  /** Explorer link shown under the message. */
  href?: string;
  hrefLabel?: string;
  /** A small confetti burst (success only). */
  confetti?: boolean;
};

type Toast = ToastInput & { id: number; pieces: Piece[] };
type Piece = { x: number; y: number; r: number; d: number; c: string };

type ToastApi = {
  /** Shows a toast and returns its id. Pending toasts stay until replaced or dismissed. */
  show: (t: ToastInput) => number;
  /** Replaces a toast in place (pending -> success / error). */
  update: (id: number, t: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** The success moment: a small burst of gold coins (and a few brand-blue ones). */
const COLORS = ["#F5B700", "#FFD23F", "#F2A900", "#3355FF", "#12A46B"];

function burst(): Piece[] {
  return Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.5;
    const reach = 50 + Math.random() * 70;
    return {
      x: Math.cos(angle) * reach,
      y: Math.sin(angle) * reach - 30,
      r: (Math.random() - 0.5) * 720,
      d: Math.random() * 0.12,
      c: COLORS[i % COLORS.length],
    };
  });
}

const LIFETIME: Record<Tone, number> = { pending: 0, success: 8000, error: 12000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const arm = useCallback(
    (id: number, tone: Tone) => {
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      if (LIFETIME[tone] > 0) timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME[tone]));
    },
    [dismiss],
  );

  const show = useCallback(
    (t: ToastInput) => {
      const id = next.current++;
      const pieces = t.confetti && t.tone === "success" ? burst() : [];
      setToasts((list) => [...list.slice(-3), { ...t, id, pieces }]);
      arm(id, t.tone);
      return id;
    },
    [arm],
  );

  const update = useCallback(
    (id: number, t: ToastInput) => {
      const pieces = t.confetti && t.tone === "success" ? burst() : [];
      setToasts((list) =>
        list.some((x) => x.id === id)
          ? list.map((x) => (x.id === id ? { ...t, id, pieces } : x))
          : [...list.slice(-3), { ...t, id, pieces }],
      );
      arm(id, t.tone);
    },
    [arm],
  );

  const api = useMemo(() => ({ show, update, dismiss }), [show, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex flex-col items-center gap-3 p-4 sm:inset-x-auto sm:right-0 sm:items-end sm:p-6 md:bottom-0"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={`${t.id}-${t.tone}`}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "toast pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line-strong bg-panel p-3.5 shadow-[var(--shadow-lg)]",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                t.tone === "success" && "bg-green-wash text-green-ink",
                t.tone === "error" && "bg-red-wash text-red-ink",
                t.tone === "pending" && "bg-page-deep text-ink",
              )}
              aria-hidden
            >
              {t.tone === "success" ? (
                <Check className="size-4" strokeWidth={2.5} />
              ) : t.tone === "error" ? (
                <TriangleAlert className="size-4" strokeWidth={2.25} />
              ) : (
                <LoaderCircle className="size-4 animate-spin" strokeWidth={2.25} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="pt-1 leading-tight font-medium">{t.title}</p>
              {t.body && <div className="mt-1 text-sm break-words text-soft">{t.body}</div>}
              {t.href && (
                <a className="link mt-1.5 inline-block text-sm" href={t.href} target="_blank" rel="noreferrer">
                  {t.hrefLabel ?? "View on the explorer"}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-soft hover:bg-page-deep hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
            {t.pieces.length > 0 && (
              <span className="pointer-events-none absolute top-7 left-7" aria-hidden>
                {t.pieces.map((p, i) => (
                  <span
                    key={i}
                    className="coin"
                    style={
                      {
                        "--x": `${p.x}px`,
                        "--y": `${p.y}px`,
                                                "--d": `${p.d}s`,
                        "--c": p.c,
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
