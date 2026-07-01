import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface PageCardProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Standard card wrapper used across all pages.
 * Consistent border, radius, shadow, and optional header.
 */
export function PageCard({ icon: Icon, title, description, action, noPadding, className, children }: PageCardProps) {
  return (
    <div className={cn("bg-card border border-border rounded-2xl shadow-sm overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <Icon className="w-5 h-5 text-primary shrink-0" />}
            <div className="min-w-0">
              {title && <h3 className="font-semibold text-sm text-foreground">{title}</h3>}
              {description && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && "p-5")}>{children}</div>
    </div>
  );
}
