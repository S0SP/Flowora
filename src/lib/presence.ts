"use client";

// ─────────────────────────────────────────────────────────────
// Presence constants and derive logic
// Ported from WaCRM and adapted for Flowra's workspace model
// ─────────────────────────────────────────────────────────────

/** How often the heartbeat sends a keep-alive. */
export const HEARTBEAT_MS = 30_000; // 30 seconds

/** No mouse/keyboard for this long → report "away" instead of "online". */
export const IDLE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

/** Rows older than this are treated as "offline" (tab is closed). */
export const OFFLINE_AFTER_MS = HEARTBEAT_MS * 3; // 90 seconds

export type StoredPresence = "online" | "away" | "offline";
export type PresenceStatus = "online" | "away" | "offline";

export interface PresenceRow {
  status: PresenceStatus;
  last_seen_at: string; // ISO timestamp
}

/**
 * Derive the human-visible status from a DB row and the current clock.
 *
 * Rules:
 *  - If the row is missing → offline (never connected or was purged)
 *  - If last_seen_at is older than OFFLINE_AFTER_MS → offline (tab closed)
 *  - Otherwise use the stored status (online or away)
 */
export function derivePresence(
  status: StoredPresence | undefined,
  lastSeenAt: string | undefined,
  now: number = Date.now()
): PresenceStatus {
  if (!status || !lastSeenAt) return "offline";
  const age = now - new Date(lastSeenAt).getTime();
  if (age > OFFLINE_AFTER_MS) return "offline";
  return status;
}

/**
 * Human-readable label for a presence status.
 */
export function presenceLabel(
  status: PresenceStatus,
  row?: PresenceRow,
  now: number = Date.now()
): string {
  if (status === "online") return "Online";
  if (status === "away") return "Away";
  if (!row?.last_seen_at) return "Offline";

  const mins = Math.floor((now - new Date(row.last_seen_at).getTime()) / 60_000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
