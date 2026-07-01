import { cn } from "@/lib/utils";

type PageSize = "full" | "wide" | "medium" | "narrow";

const sizeClasses: Record<PageSize, string> = {
  full:   "max-w-[1400px]",
  wide:   "max-w-7xl",
  medium: "max-w-5xl",
  narrow: "max-w-3xl",
};

interface PageShellProps {
  size?: PageSize;
  className?: string;
  children: React.ReactNode;
}

/**
 * Consistent page container with max-width and spacing.
 * Wraps every page's content for uniform layout.
 */
export function PageShell({ size = "full", className, children }: PageShellProps) {
  return (
    <div className={cn("space-y-6 animate-fade-in mx-auto", sizeClasses[size], className)}>
      {children}
    </div>
  );
}
