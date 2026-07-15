"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/lib/store/useUIStore"
import { useWorkspace } from "@/context/WorkspaceContext"
import { useNotifications } from "@/context/NotificationsContext"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  Inbox,
  Users,
  KanbanSquare,
  Megaphone,
  Bot,
  Mic,
  Settings,
  Brain,
  BarChart3,
  Code2,
  Workflow,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Target,
  UserPlus,
  Ticket,
} from "lucide-react"

const navGroups = [
  {
    label: "Core",
    items: [
      { name: "Dashboard",    href: "/dashboard",               icon: LayoutDashboard },
      { name: "Shared Inbox", href: "/dashboard/inbox",         icon: Inbox },
      { name: "Tickets",      href: "/dashboard/tickets",       icon: Ticket },
      { name: "Contacts",     href: "/dashboard/contacts",      icon: Users },
      { name: "Leads CRM",    href: "/dashboard/leads",         icon: KanbanSquare },
    ],
  },
  {
    label: "Automation",
    items: [
      { name: "Workflows",    href: "/dashboard/workflows",     icon: Workflow },
      { name: "Campaigns",    href: "/dashboard/campaigns",     icon: Megaphone },
      { name: "Broadcasts",   href: "/dashboard/broadcasts",    icon: Megaphone },
      { name: "Lead Capture", href: "/dashboard/lead-capture",  icon: Target },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { name: "AI Chatbot",   href: "/dashboard/chatbot",       icon: Bot,    accent: "lavender" },
      { name: "Voice Agent",  href: "/dashboard/voice-agent",   icon: Mic,    accent: "lavender" },
      { name: "Knowledge",    href: "/dashboard/knowledge",     icon: Brain,  accent: "lavender" },
      { name: "Analytics",    href: "/dashboard/analytics",     icon: BarChart3 },
    ],
  },
  {
    label: "Workspace",
    items: [
      { name: "Team",         href: "/dashboard/team",          icon: UserPlus },
      { name: "Integrations", href: "/dashboard/integrations",  icon: Code2 },
      { name: "Settings",     href: "/dashboard/settings",      icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isSidebarOpen, toggleSidebar } = useUIStore()
  const { workspace, profile, member, credits } = useWorkspace()
  const { unreadCount } = useNotifications()

  const creditPct = credits.monthly_grant > 0
    ? Math.min(100, Math.round((credits.balance / credits.monthly_grant) * 100))
    : 0

  const initials = (profile.full_name ?? profile.email)
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase())
    .join("")

  return (
    <>
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 240 : 72 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="fixed left-0 top-0 z-40 flex h-screen flex-col bg-[#1B1B1B] overflow-hidden border-r border-white/[0.06]"
      >
        {/* Logo / workspace */}
        <div className={cn(
          "flex items-center h-14 border-b border-white/[0.06] flex-shrink-0 px-4 justify-between",
          !isSidebarOpen && "px-0 justify-center"
        )}>
          {!isSidebarOpen ? (
            <button
              onClick={toggleSidebar}
              title="Expand sidebar"
              className="w-8 h-8 rounded-lg bg-[#FFE27C] flex items-center justify-center relative group transition-transform active:scale-95"
            >
              <svg viewBox="0 0 32 32" className="w-4 h-4 text-[#1B1B1B] group-hover:opacity-0 transition-opacity" fill="currentColor">
                <path d="M16 2L6 8v12l10 6 10-6V8L16 2zm0 3.2L23.5 10l-7.5 4.5L8.5 10 16 5.2zM8 11.5l7 4.2v8.5L8 20V11.5zm9 12.7v-8.5l7-4.2V20l-7 4.2z"/>
              </svg>
              <ChevronRight className="absolute inset-0 m-auto h-4 w-4 text-[#1B1B1B] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#FFE27C] flex items-center justify-center flex-shrink-0">
                {workspace.logo_url ? (
                  <img src={workspace.logo_url} alt={workspace.name} className="w-full h-full rounded-lg object-cover" />
                ) : (
                  <svg viewBox="0 0 32 32" className="w-4 h-4" fill="#1B1B1B">
                    <path d="M16 2L6 8v12l10 6 10-6V8L16 2zm0 3.2L23.5 10l-7.5 4.5L8.5 10 16 5.2zM8 11.5l7 4.2v8.5L8 20V11.5zm9 12.7v-8.5l7-4.2V20l-7 4.2z"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white truncate leading-tight">{workspace.name}</p>
                <p className="text-[10px] text-white/40 leading-tight capitalize">{member.role}</p>
              </div>
              <button
                onClick={toggleSidebar}
                className="p-1 rounded-lg text-white/30 hover:bg-white/8 hover:text-white/80 transition-colors flex-shrink-0"
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 no-scrollbar">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-1">
              {isSidebarOpen && (
                <div className="px-4 mb-1 mt-3">
                  <span className="text-[10px] font-semibold text-white/25 uppercase tracking-widest">
                    {group.label}
                  </span>
                </div>
              )}
              {!isSidebarOpen && <div className="h-px mx-4 bg-white/[0.06] my-2" />}

              <nav className="px-2 flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href))
                  const isLavender = item.accent === "lavender"
                  const showBadge =
                    item.href === "/dashboard/inbox" && unreadCount > 0

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      title={!isSidebarOpen ? item.name : undefined}
                      className={cn(
                        "flex items-center rounded-xl transition-all duration-150 group relative",
                        isSidebarOpen ? "px-3 py-2 gap-3" : "px-0 py-2.5 justify-center",
                        isActive
                          ? isLavender
                            ? "bg-[#C4B1F9]/15 text-[#C4B1F9]"
                            : "bg-[#FFE27C]/15 text-[#FFE27C]"
                          : "text-white/50 hover:text-white/90 hover:bg-white/5"
                      )}
                    >
                      {isActive && (
                        <div className={cn(
                          "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full",
                          isLavender ? "bg-[#C4B1F9]" : "bg-[#FFE27C]"
                        )} />
                      )}

                      <div className="relative flex-shrink-0">
                        <item.icon className={cn(
                          "h-[18px] w-[18px] transition-colors",
                          isActive
                            ? isLavender ? "text-[#C4B1F9]" : "text-[#FFE27C]"
                            : "text-white/40 group-hover:text-white/70"
                        )} />
                        {showBadge && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FFE27C] text-[#1B1B1B] text-[9px] font-black flex items-center justify-center">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </div>

                      {isSidebarOpen && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={cn(
                            "text-[13px] font-medium truncate",
                            isActive
                              ? isLavender ? "text-[#C4B1F9]" : "text-[#FFE27C]"
                              : "text-white/60 group-hover:text-white/90"
                          )}
                        >
                          {item.name}
                        </motion.span>
                      )}
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Credits bar */}
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-3 mb-2 bg-white/[0.04] border border-white/[0.06] rounded-xl p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FFE27C]" />
                <span className="text-[11px] font-semibold text-white/70">AI Credits</span>
              </div>
              <span className="text-[11px] font-bold text-white">
                {credits.balance.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  creditPct > 30
                    ? "bg-gradient-to-r from-[#FFE27C] to-[#C4B1F9]"
                    : "bg-red-400"
                )}
                style={{ width: `${creditPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-white/30">
                {credits.monthly_grant.toLocaleString()} / mo
              </span>
              <Link
                href="/dashboard/settings?tab=billing"
                className="text-[10px] font-semibold text-[#FFE27C] hover:underline"
              >
                Top up →
              </Link>
            </div>
          </motion.div>
        )}

        {/* User footer */}
        <div className={cn(
          "border-t border-white/[0.06] flex-shrink-0",
          isSidebarOpen ? "px-3 py-2.5" : "flex justify-center py-3"
        )}>
          <Link
            href="/dashboard/settings/profile"
            className={cn(
              "flex items-center gap-2.5 rounded-xl hover:bg-white/5 transition-colors",
              isSidebarOpen ? "px-1 py-1.5 w-full" : "p-0.5"
            )}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-[#1B1B1B] flex-shrink-0 overflow-hidden"
              style={{ background: profile.avatar_url ? undefined : "#FFE27C" }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name ?? ""} className="w-full h-full object-cover" />
              ) : (
                initials || "U"
              )}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white/80 leading-tight truncate">
                  {profile.full_name ?? profile.email}
                </p>
                <p className="text-[10px] text-white/30 leading-tight capitalize">{member.role}</p>
              </div>
            )}
          </Link>
        </div>
      </motion.aside>
    </>
  )
}
