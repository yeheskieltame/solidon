// Pure read of two optional `get_treasury_chains` fields the dashboard shows per chain:
// how a cash arrival is proven (`config.proof`) and USDC still in transit (`in_transit`).
// Older contracts report neither, so both fall back to the SPEC's trust assumptions.

import { toBig } from "./format";
import type { ChainViewRaw, TreasuryChainsRaw } from "./near";

export type ProofKind = "mpc" | "relayer";

export type ChainProof = {
  kind: ProofKind;
  /** True when the contract itself reported the proof path. */
  fromContract: boolean;
  /** USDC (6 decimals) sent toward the chain and not yet credited; null if not reported. */
  inTransit: bigint | null;
};

/** SPEC "Trust assumptions": the MPC can verify Base logs; the other chains are reported. */
const DEFAULT_PROOF: Record<string, ProofKind> = {
  base: "mpc",
  robinhood: "relayer",
  solana: "relayer",
};

function rawFor(raw: TreasuryChainsRaw | null, key: string): ChainViewRaw | null {
  if (!raw) return null;
  if (key === "solana" && raw.solana) return raw.solana;
  const match = (name: unknown) => {
    const n = String(name ?? "").toLowerCase();
    return key === "robinhood" ? n.includes("hood") : n.includes(key);
  };
  return (raw.chains ?? []).find((c) => match(c.config?.name ?? c.name ?? c.chain)) ?? null;
}

export function chainProof(raw: TreasuryChainsRaw | null, key: string): ChainProof {
  const c = rawFor(raw, key);
  const reported = (c?.config as { proof?: unknown } | undefined)?.proof;
  let kind: ProofKind | null = null;
  if (typeof reported === "string") kind = reported.toLowerCase() === "relayer" ? "relayer" : null;
  else if (reported && typeof reported === "object") {
    kind = Object.keys(reported).some((k) => k.toLowerCase() === "mpc") ? "mpc" : "relayer";
  }
  const transit = (c as { in_transit?: unknown } | null)?.in_transit;
  return {
    kind: kind ?? DEFAULT_PROOF[key] ?? "relayer",
    fromContract: kind !== null,
    inTransit: typeof transit === "string" || typeof transit === "number" ? toBig(transit) : null,
  };
}

export const PROOF_COPY: Record<ProofKind, { label: string; tip: string }> = {
  mpc: {
    label: "MPC-proven",
    tip: "Cash arriving on this chain is credited only after the NEAR MPC network verifies the transfer log. No one has to be trusted.",
  },
  relayer: {
    label: "Relayer-reported",
    tip: "The MPC cannot read this chain yet, so the keeper reports cash arrivals. Swaps are still signed by the contract and booked at their minimum output.",
  },
};
