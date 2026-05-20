import { DateRangePicker, type DateRangePickerProps, type DateRangeValue } from "@/components/date-range-picker";
import {
  LIST_DATE_FILTER_LABELS,
  type ListDateFilterContext,
} from "@/lib/list-date-filter";

export type ListDateRangeFilterProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Page-specific label and placeholder (orders, payments, inventory, etc.). */
  context: ListDateFilterContext;
  /** Override label from context map. */
  label?: string;
  /** Override placeholder from context map. */
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
} & Pick<
  DateRangePickerProps,
  "min" | "max" | "numberOfMonths" | "showPresets" | "presets" | "variant" | "align" | "showClear"
>;

const DEFAULT_TRIGGER_CLASS = "w-[200px]";

/**
 * Shared toolbar date range filter for list pages.
 * Uses the same presets, styling, and API param shape (`createdFrom` / `createdTo`) everywhere.
 */
export function ListDateRangeFilter({
  value,
  onChange,
  context,
  label,
  placeholder,
  className,
  triggerClassName = DEFAULT_TRIGGER_CLASS,
  disabled,
  variant = "filter",
  showClear = true,
  ...pickerProps
}: ListDateRangeFilterProps) {
  const copy = LIST_DATE_FILTER_LABELS[context];
  return (
    <DateRangePicker
      variant={variant}
      label={label ?? copy.label}
      placeholder={placeholder ?? copy.placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      triggerClassName={triggerClassName}
      showClear={showClear}
      {...pickerProps}
    />
  );
}
