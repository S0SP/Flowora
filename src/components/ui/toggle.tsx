"use client";

import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Consistent toggle switch used across all pages.
 * Replaces the 8+ hand-coded toggle implementations.
 */
export function Toggle({ checked, onChange, disabled, size = "md", className }: ToggleProps) {
  const dims = size === "sm" ? { track: "w-8 h-4", thumb: "w-3 h-3 after:top-[2px] after:left-[2px]", move: "peer-checked:after:translate-x-full" } : { track: "w-9 h-5", thumb: "w-4 h-4 after:top-[2px] after:left-[2px]", move: "peer-checked:after:translate-x-full" };

  return (
    <label className={cn("relative inline-flex items-center cursor-pointer", disabled && "opacity-50 cursor-not-allowed", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className={cn(
        dims.track,
        "bg-muted rounded-full transition-colors peer-focus:outline-none peer-checked:bg-primary",
        dims.move,
        "after:content-[''] after:absolute after:bg-white after:rounded-full after:transition-all",
        dims.thumb,
        "after:h-[calc(100%-4px)] after:w-[calc(100%-4px)]"
      )} />
    </label>
  );
}
