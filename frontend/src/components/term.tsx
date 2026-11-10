import { Info } from "lucide-react";
import { useId, type ReactNode } from "react";

/** Plain-language definitions for the jargon the dashboard cannot avoid. */
export const GLOSSARY = {
  nav: "Net asset value: everything the treasury holds (stock at the oracle price, plus USDC), divided by the tokens in circulation.",
  mnav: "Market price ÷ NAV. 2.0× means the meme trades at twice what its treasury is worth per token.",
  buffer: "USDC kept on NEAR to pay redemptions. The contract aims for 20% of assets and only spends what is above it on buybacks.",
  transit: "USDC the contract sent toward this chain that has not been confirmed as arrived yet. It still counts as cash, not stock.",
  ledger: "What the contract wrote down. For every swap it books the minimum output it signed for, never an estimate.",
  onchain: "The balance read live from this chain's public RPC by your browser, right now.",
  twap: "Time-weighted average price over 30 minutes, so one big trade cannot trick the rules.",
} as const;

/**
 * A dotted-underlined word with a tooltip. Hover or focus shows it; it is also
 * wired with aria-describedby so screen readers read the definition.
 */
export function Term({
  children,
  tip,
  k,
  align = "center",
}: {
  children: ReactNode;
  tip?: string;
  k?: keyof typeof GLOSSARY;
  align?: "center" | "start" | "end";
}) {
  const id = useId();
  const text = tip ?? (k ? GLOSSARY[k] : "");
  return (
    <span className="term" tabIndex={0} aria-describedby={id} data-align={align}>
      {children}
      <span role="tooltip" id={id} className="term-tip">
        {text}
      </span>
    </span>
  );
}

/** The (i) after a stat label: the same tooltip as `Term`, on an icon. */
export function Hint({
  tip,
  k,
  label = "What is this?",
  align = "center",
}: {
  tip?: string;
  k?: keyof typeof GLOSSARY;
  label?: string;
  align?: "center" | "start" | "end";
}) {
  const id = useId();
  const text = tip ?? (k ? GLOSSARY[k] : "");
  return (
    <span className="hint" tabIndex={0} role="button" aria-label={label} aria-describedby={id} data-align={align}>
      <Info className="size-4" strokeWidth={1.75} aria-hidden />
      <span role="tooltip" id={id} className="term-tip">
        {text}
      </span>
    </span>
  );
}
