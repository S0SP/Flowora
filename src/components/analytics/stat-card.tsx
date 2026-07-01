import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "success" | "info" | "danger" | "warning";
  trend?: number;
  trendLabel?: string;
  className?: string;
}

const variants = {
  default: {
    icon: "bg-muted text-muted-foreground",
    border: "",
  },
  success: {
    icon: "bg-emerald-500/10 text-emerald-500",
    border: "border-emerald-500/20",
  },
  info: {
    icon: "bg-[hsl(209,93%,90%)] text-blue-500",
    border: "border-blue-500/20",
  },
  danger: {
    icon: "bg-destructive/10 text-destructive",
    border: "border-destructive/20",
  },
  warning: {
    icon: "bg-primary/10 text-primary",
    border: "border-primary/20",
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
  trend,
  trendLabel,
  className,
}: StatCardProps) {
  const v = variants[variant];

  const TrendIcon = trend === undefined ? Minus : trend > 0 ? TrendingUp : TrendingDown;
  const trendColor =
    trend === undefined
      ? "text-muted-foreground"
      : trend > 0
      ? "text-emerald-500"
      : "text-red-500";

  return (
    <div
      className={cn(
        "relative bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 overflow-hidden group hover:border-border/80 transition-all duration-200",
        v.border && `hover:${v.border}`,
        className
      )}
    >
      {/* Subtle top glow on hover */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", v.icon)}>
          <Icon className="w-4 h-4" />
        </div>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 text-[11px] font-semibold", trendColor)}>
            <TrendIcon className="w-3 h-3" />
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>

      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {trendLabel && (
          <p className="text-[10px] text-muted-foreground/50 mt-1">{trendLabel}</p>
        )}
      </div>
    </div>
  );
}
