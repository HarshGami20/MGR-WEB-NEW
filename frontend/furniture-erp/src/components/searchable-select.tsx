import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  keywords?: string[];
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** Portal into dialog content so search + scroll work inside modals. */
  portalContainer?: HTMLElement | null;
};

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No results found.",
  disabled,
  className,
  portalContainer,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between gap-2 font-normal h-auto min-h-10 py-2 px-3",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left flex-1 min-w-0">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        className="z-[200] w-[min(100vw-2rem,480px)] min-w-0 p-0 overflow-hidden"
        align="start"
        sideOffset={4}
        collisionPadding={16}
        onInteractOutside={(e) => {
          if (portalContainer?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => {
          if (portalContainer?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <Command className="w-full min-w-0">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            className="max-h-[min(280px,40vh)] overflow-y-auto overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup className="p-1">
              {options.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <CommandItem
                    key={opt.value}
                    value={[opt.label, opt.value, ...(opt.keywords ?? [])].join(" ")}
                    keywords={opt.keywords ?? [opt.value, opt.label]}
                    className={cn(isSelected && "bg-accent text-accent-foreground")}
                    onSelect={() => {
                      onValueChange(opt.value);
                      setOpen(false);
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="truncate text-left">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
