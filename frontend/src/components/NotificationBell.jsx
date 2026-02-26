import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  CircleAlert,
  CircleCheck,
} from "lucide-react";
import { api } from "../shared/api";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";

const POLL_INTERVAL = 60_000; // 60 seconds

const TIP_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: CircleAlert,
  success: CircleCheck,
};

const TIP_COLOR = {
  info: "text-blue-500",
  warning: "text-amber-500",
  error: "text-red-500",
  success: "text-emerald-500",
};

const formatTimestamp = (ts) => {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "upravo";
  if (diffMin < 60) return `prije ${diffMin} min`;
  if (diffHr < 24) return `prije ${diffHr}h`;
  if (diffDays < 7) return `prije ${diffDays}d`;
  return date.toLocaleDateString("hr-HR");
};

export const NotificationBell = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.getNotifications({ limit: 20 });
      setNotifications(res.data.items || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch {
      // Silently fail -- user may not have permission or be logged out
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchNotifications]);

  // Refetch when popover opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const handleMarkRead = useCallback(
    async (notification) => {
      if (!notification.read) {
        try {
          await api.markNotificationRead(notification.id);
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notification.id ? { ...n, read: true } : n,
            ),
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        } catch {
          // ignore
        }
      }
      if (notification.link) {
        setOpen(false);
        navigate(notification.link);
      }
    },
    [navigate],
  );

  const handleMarkAllRead = useCallback(async () => {
    setLoading(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Obavijesti"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Obavijesti</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
              disabled={loading}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Oznaci sve kao procitane
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm">Nema obavijesti</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const TipIcon = TIP_ICON[notification.tip] || Info;
                const tipColor = TIP_COLOR[notification.tip] || TIP_COLOR.info;
                return (
                  <button
                    key={notification.id}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/50 ${
                      !notification.read ? "bg-primary/5" : ""
                    }`}
                    onClick={() => handleMarkRead(notification)}
                  >
                    <div className="flex gap-3">
                      <TipIcon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${tipColor}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm leading-snug ${
                              !notification.read
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/80"
                            }`}
                          >
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {formatTimestamp(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
