import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { CalendarClock, Receipt, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TAB_ICONS: Record<string, LucideIcon> = {
  due: Wallet,
  followups: CalendarClock,
  payments: Receipt,
};

const PlayStoreTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex w-full items-end justify-between gap-1 border-b border-border/60 bg-muted/30 px-2 pb-2 pt-2 sm:px-4",
      className,
    )}
    {...props}
  />
));
PlayStoreTabsList.displayName = "PlayStoreTabsList";

const PlayStoreTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const Icon = value ? TAB_ICONS[value] : null;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "group flex min-h-14 flex-1 flex-col items-center justify-end gap-1 rounded-none border-0 bg-transparent px-1 py-1 text-[#5F6368] shadow-none outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "data-[state=active]:bg-transparent data-[state=active]:text-[#1A73E8] data-[state=active]:shadow-none",
        className,
      )}
      {...props}
    >
      <span className="relative flex h-8 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-[#D3E3FD] opacity-0 transition-opacity group-data-[state=active]:opacity-100" />
        {Icon ? (
          <Icon
            className="relative z-[1] h-[22px] w-[22px] stroke-[1.75]"
            aria-hidden
          />
        ) : null}
      </span>
      <span className="max-w-full truncate text-center text-xs font-medium group-data-[state=active]:font-semibold">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  );
});
PlayStoreTabsTrigger.displayName = "PlayStoreTabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, PlayStoreTabsList, PlayStoreTabsTrigger };
