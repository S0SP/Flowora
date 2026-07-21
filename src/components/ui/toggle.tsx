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
  const dims = size === "sm" 
    ? { track: "w-8 h-4", thumb: "w-3 h-3 left-[2px] top-[2px]", move: "peer-checked:translate-x-[16px]" } 
    : { track: "w-10 h-5.5", thumb: "w-4 h-4 left-[3px] top-[3px]", move: "peer-checked:translate-x-[18px]" };

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
        "bg-gray-200 dark:bg-gray-700 rounded-full peer peer-focus:outline-none peer-checked:bg-[#00E676] transition-colors"
      )} />
      <div className={cn(
        "absolute bg-white rounded-full transition-transform",
        dims.thumb,
        dims.move
      )} />
    </label>
  );
}
