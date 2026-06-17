import { useMemo, useState, type MouseEvent } from "react";
import type { DateRange, Matcher } from "react-day-picker";
import { CalendarIcon, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type DateRangePreset,
  type DateRangeValue,
  dateToYmd,
  formatDateRangeLabel,
  getDefaultDateRangePresets,
  ymdToDate,
} from "@/lib/date-range";

export type { DateRangeValue, DateRangePreset } from "@/lib/date-range";
export { useDateRange } from "@/hooks/use-date-range";
export {
  addDaysYmd,
  formatDateRangeLabel,
  getDefaultDateRangePresets,
  isDateRangeActive,
  isDateRangeComplete,
  localTodayYmd,
  normalizeYmdRange,
} from "@/lib/date-range";

export type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Field label above the trigger */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  numberOfMonths?: number;
  showPresets?: boolean;
  presets?: DateRangePreset[];
  showClear?: boolean;
  id?: string;
  /** Minimum selectable date (YYYY-MM-DD) */
  min?: string;
  /** Maximum selectable date (YYYY-MM-DD) */
  max?: string;
  /** `filter` matches toolbar Select/Input height and borders */
  variant?: "default" | "filter";
};

export function DateRangePicker({
  value,
  onChange,
  label,
  placeholder = "Select date range",
  disabled = false,
  className,
  triggerClassName,
  align = "start",
  numberOfMonths = 2,
  showPresets = true,
  presets,
  showClear = true,
  id,
  min,
  max,
  variant = "default",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const presetList = presets ?? getDefaultDateRangePresets();

  const selected: DateRange | undefined = useMemo(
    () => ({
      from: ymdToDate(value.from),
      to: ymdToDate(value.to),
    }),
    [value.from, value.to],
  );

  const disabledDays = useMemo((): Matcher | Matcher[] | undefined => {
    const rules: Matcher[] = [];
    const minDate = ymdToDate(min);
    const maxDate = ymdToDate(max);
    if (minDate) rules.push({ before: minDate });
    if (maxDate) rules.push({ after: maxDate });
    return rules.length > 0 ? rules : undefined;
  }, [min, max]);

  const labelText = formatDateRangeLabel(value, { placeholder });
  const hasSelection = Boolean(value.from?.trim() || value.to?.trim());

  const handleSelect = (range: DateRange | undefined) => {
    onChange({
      from: range?.from ? dateToYmd(range.from) : undefined,
      to: range?.to ? dateToYmd(range.to) : undefined,
    });
    if (range?.from && range?.to) {
      setOpen(false);
    }
  };

  const handleClear = (e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onChange({});
    setOpen(false);
  };

  const isFilter = variant === "filter";

  const trigger = isFilter ? (
    <button
      id={id}
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm font-normal shadow-sm ring-offset-background transition-colors",
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
          aria-label="Clear date range"
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
  ) : (
    <Button
      id={id}
      type="button"
      variant="outline"
      disabled={disabled}
      className={cn(
        "h-10 w-full justify-start px-3 text-left font-normal",
        !hasSelection && "text-muted-foreground",
        triggerClassName,
      )}
    >
      <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
      <span className="truncate">{labelText}</span>
    </Button>
  );

  return (
    <div className={cn(!isFilter && label ? "space-y-1.5" : "", className)}>
      {label && !isFilter ? (
        <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
      ) : null}
      {label && isFilter ? (
        <Label htmlFor={id} className="sr-only">
          {label}
        </Label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          {showPresets ? (
            <div className="flex flex-wrap gap-1.5 border-b bg-muted/30 p-2">
              {presetList.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    onChange(preset.getValue());
                    setOpen(false);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          ) : null}
          <Calendar
            mode="range"
            numberOfMonths={numberOfMonths}
            selected={selected}
            onSelect={handleSelect}
            disabled={disabledDays}
            defaultMonth={selected?.from ?? selected?.to ?? ymdToDate(min) ?? new Date()}
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
