"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// useInboxRealtime
//
// Upgraded realtime hook for Flowra Inbox. Subscribes to a single, persistent
// workspace-wide channel for messages and threads. This matches WaCRM's stable
// architecture and avoids WebSocket reconnect latency when switching threads.
// ─────────────────────────────────────────────────────────────────────────────

interface UseInboxRealtimeOptions {
  /** Workspace-scoped channel for all message and thread events. */
  workspaceId: string | null;
  onMessageInsert?: (msg: Record<string, any>) => void;
  onMessageUpdate?: (msg: Record<string, any>) => void;
  onThreadInsert?: (thread: Record<string, any>) => void;
  onThreadUpdate?: (thread: Record<string, any>) => void;
  enabled?: boolean;
}

interface UseInboxRealtimeResult {
  isConnected: boolean;
  /**
   * Bumped whenever a WS reconnect or tab-return is detected.
   * Pass as a dep to refetch effects to fill the event gap.
   */
  resyncToken: number;
}

export function useInboxRealtime({
  workspaceId,
  onMessageInsert,
  onMessageUpdate,
  onThreadInsert,
  onThreadUpdate,
  enabled = true,
}: UseInboxRealtimeOptions): UseInboxRealtimeResult {
  const [isConnected, setIsConnected] = useState(false);
  const [resyncToken, setResyncToken] = useState(0);

  // Stable callback refs — avoids re-subscribing when parent re-renders
  const onMsgInsertRef = useRef(onMessageInsert);
  const onMsgUpdateRef = useRef(onMessageUpdate);
  const onThreadInsertRef = useRef(onThreadInsert);
  const onThreadUpdateRef = useRef(onThreadUpdate);
  useEffect(() => {
    onMsgInsertRef.current = onMessageInsert;
    onMsgUpdateRef.current = onMessageUpdate;
    onThreadInsertRef.current = onThreadInsert;
    onThreadUpdateRef.current = onThreadUpdate;
  });

  // Track WS state transitions for the reconnect-resync
  const wasConnectedRef = useRef(false);
  const initialConnectDoneRef = useRef(false);

  const bumpResync = useCallback(() => {
    setResyncToken((t) => t + 1);
  }, []);

  // ── Workspace-wide Realtime Channel (Messages + Threads) ──────
  useEffect(() => {
    if (!enabled || !workspaceId) return;

    const supabase = createClient();

    const channel: RealtimeChannel = supabase
      .channel(`inbox-realtime-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow && newRow.workspace_id === workspaceId) {
            if (payload.eventType === "INSERT") {
              onMsgInsertRef.current?.(newRow);
            } else if (payload.eventType === "UPDATE") {
              onMsgUpdateRef.current?.(newRow);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "threads",
        },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow && newRow.workspace_id === workspaceId) {
            if (payload.eventType === "INSERT") {
              onThreadInsertRef.current?.(newRow);
            } else if (payload.eventType === "UPDATE") {
              onThreadUpdateRef.current?.(newRow);
            }
          }
        }
      )

      .subscribe((status) => {
        const connected = status === "SUBSCRIBED";
        setIsConnected(connected);

        if (connected) {
          if (!initialConnectDoneRef.current) {
            // First connect — initial fetches handle this
            initialConnectDoneRef.current = true;
          } else if (wasConnectedRef.current === false) {
            // Reconnected after a drop — bump to re-fetch missed events
            bumpResync();
          }
          wasConnectedRef.current = true;
        } else {
          wasConnectedRef.current = false;
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
      wasConnectedRef.current = false;
      initialConnectDoneRef.current = false;
    };
  }, [workspaceId, enabled, bumpResync]);

  // ── Tab visibility resync ─────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (!document.hidden) {
        // Tab returned to foreground — catch missed events
        bumpResync();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, bumpResync]);

  return { isConnected, resyncToken };
}
