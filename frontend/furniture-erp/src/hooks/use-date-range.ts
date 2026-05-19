import { useCallback, useMemo, useState } from "react";
import {
  type DateRangeValue,
  isDateRangeActive,
  isDateRangeComplete,
  normalizeYmdRange,
} from "@/lib/date-range";

export function useDateRange(initial?: DateRangeValue) {
  const [value, setValue] = useState<DateRangeValue>(initial ?? {});

  const setRange = useCallback((next: DateRangeValue) => {
    const from = next.from?.trim() ?? "";
    const to = next.to?.trim() ?? "";
    if (from && to) {
      const normalized = normalizeYmdRange(from, to);
      setValue({ from: normalized.fromYmd, to: normalized.toYmd });
      return;
    }
    setValue({
      from: from || undefined,
      to: to || undefined,
    });
  }, []);

  const reset = useCallback((next?: DateRangeValue) => {
    setValue(next ?? {});
  }, []);

  const normalized = useMemo(() => {
    const from = value.from?.trim() ?? "";
    const to = value.to?.trim() ?? "";
    if (!from || !to) return { fromYmd: from, toYmd: to };
    return normalizeYmdRange(from, to);
  }, [value.from, value.to]);

  return {
    value,
    setValue: setRange,
    reset,
    fromYmd: normalized.fromYmd,
    toYmd: normalized.toYmd,
    isActive: isDateRangeActive(value),
    isComplete: isDateRangeComplete(value),
  };
}
