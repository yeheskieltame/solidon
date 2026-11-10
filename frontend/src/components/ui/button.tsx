import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/** Chunky 3D buttons. The look lives in `.btn*` (globals.css); this maps the variants. */
const buttonVariants = cva("btn [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5", {
  variants: {
    variant: {
      default: "",
      blue: "btn-blue",
      golden: "btn-golden",
      outline: "btn-white",
      secondary: "btn-white",
      ink: "btn-ink",
      destructive: "btn-red",
      ghost: "btn-ghost",
      link: "btn-ghost",
    },
    size: {
      default: "",
      sm: "btn-sm",
      lg: "btn-lg",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
