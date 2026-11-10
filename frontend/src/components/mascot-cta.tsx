import Link from "next/link";
import { cn } from "cn";
import { Mascot } from "./mascot";
import { StickerTrail } from "./sticker-trail";
import { buttonVariants } from "@/components/ui/button";

/**
 * Closing call to action. The page colour is the mascot clip's own backdrop, so the
 * video blends in without an overlay; the copy sits above the character, never on it.
 */
export function MascotCta() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden bg-page">
      <StickerTrail className="pt-20 pb-6 sm:pt-28">
        <div className="wrap text-center">
          <h2 id="cta-title" className="type-display">
            The treasury is watching.
          </h2>
          <p className="lede mx-auto mt-5 max-w-[34rem]">
            So you don&apos;t have to. Launch a meme, and the rules handle the boring parts:
            buying stock, buying back, paying out.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/launch" className={buttonVariants({ size: "lg" })}>
              Launch a meme
            </Link>
            <Link href="/#memes" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See live memes
            </Link>
          </div>
        </div>
      </StickerTrail>
      <div
        className={cn(
          "relative mx-auto -mt-4 aspect-[4/3] w-full max-w-[110rem] sm:aspect-[16/9] sm:max-h-[78svh]",
          "[mask-image:linear-gradient(to_bottom,transparent,black_22%),linear-gradient(to_right,transparent,black_18%,black_82%,transparent)] [mask-composite:intersect]",
        )}
      >
        <Mascot />
      </div>
    </section>
  );
}
