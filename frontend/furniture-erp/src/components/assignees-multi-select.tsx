import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type AssigneeOption = { id: number; name: string; mobile?: string | null };

type Props = {
  options: AssigneeOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function AssigneesMultiSelect({
  options,
  value,
  onChange,
  disabled,
  placeholder = "Select staff…",
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const summary = useMemo(() => {
    if (value.length === 0) return null;
    const names = options.filter((o) => selectedSet.has(o.id)).map((o) => o.name);
    if (names.length === 0) return `${value.length} selected`;
    if (names.length <= 2) return names.join(", ");
    return `${names.length} staff selected`;
  }, [options, value, selectedSet]);

  function toggle(id: number) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next].sort((a, b) => a - b));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Assign to"
          disabled={disabled}
          className={cn(
            "w-full justify-between gap-2 font-normal h-auto min-h-10 py-2 px-3",
            !summary && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left flex-1 min-w-0">{summary ?? placeholder}</span>
          <div className="flex items-center gap-1 shrink-0">
            {value.length > 0 ? (
              <Badge variant="secondary" className="rounded-sm px-1.5 font-normal tabular-nums">
                {value.length}
              </Badge>
            ) : null}
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,420px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or mobile…" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No staff found.</CommandEmpty>
            <CommandGroup>
              {options.map((u) => {
                const sel = selectedSet.has(u.id);
                const mobile = u.mobile?.trim() ?? "";
                return (
                  <CommandItem
                    key={u.id}
                    keywords={[u.name, mobile, String(u.id)]}
                    value={`${u.name} ${mobile} ${u.id}`}
                    onSelect={() => toggle(u.id)}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                    <span className="truncate flex-1">{u.name}</span>
                    {mobile ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">{mobile}</span> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {value.length > 0 ? (
          <div className="border-t px-2 py-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onChange([])}
            >
              Clear all
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
