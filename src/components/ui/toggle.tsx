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
 * Matches the 'AI Chatbot' inbox toggle styling perfectly for light/dark mode.
 */
export function Toggle({ checked, onChange, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none shadow-inner",
        disabled && "opacity-50 cursor-not-allowed",
        checked ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
    </button>
  );
}
