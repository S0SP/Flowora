"use client";

import { cn } from "@/lib/utils";
import type { PresenceStatus } from "@/lib/presence";

const STATUS_CONFIG: Record<
  PresenceStatus,
  { color: string; label: string; ring: string }
> = {
  online: {
    color: "bg-emerald-500",
    label: "Online",
    ring: "ring-2 ring-white",
  },
  away: {
    color: "bg-amber-400",
    label: "Away",
    ring: "ring-2 ring-white",
  },
  offline: {
    color: "bg-gray-300",
    label: "Offline",
    ring: "ring-2 ring-white",
  },
};

interface PresenceDotProps {
  status: PresenceStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function PresenceDot({ status, size = "md", className }: PresenceDotProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      title={cfg.label}
      className={cn(
        "inline-block rounded-full shrink-0",
        cfg.color,
        cfg.ring,
        SIZE_MAP[size],
        className
      )}
    />
  );
}
