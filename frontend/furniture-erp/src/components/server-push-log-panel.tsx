import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getServerPushLogs } from "@/lib/notification-api";
import { cn } from "@/lib/utils";

export function ServerPushLogPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["notifications", "push-logs"],
    queryFn: () => getServerPushLogs(40),
    refetchInterval: 30_000,
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Server delivery log (FCM)</p>
        <button
          type="button"
          className="text-[10px] text-primary hover:underline"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          Refresh
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <p className="text-xs text-destructive py-4 text-center">Could not load server push logs.</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No push attempts logged yet.</p>
      ) : (
        <ScrollArea className="h-[200px] rounded-md border bg-muted/20">
          <ul className="p-2 space-y-2 font-mono text-[10px]">
            {rows.map((row) => (
              <li key={row.id} className="border-b border-border/40 pb-2 last:border-0">
                <div className="flex flex-wrap gap-2 text-muted-foreground">
                  <span>{new Date(row.createdAt).toLocaleString()}</span>
                  <span
                    className={cn(
                      row.status === "sent" && "text-emerald-700 dark:text-emerald-400",
                      row.status === "failed" && "text-destructive",
                    )}
                  >
                    {row.status}
                  </span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-all text-foreground/80">
                  {typeof row.detail === "string" ? row.detail : JSON.stringify(row.detail)}
                </pre>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
