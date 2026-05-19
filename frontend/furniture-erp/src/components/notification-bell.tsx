import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell, CheckCheck, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  sendTestWebPush,
  type NotificationRow,
} from "@/lib/notification-api";
import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser } from "@/lib/partner";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { WebPushLogPanel } from "@/components/web-push-log-panel";
import { pushLog } from "@/lib/push-notification-log";

function NotificationLine({
  row,
  onOpen,
}: {
  row: NotificationRow;
  onOpen: (recipientId: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:bg-muted/80 border border-transparent",
        !row.isRead && "bg-primary/5 border-primary/15",
      )}
      onClick={() => onOpen(row.recipientId)}
    >
      <p className="text-sm font-medium leading-snug line-clamp-2">{row.title}</p>
      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{row.message}</p>
      <p className="text-[10px] text-muted-foreground mt-1">
        {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
      </p>
    </button>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    enabled: !!user && !isPartnerPortalUser(user),
    refetchInterval: 60_000,
  });

  const { data: recent, isLoading } = useQuery({
    queryKey: ["notifications", "dropdown"],
    queryFn: () => getNotifications(1, 12),
    enabled: !!user && !isPartnerPortalUser(user),
  });

  const markReadMut = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const testPushMut = useMutation({
    mutationFn: sendTestWebPush,
    onSuccess: (r) => {
      if (r.ok) {
        pushLog("info", "test_push_ui", "Test push succeeded from bell", r);
        toast({
          title: "Test push sent",
          description:
            r.tokenCount != null
              ? `Check for a system notification (try minimizing this tab). ${r.successCount ?? 0} device(s).`
              : "Check for a system notification.",
        });
        return;
      }
      pushLog("warn", "test_push_ui", r.error ?? "Test push failed", r);
      toast({
        title: "Test push did not send",
        description: r.error ?? "Unknown error",
        variant: "destructive",
      });
    },
    onError: (e: unknown) => {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      pushLog("error", "test_push_ui", msg, e);
      toast({ title: "Test push failed", description: msg, variant: "destructive" });
    },
  });

  if (!user || isPartnerPortalUser(user)) return null;

  const count = unread?.count ?? recent?.unreadCount ?? 0;
  const rows = recent?.data ?? [];

  const handleOpen = (recipientId: string) => {
    markReadMut.mutate(recipientId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" type="button" className="shrink-0 rounded-xl relative" aria-label="Notifications">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {count > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] font-bold rounded-full"
            >
              {count > 99 ? "99+" : count}  
            </Badge>
          ) : null}
        </Button> 
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0">
        <DropdownMenuLabel className="px-3 py-2 flex items-center justify-between gap-2 border-b border-border">
          <span>Notifications</span>
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={markAllMut.isPending}
              onClick={() => markAllMut.mutate()}
            >
              {markAllMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Mark all read
            </Button>
          ) : null}
        </DropdownMenuLabel>
        <ScrollArea className="h-[min(70vh,320px)]">
          {isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-3">No notifications yet</p>
          ) : (
            <div className="p-2 space-y-1">
              {rows.map((row) => (
                <NotificationLine key={row.recipientId} row={row} onOpen={handleOpen} />
              ))}
            </div>
          )}
        </ScrollArea>
        <DropdownMenuSeparator className="m-0" />
        {/* <div className="px-2 py-2 border-b border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            disabled={testPushMut.isPending}
            onClick={() => testPushMut.mutate()}
          >
            {testPushMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Radio className="h-3.5 w-3.5 shrink-0" />}
            Test Chrome web push
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5 leading-snug">
            Push is working if the log shows success. With this tab focused you get an in-app toast; minimize the tab or check the top-right of macOS for the banner. Allow notifications in Chrome site settings if you see nothing.
          </p>
          <WebPushLogPanel compact />
        </div> */}
        <DropdownMenuItem asChild className="rounded-none cursor-pointer">
          <Link href="/notifications" className="justify-center text-primary font-medium py-3">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
