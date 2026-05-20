import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/notification-api";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import { notificationActionLabel, notificationHref } from "@/lib/notification-links";
import { WebPushLogPanel } from "@/components/web-push-log-panel";
import { ServerPushLogPanel } from "@/components/server-push-log-panel";

const PAGE_SIZE = 25;

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ["notifications", "infinite"],
    queryFn: ({ pageParam }) => getNotifications(pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const loaded = last.page * last.limit;
      return loaded < last.total ? last.page + 1 : undefined;
    },
  });

  const markReadMut = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const rows: NotificationRow[] = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Real-time updates and alerts for your account.</p>
        </div>
        <Button variant="outline" size="sm" disabled={markAllMut.isPending} onClick={() => markAllMut.mutate()}>
          Mark all as read
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Inbox</CardTitle>
          <CardDescription>Newest first. Socket-delivered items appear instantly.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive py-8 text-center">Could not load notifications.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">You&apos;re all caught up.</p>
          ) : (
            <>
              <ScrollArea className="h-[min(70vh,560px)] pr-3">
                <ul className="space-y-2">
                  {rows.map((row) => {
                    const href = notificationHref(row);
                    const actionLabel = notificationActionLabel(row);
                    const openRow = () => {
                      if (!row.isRead) markReadMut.mutate(row.recipientId);
                      if (href) setLocation(href);
                    };
                    return (
                    <li
                      key={row.recipientId}
                      className={cn(
                        "rounded-xl border p-4 flex gap-3 transition-colors",
                        !row.isRead ? "border-primary/25 bg-primary/[0.03]" : "border-border/80",
                        href && "cursor-pointer hover:border-primary/20",
                      )}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left min-w-0"
                        onClick={openRow}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium leading-snug">{row.title}</p>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                            {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{row.message}</p>
                        {href && actionLabel ? (
                          <p className="text-xs font-medium text-primary mt-2">{actionLabel} →</p>
                        ) : null}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                        onClick={() => deleteMut.mutate(row.recipientId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                    );
                  })}
                </ul>
              </ScrollArea>
              {hasNextPage ? (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    disabled={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Web push debug</CardTitle>
          <CardDescription>
            Browser events (token, foreground, service worker) and server FCM delivery records.
            Set <code className="text-xs">VITE_DEBUG_NOTIFICATIONS=true</code> for verbose console logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <WebPushLogPanel />
          <ServerPushLogPanel />
        </CardContent>
      </Card> */}
    </div>
  );
}
