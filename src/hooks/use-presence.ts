"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  derivePresence,
  HEARTBEAT_MS,
  IDLE_AFTER_MS,
  OFFLINE_AFTER_MS,
  type PresenceRow,
  type PresenceStatus,
  type StoredPresence,
} from "@/lib/presence";
import { useWorkspace } from "@/context/WorkspaceContext";

// How often we re-derive offline locally (no DB event fires for this)
const RE_DERIVE_MS = 15_000;

type PresenceMap = Map<string, PresenceRow>;

export interface PresenceRowEnriched extends PresenceRow {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface UsePresenceResult {
  /** Derived status for one member (defaults to offline). */
  getPresence: (userId: string) => PresenceStatus;
  /** Raw row for tooltip rendering ("last seen X min ago"). */
  getRow: (userId: string) => PresenceRow | undefined;
  /** The clock value being used for derivation (updates every ~15s). */
  now: number;
  /** All workspace presence rows sorted online → away → offline. */
  rows: PresenceRowEnriched[];
}

/**
 * Live presence for every member of the current workspace.
 * - Reads `member_presence` table (RLS-scoped to workspace)
 * - Subscribes to Realtime changes
 * - Re-derives "offline" on a local 15s timer (no DB event fires on tab close)
 */
export function usePresence(enabled = true): UsePresenceResult {
  const { workspace } = useWorkspace();
  const workspaceId = workspace.id;

  const [rows, setRows] = useState<PresenceMap>(() => new Map());
  const [now, setNow] = useState(() => Date.now());
  // member profile info keyed by user_id
  const [memberProfiles, setMemberProfiles] = useState<Map<string, { full_name: string | null; email: string; avatar_url: string | null }>>(() => new Map());

  const active = enabled && !!workspaceId;

  useEffect(() => {
    if (!active) return;

    const supabase = createClient();
    let cancelled = false;

    const applyRow = (row: {
      user_id: string;
      status: StoredPresence;
      last_seen_at: string;
    }) => {
      setRows((prev) => {
        const next = new Map(prev);
        next.set(row.user_id, {
          status: row.status,
          last_seen_at: row.last_seen_at,
        });
        return next;
      });
    };

    // Subscribe FIRST so we don't miss events that arrive while fetching
    const channel = supabase
      .channel(`presence:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "member_presence",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { user_id?: string };
            if (!old.user_id) return;
            setRows((prev) => {
              if (!prev.has(old.user_id!)) return prev;
              const next = new Map(prev);
              next.delete(old.user_id!);
              return next;
            });
            return;
          }
          applyRow(
            payload.new as {
              user_id: string;
              status: StoredPresence;
              last_seen_at: string;
            }
          );
        }
      )
      .subscribe();

    // Initial snapshot — merge with what realtime may have already delivered
    supabase
      .from("member_presence")
      .select("user_id, status, last_seen_at")
      .eq("workspace_id", workspaceId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[usePresence] initial fetch error:", error.message);
          return;
        }
        setRows((prev) => {
          const next = new Map(prev);
          for (const r of data ?? []) {
            const userId = r.user_id as string;
            const incoming: PresenceRow = {
              status: r.status as StoredPresence,
              last_seen_at: r.last_seen_at as string,
            };
            const existing = next.get(userId);
            // Realtime event that arrived first must win
            if (
              !existing ||
              new Date(incoming.last_seen_at) >= new Date(existing.last_seen_at)
            ) {
              next.set(userId, incoming);
            }
          }
          return next;
        });
      });

    // Fetch member profiles for enriched rows display
    supabase
      .from("workspace_members")
      .select("user_id, full_name, email, avatar_url")
      .eq("workspace_id", workspaceId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMemberProfiles(() => {
          const m = new Map<string, { full_name: string | null; email: string; avatar_url: string | null }>();
          for (const r of data) {
            m.set(r.user_id as string, {
              full_name: r.full_name as string | null,
              email: r.email as string,
              avatar_url: r.avatar_url as string | null,
            });
          }
          return m;
        });
      });

    // Tick so derivePresence re-evaluates staleness every 15s
    const tick = setInterval(() => setNow(Date.now()), RE_DERIVE_MS);

    return () => {
      cancelled = true;
      clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [active, workspaceId]);

  const getRow = useCallback(
    (userId: string): PresenceRow | undefined => rows.get(userId),
    [rows]
  );

  const getPresence = useCallback(
    (userId: string): PresenceStatus => {
      const row = rows.get(userId);
      return derivePresence(row?.status, row?.last_seen_at, now);
    },
    [rows, now]
  );

  // Build enriched rows array, sorted online→away→offline
  const enrichedRows: PresenceRowEnriched[] = Array.from(rows.entries()).map(([userId, row]) => {
    const profile = memberProfiles.get(userId);
    return {
      user_id: userId,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? userId,
      avatar_url: profile?.avatar_url ?? null,
      status: row.status,
      last_seen_at: row.last_seen_at,
    };
  }).sort((a, b) => {
    const score = (r: PresenceRowEnriched) => {
      const diff = now - new Date(r.last_seen_at).getTime();
      if (diff < 90_000) return 0; // online
      if (diff < 300_000) return 1; // away
      return 2; // offline
    };
    return score(a) - score(b);
  });

  return { getPresence, getRow, now, rows: enrichedRows };
}
