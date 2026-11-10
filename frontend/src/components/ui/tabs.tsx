"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
}

/** A fat segmented toggle: the active segment is a raised white key. */
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex w-full gap-1.5 rounded-[18px] bg-lilac-wash p-1.5", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-transparent px-3 text-base font-extrabold text-soft transition-[transform,background-color,color,box-shadow] duration-150 ease-[var(--ease-spring)] hover:text-ink data-active:border-line-strong data-active:bg-white data-active:text-ink data-active:shadow-[0_3px_0_var(--line-strong)] active:translate-y-0.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
