import type { Metadata } from "next";
import { DISCLAIMERS, TRADEMARK_NOTE } from "@/components/disclaimers";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Risks" };

/** The full risk wording the one-line footer points to. */
export default function RisksPage() {
  return (
    <div className="wrap max-w-[52rem] pt-14 pb-24 sm:pt-20">
      <h1 className="type-h1">Risks</h1>
      <p className="lede mt-4 max-w-[40rem]">
        Solidon runs on testnets. Read this before you trade, launch or redeem. The long version is
        the threat model in the spec.
      </p>
      <dl className="mt-12">
        {DISCLAIMERS.map((d) => (
          <div key={d.title} className="grid gap-2 border-t border-line py-6 sm:grid-cols-[16rem_1fr] sm:gap-8">
            <dt className="text-[1.0625rem]">{d.title}</dt>
            <dd className="text-soft">{d.body}</dd>
          </div>
        ))}
        <div className="grid gap-2 border-t border-line py-6 sm:grid-cols-[16rem_1fr] sm:gap-8">
          <dt className="text-[1.0625rem]">No admin key</dt>
          <dd className="text-soft">
            Every parameter is locked at launch and readable with <code>get_params</code>. There is
            no owner who can change a rule, and no one who can reverse a mistake.
          </dd>
        </div>
        <div className="grid gap-2 border-y border-line py-6 sm:grid-cols-[16rem_1fr] sm:gap-8">
          <dt className="text-[1.0625rem]">Trademarks</dt>
          <dd className="text-soft">{TRADEMARK_NOTE}</dd>
        </div>
      </dl>
      <a
        href={`${GITHUB_URL}/blob/main/docs/SPEC.md`}
        target="_blank"
        rel="noreferrer"
        className="link mt-8 inline-block"
      >
        Trust assumptions and threat model in the spec
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
