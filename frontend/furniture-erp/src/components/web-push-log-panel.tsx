import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  clearPushLogs,
  getPushLogs,
  subscribePushLogs,
  type PushLogEntry,
} from "@/lib/push-notification-log";

function levelClass(level: PushLogEntry["level"]): string {
  switch (level) {
    case "error":
      return "text-destructive";
    case "warn":
      return "text-amber-700 dark:text-amber-400";
    case "debug":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

export function WebPushLogPanel({ compact = false }: { compact?: boolean }) {
  const [logs, setLogs] = useState<PushLogEntry[]>(() => getPushLogs());

  useEffect(() => subscribePushLogs(() => setLogs(getPushLogs())), []);

  if (logs.length === 0) {
    return (
      <p className={cn("text-muted-foreground", compact ? "text-[10px] py-2 px-1" : "text-xs py-4 text-center")}>
        No web push events yet. Allow notifications and use &quot;Test Chrome web push&quot;.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("font-medium", compact ? "text-[10px]" : "text-xs")}>Web push log ({logs.length})</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 gap-1", compact && "h-6 text-[10px] px-2")}
          onClick={() => clearPushLogs()}
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>
      <ScrollArea className={cn(compact ? "h-[140px]" : "h-[220px]", "rounded-md border bg-muted/30")}>
        <ul className="p-2 space-y-1.5 font-mono text-[10px] leading-snug">
          {logs.map((row) => (
            <li key={row.id} className="border-b border-border/40 pb-1.5 last:border-0">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
                <span>{new Date(row.at).toLocaleTimeString()}</span>
                <span className={levelClass(row.level)}>[{row.level}]</span>
                <span className="text-primary/80">{row.event}</span>
              </div>
              <p className={cn("mt-0.5", levelClass(row.level))}>{row.message}</p>
              {row.detail != null ? (
                <pre className="mt-1 whitespace-pre-wrap break-all text-muted-foreground opacity-90">
                  {typeof row.detail === "string" ? row.detail : JSON.stringify(row.detail, null, 0)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

