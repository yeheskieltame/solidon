/** Risk statements from docs/SPEC.md "Trust assumptions & threat model". */
export const DISCLAIMERS = [
  {
    title: "A NAV floor, not a price guarantee",
    body: "Redemption and buyback defend NAV per token. If the stock falls, NAV falls with it.",
  },
  {
    title: "Synthetic stocks on testnet",
    body: "Testnets have no real stock tokens. Every venue on Base Sepolia, Robinhood Chain testnet and Solana devnet is a Solidon synthetic token in its own pool, priced by a mock oracle. Nothing here has value.",
  },
  {
    title: "Robinhood Chain holdings are relayer-reported",
    body: "The contract records its own swaps conservatively. MPC can verify Base logs and Solana account state; Robinhood Chain has no proof path yet.",
  },
  {
    title: "Not for US persons",
    body: "Tokenized stocks (Stock Tokens) are not offered to US persons.",
  },
];

export function Disclaimers() {
  return (
    <footer className="mt-24 border-t border-ink">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {DISCLAIMERS.map((d) => (
          <div key={d.title}>
            <p className="text-sm font-semibold">{d.title}</p>
            <p className="mt-1 text-sm text-graphite">{d.body}</p>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-10 text-xs text-graphite sm:px-6">
        Solidon: memes with a balance sheet. Built for NEAR HACKATHON 2026. No admin key: every
        parameter is locked at launch and readable with <code>get_params</code>.
      </div>
    </footer>
  );
}
