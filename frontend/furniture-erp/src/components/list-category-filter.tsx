import { useMemo, useState } from "react";
import { useListCategories } from "@/api-client";
import type { CategoryRoot } from "@/components/category-picker-with-manage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryFilterDisplayLabel } from "@/lib/list-category-filter";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

export type ListCategoryFilterProps = {
  value: number | undefined;
  onChange: (categoryId: number | undefined) => void;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
};

const DEFAULT_TRIGGER_CLASS =
  "h-9 w-[min(100%,210px)] justify-between rounded-xl border border-border/80 bg-background px-3 font-normal shadow-sm hover:bg-background";

export function ListCategoryFilter({
  value,
  onChange,
  className,
  triggerClassName = DEFAULT_TRIGGER_CLASS,
  disabled,
}: ListCategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const { data: categoriesData } = useListCategories();
  const roots = useMemo(
    () => (Array.isArray(categoriesData) ? (categoriesData as CategoryRoot[]) : []),
    [categoriesData],
  );

  const displayLabel = categoryFilterDisplayLabel(value, roots);

  const selectCategory = (id: number | undefined) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          className={cn(triggerClassName, className , "h-9 w-[min(100%,210px)] justify-between rounded-lg border cursor-pointer border-border/80 bg-card px-3 font-normal shadow-sm hover:bg-card")}
          aria-label="Filter by category"
        >
          <span className="truncate text-left">{displayLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(100vw-2rem,220px)]">
        <DropdownMenuItem
          onSelect={() => selectCategory(undefined)}
          className="flex items-center justify-between"
        >
          <span>All categories</span>
          {value == null ? <Check className="h-4 w-4 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {roots.length === 0 ? (
          <DropdownMenuItem disabled>No categories</DropdownMenuItem>
        ) : (
          roots.map((root) => {
            const children = root.children ?? [];
            const parentSelected = value === root.id;
            const childSelected = children.some((c) => c.id === value);

            if (children.length === 0) {
              return (
                <DropdownMenuItem
                  key={root.id}
                  onSelect={() => selectCategory(root.id)}
                  className="flex items-center justify-between"
                >
                  <span>{root.name}</span>
                  {parentSelected ? <Check className="h-4 w-4 text-primary" /> : null}
                </DropdownMenuItem>
              );
            }

            return (
              <DropdownMenuSub key={root.id}>
                <DropdownMenuSubTrigger
                  className={cn(
                    "flex w-full cursor-default items-center justify-between",
                    (parentSelected || childSelected) && "bg-accent/60",
                  )}
                >
                  <span className="truncate">{root.name}</span>
                  {parentSelected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[200px]">
                  <DropdownMenuItem
                    onSelect={() => selectCategory(root.id)}
                    className="flex items-center justify-between font-medium"
                  >
                    <span>All {root.name}</span>
                    {parentSelected ? <Check className="h-4 w-4 text-primary" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {children.map((child) => (
                    <DropdownMenuItem
                      key={child.id}
                      onSelect={() => selectCategory(child.id)}
                      className="flex items-center justify-between pl-6"
                    >
                      <span>{child.name}</span>
                      {value === child.id ? <Check className="h-4 w-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
