"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
}

/** A segmented control: the active segment is a white key that slides between tabs. */
function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("relative flex w-full gap-1 rounded-full bg-page-deep p-1", className)}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator className="absolute top-1 left-[var(--active-tab-left)] z-0 h-[var(--active-tab-height)] w-[var(--active-tab-width)] rounded-full bg-card shadow-[var(--shadow-sm)] transition-[left,width] duration-300 ease-[var(--ease-spring)]" />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-soft transition-colors duration-150 hover:text-ink data-active:text-ink [&_svg]:size-3.5",
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
