"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  HEARTBEAT_MS,
  IDLE_AFTER_MS,
  type StoredPresence,
} from "@/lib/presence";
import { useWorkspace } from "@/context/WorkspaceContext";

/**
 * PresenceHeartbeat — headless, renders nothing.
 * Mount ONCE per signed-in dashboard tab (in DashboardShell).
 *
 * Reports this tab's presence to `member_presence` via the
 * `touch_presence` RPC roughly every HEARTBEAT_MS (30s).
 *
 * Statuses:
 *   - 'away'   when the tab is hidden or no input for IDLE_AFTER_MS
 *   - 'online' otherwise
 *
 * When the tab closes, beats stop and viewers derive 'offline'
 * from staleness — no unreliable unload write needed.
 */
export function PresenceHeartbeat() {
  const { profile } = useWorkspace();
  const lastActivityRef = useRef<number>(0);

  useEffect(() => {
    if (!profile?.id) return;

    const supabase = createClient();
    let cancelled = false;
    let lastBeatAt = 0;
    lastActivityRef.current = Date.now();

    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    const currentStatus = (): StoredPresence => {
      if (typeof document !== "undefined" && document.hidden) return "away";
      if (Date.now() - lastActivityRef.current > IDLE_AFTER_MS) return "away";
      return "online";
    };

    const beat = async () => {
      if (cancelled) return;
      // Coalesce bursts (visibilitychange + focus fire together)
      const t = Date.now();
      if (t - lastBeatAt < 1_000) return;
      lastBeatAt = t;

      const { error } = await supabase.rpc("touch_presence", {
        p_status: currentStatus(),
      });

      if (error && !cancelled) {
        console.error("[PresenceHeartbeat] touch_presence failed:", error.message);
      }
    };

    // Activity listeners (passive — never blocks scroll/input)
    const activityEvents: (keyof DocumentEventMap)[] = [
      "mousemove",
      "keydown",
      "pointerdown",
      "scroll",
    ];
    activityEvents.forEach((e) =>
      document.addEventListener(e, markActive, { passive: true })
    );

    // Returning to tab should beat immediately to flip back to online fast
    const onReturn = () => {
      if (!document.hidden) markActive();
      void beat();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);

    void beat();
    const interval = setInterval(() => void beat(), HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      activityEvents.forEach((e) =>
        document.removeEventListener(e, markActive)
      );
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [profile?.id]);

  return null;
}
