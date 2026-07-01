import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent page header across all pages.
 * Replaces the 4+ heading variants (h1/h2, different sizes, different layouts).
 */
export function PageHeader({ icon: Icon, title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-primary shrink-0" />}
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
