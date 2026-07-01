import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Standard form field wrapper: label + hint + error + child input.
 */
export function FormField({ label, error, hint, icon: Icon, required, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {label}
          {required && <span className="text-destructive">*</span>}
        </label>
      </div>
      {children}
      {hint && !error && <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* Styled input — drop-in replacement for all <input> fields */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm",
        "text-foreground placeholder:text-muted-foreground/40",
        "focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

/* Styled textarea */
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm",
        "text-foreground placeholder:text-muted-foreground/40 leading-relaxed",
        "focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all resize-y",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

/* Styled select */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm",
        "text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
