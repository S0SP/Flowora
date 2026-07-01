import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-primary/15 text-primary border-primary/20",
  success: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  danger:  "bg-destructive/15 text-destructive border-destructive/20",
  info:    "bg-blue-500/15 text-blue-600 border-blue-500/20",
  muted:   "bg-muted text-muted-foreground border-border",
};

interface BadgeProps {
  variant?: BadgeVariant;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}

/**
 * Consistent badge/pill across all pages.
 * Replaces per-page hand-coded status spans.
 */
export function Badge({ variant = "default", icon: Icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        variantStyles[variant],
        className
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </span>
  );
}

/**
 * Status badge specifically for lead/message statuses.
 * Maps common status strings to badge variants.
 */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending:    { label: "Pending",     variant: "warning" },
    processing: { label: "Processing",  variant: "info" },
    sent:       { label: "Sent",        variant: "success" },
    delivered:  { label: "Delivered",   variant: "success" },
    read:       { label: "Read",        variant: "success" },
    completed:  { label: "Completed",   variant: "success" },
    failed:     { label: "Failed",      variant: "danger" },
    scheduled:  { label: "Scheduled",   variant: "info" },
    active:     { label: "Active",      variant: "success" },
    ringing:    { label: "Ringing",     variant: "info" },
    initiated:  { label: "Initiated",   variant: "warning" },
    idle:       { label: "Ready",       variant: "muted" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "muted" };
  return <Badge variant={variant}>{label}</Badge>;
}
