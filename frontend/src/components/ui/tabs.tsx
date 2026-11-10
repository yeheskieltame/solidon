"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
}

/** Plain text tabs; the active one sits on a soft dark key that slides between them. */
function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("relative flex gap-1", className)}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator className="absolute top-0 left-[var(--active-tab-left)] z-0 h-[var(--active-tab-height)] w-[var(--active-tab-width)] rounded-[10px] bg-page-deep transition-[left,width] duration-300 ease-[var(--ease-spring)]" />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] px-4 text-[0.9375rem] text-ink-2 transition-colors duration-150 hover:text-ink data-active:text-ink [&_svg]:size-3.5",
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
