"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
  workspace_id: string;
  user_id?: string | null;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({
  workspaceId,
  userId,
  children,
}: {
  workspaceId: string;
  userId: string;
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setNotifications(data as AppNotification[]);
    setLoading(false);
  }, [workspaceId, userId, supabase]);

  useEffect(() => {
    fetchNotifications();

    // Realtime subscription
    const channel = supabase
      .channel(`notifications:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const notif = payload.new as AppNotification;
          if (!notif.user_id || notif.user_id === userId) {
            setNotifications((prev) => [notif, ...prev].slice(0, 50));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? (payload.new as AppNotification) : n))
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, userId, fetchNotifications, supabase]);

  const markAsRead = async (id: string) => {
    const readAt = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: readAt } : n))
    );
  };

  const markAllRead = async () => {
    const readAt = new Date().toISOString();
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (!unreadIds.length) return;

    await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .in("id", unreadIds);

    setNotifications((prev) =>
      prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: readAt } : n))
    );
  };

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount: notifications.filter((n) => !n.read_at).length,
        loading,
        markAsRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be inside NotificationsProvider");
  return ctx;
}
