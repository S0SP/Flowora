"use client";

import { usePathname, useRouter } from "next/navigation";
import { Moon, Sun, LogOut, Bell, ChevronRight } from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";

const pageConfig: Record<string, { title: string; description: string }> = {
  "/dashboard": { title: "Overview", description: "Campaign performance at a glance" },
  "/dashboard/inbox": { title: "Inbox", description: "Incoming messages from all channels" },
  "/dashboard/campaigns": { title: "Campaigns", description: "Create and manage broadcast campaigns" },
  "/dashboard/contacts": { title: "Contacts", description: "Your customer address book" },
  "/dashboard/analytics": { title: "Analytics", description: "Delivery, read and engagement metrics" },
  "/dashboard/lead-capture": { title: "Lead Capture", description: "Auto-trigger messages when new leads arrive" },
  "/dashboard/chatbot": { title: "AI Chatbot", description: "Configure your WhatsApp AI assistant" },
  "/dashboard/voice-agent": { title: "Voice Agent", description: "AI-powered outbound calling" },
  "/dashboard/voice-agent/calls": { title: "Call History", description: "Past calls and recordings" },
  "/dashboard/voice-agent/voices": { title: "Voice Library", description: "Browse and preview all voices" },
  "/dashboard/settings": { title: "Settings", description: "API keys and platform configuration" },
};

interface TopbarProps {
  user: User;
}

export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const supabase = createClient();

  const page = pageConfig[pathname] ?? { title: "Dashboard", description: "" };

  // Build breadcrumb segments
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = pageConfig[href]?.title ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
    return { href, label, isLast: i === segments.length - 1 };
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-border bg-background/80 backdrop-blur-md shrink-0">
      {/* Left: breadcrumb + title */}
      <div className="flex flex-col justify-center min-w-0">
        {breadcrumbs.length > 1 && (
          <div className="flex items-center gap-1 mb-0.5">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                <span className={`text-[10px] font-medium ${crumb.isLast ? "text-foreground/70" : "text-muted-foreground/50 hover:text-muted-foreground cursor-pointer"}`}>
                  {crumb.label}
                </span>
              </span>
            ))}
          </div>
        )}
        <h1 className="text-sm font-semibold text-foreground leading-tight truncate">{page.title}</h1>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all relative"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full ring-1 ring-background" />
        </button>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all text-xs font-medium"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Sign out</span>
        </button>
      </div>
    </header>
  );
}
