"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare, LayoutDashboard, Inbox, Users, Megaphone,
  BarChart3, Settings, ChevronLeft, Zap, Bot, Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { User } from "@supabase/supabase-js";
import { useState } from "react";

const navSections = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/dashboard/contacts", label: "Contacts", icon: Users },
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/dashboard/lead-capture", label: "Lead Capture", icon: Zap },
      { href: "/dashboard/chatbot", label: "AI Chatbot", icon: Bot },
      { href: "/dashboard/voice-agent", label: "Voice Agent", icon: Phone },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  user: User;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const initials = user.email?.[0]?.toUpperCase() ?? "U";

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-sidebar-border transition-all duration-300 ease-in-out relative",
        "bg-sidebar",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border shrink-0 h-14",
        collapsed ? "justify-center px-0" : "justify-between px-4"
      )}>
        <div className={cn("flex items-center gap-2.5 overflow-hidden min-w-0", collapsed && "justify-center")}>
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
            <MessageSquare className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">Flowora</span>
              <span className="block text-[9px] text-sidebar-foreground/40 uppercase tracking-widest leading-none mt-0.5">Platform</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/30 hover:text-sidebar-foreground transition-all shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute -right-3 top-[18px] z-10 w-6 h-6 rounded-full bg-sidebar border border-sidebar-border flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground transition-all shadow-sm"
        >
          <ChevronLeft className="w-3 h-3 rotate-180" />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="text-[9px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 px-3 mb-1.5">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150 group",
                      collapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2.5",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    {active && !collapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                    )}
                    <item.icon className={cn("shrink-0", collapsed ? "w-4.5 h-4.5" : "w-4 h-4")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className={cn(
        "border-t border-sidebar-border shrink-0",
        collapsed ? "p-2" : "p-3"
      )}>
        <div className={cn(
          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-sidebar-accent cursor-default group",
          collapsed && "justify-center px-2"
        )}>
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
            <span className="text-[11px] font-bold text-primary">{initials}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                {user.email?.split("@")[0]}
              </p>
              <p className="text-[10px] text-sidebar-foreground/40 truncate">{user.email}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
