import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "field file:mr-3 file:mt-2 file:inline-flex file:h-8 file:cursor-pointer file:rounded-full file:border-0 file:bg-page-deep file:px-3 file:text-sm file:font-medium file:text-ink",
        className
      )}
      {...props}
    />
  )
}

export { Input }
