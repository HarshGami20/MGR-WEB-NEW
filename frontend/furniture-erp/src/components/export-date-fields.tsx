import { CalendarIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EXPORT_MONTHS, yearOptions, type ExportDateFilterType } from "@/lib/export-query";

type ExportDateFieldsProps = {
  filterType: ExportDateFilterType;
  onFilterTypeChange: (v: ExportDateFilterType) => void;
  year: string;
  onYearChange: (v: string) => void;
  month: string;
  onMonthChange: (v: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  endDate: string;
  onEndDateChange: (v: string) => void;
};

export function ExportDateFields({
  filterType,
  onFilterTypeChange,
  year,
  onYearChange,
  month,
  onMonthChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
}: ExportDateFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Date filter</Label>
        <Select value={filterType} onValueChange={(v) => onFilterTypeChange(v as ExportDateFilterType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="year">By year</SelectItem>
            <SelectItem value="month">By month</SelectItem>
            <SelectItem value="custom">Custom date range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filterType === "year" ? (
        <div className="space-y-2">
          <Label>Year</Label>
          <Select value={year} onValueChange={onYearChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {filterType === "month" ? (
        <>
          <div className="space-y-2">
            <Label>Month</Label>
            <Select value={month} onValueChange={onMonthChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={year} onValueChange={onYearChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions().map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      {filterType === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Start date</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input type="date" className="pl-9" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>End date</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input type="date" className="pl-9" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
