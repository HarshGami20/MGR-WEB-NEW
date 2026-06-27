import { useMemo, useState, type MouseEvent } from "react";
import type { Matcher } from "react-day-picker";
import { CalendarIcon, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { dateToYmd, formatYmdLabel, ymdToDate } from "@/lib/date-range";

export type SingleDatePickerProps = {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  showClear?: boolean;
  id?: string;
  /** Minimum selectable date (YYYY-MM-DD) */
  min?: string;
  /** Maximum selectable date (YYYY-MM-DD) */
  max?: string;
  required?: boolean;
};

export function SingleDatePicker({
  value,
  onChange,
  label,
  placeholder = "Select date",
  disabled = false,
  className,
  triggerClassName,
  align = "start",
  showClear = true,
  id,
  min,
  max,
  required,
}: SingleDatePickerProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => ymdToDate(value), [value]);

  const disabledDays = useMemo((): Matcher | Matcher[] | undefined => {
    const rules: Matcher[] = [];
    const minDate = ymdToDate(min);
    const maxDate = ymdToDate(max);
    if (minDate) rules.push({ before: minDate });
    if (maxDate) rules.push({ after: maxDate });
    return rules.length > 0 ? rules : undefined;
  }, [min, max]);

  const labelText = formatYmdLabel(value, { placeholder });
  const hasSelection = Boolean(value?.trim());

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(dateToYmd(date));
    setOpen(false);
  };

  const handleClear = (e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onChange("");
    setOpen(false);
  };

  return (
    <div className={cn(label ? "space-y-1.5" : "", className)}>
      {label ? (
        <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
          {required ? " *" : null}
        </Label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm font-normal shadow-sm ring-offset-background transition-colors",
              "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              !hasSelection && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate text-left">{labelText}</span>
            {showClear && hasSelection ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear date"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClear();
                  }
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={disabledDays}
            defaultMonth={selected ?? ymdToDate(min) ?? ymdToDate(max) ?? new Date()}
          />
          {showClear && hasSelection ? (
            <div className="flex justify-end border-t p-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={handleClear}>
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
