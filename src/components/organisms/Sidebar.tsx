"use client"

import * as React from "react"
import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/lib/store/useUIStore"
import { useWorkspace } from "@/context/WorkspaceContext"
import { useNotifications } from "@/context/NotificationsContext"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
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
  Workflow,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Target,
  UsersRound,
  Ticket,
  Radio,
  User,
  CreditCard,
  LogOut,
  ChevronUp,
} from "lucide-react"

const navGroups = [
  {
    label: "Core",
    roles: ["owner", "admin", "manager", "agent"],
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
    roles: ["owner", "admin", "manager"],
    items: [
      { name: "Workflows",    href: "/dashboard/workflows",     icon: Workflow },
      { name: "Campaigns",    href: "/dashboard/campaigns",     icon: Megaphone },
      { name: "Broadcasts",   href: "/dashboard/broadcasts",    icon: Radio },
      { name: "Lead Capture", href: "/dashboard/lead-capture",  icon: Target },
    ],
  },
  {
    label: "Intelligence",
    roles: ["owner", "admin", "manager"],
    items: [
      { name: "AI Chatbot",   href: "/dashboard/chatbot",       icon: Bot },
      { name: "Voice Agent",  href: "/dashboard/voice-agent",   icon: Mic },
      { name: "Knowledge",    href: "/dashboard/knowledge",     icon: Brain },
      { name: "Analytics",    href: "/dashboard/analytics",     icon: BarChart3 },
    ],
  },
  {
    label: "Workspace",
    roles: ["owner", "admin", "manager"],
    items: [
      { name: "Team",         href: "/dashboard/team",          icon: UsersRound },
      { name: "Settings",     href: "/dashboard/settings",      icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { isSidebarOpen, toggleSidebar } = useUIStore()
  const { workspace, profile, member, credits } = useWorkspace()
  const { unreadCount } = useNotifications()

  const [userOpen, setUserOpen] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const creditPct = credits.monthly_grant > 0
    ? Math.min(100, Math.round((credits.balance / credits.monthly_grant) * 100))
    : 0

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User"
  const initials = displayName
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
        animate={{ width: isSidebarOpen ? 240 : 64 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar-background overflow-hidden border-r border-sidebar-border"
      >
        {/* Logo / workspace */}
        <div className={cn(
          "flex items-center h-16 border-b border-sidebar-border flex-shrink-0 px-4 justify-between",
          !isSidebarOpen && "px-0 justify-center"
        )}>
          {!isSidebarOpen ? (
            <button
              onClick={toggleSidebar}
              title="Expand sidebar"
              className="w-16 h-16 flex items-center justify-center relative group transition-transform active:scale-95"
            >
              <img src="/image/flowra.png" alt="Logo" className="w-14 h-auto object-contain group-hover:opacity-0 transition-opacity dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
              <ChevronRight className="absolute inset-0 m-auto h-5 w-5 text-sidebar-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center justify-center flex-shrink-0">
                {workspace.logo_url ? (
                  <img src={workspace.logo_url} alt={workspace.name} className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <img src="/image/flowra.png" alt="Logo" className="h-10 w-auto object-contain dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
                )}
              </div>
              {workspace.logo_url && (
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-sidebar-foreground truncate leading-tight tracking-tight">{workspace.name}</p>
                </div>
              )}
              <button
                onClick={toggleSidebar}
                className="p-1 rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors flex-shrink-0"
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 no-scrollbar">
          {navGroups.filter(g => g.roles.includes(member.role)).map((group, i) => (
            <div key={group.label} className={cn("mb-5", !isSidebarOpen && "mb-3")}>
              {isSidebarOpen && (
                <div className="px-5 mb-1.5">
                  <span className="text-[11px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">
                    {group.label}
                  </span>
                </div>
              )}
              {!isSidebarOpen && i > 0 && <div className="h-px mx-4 bg-sidebar-border my-2" />}

              <nav className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href))
                  const showBadge =
                    item.href === "/dashboard/inbox" && unreadCount > 0

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      title={!isSidebarOpen ? item.name : undefined}
                      className={cn(
                        "flex items-center transition-colors relative group",
                        isSidebarOpen ? "px-5 py-1.5 gap-3" : "px-0 py-2.5 justify-center mx-2 rounded-lg",
                        isActive
                          ? isSidebarOpen 
                            ? "bg-sidebar-accent/60 text-sidebar-foreground" 
                            : "bg-sidebar-accent text-sidebar-foreground"
                          : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                      )}
                    >
                      {isActive && isSidebarOpen && (
                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-sidebar-primary" />
                      )}

                      <div className="relative flex-shrink-0">
                        <item.icon className={cn(
                          "h-[16px] w-[16px] transition-colors",
                          isActive
                            ? "text-sidebar-foreground"
                            : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"
                        )} strokeWidth={isActive ? 2.5 : 2} />
                        {showBadge && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-[8px] font-bold flex items-center justify-center">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </div>

                      {isSidebarOpen && (
                        <span className={cn(
                          "text-[13px] truncate",
                          isActive ? "font-semibold" : "font-medium text-sidebar-foreground/70"
                        )}>
                          {item.name}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Flat AI Credits */}
        {isSidebarOpen && (
          <div className="px-5 mb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-sidebar-foreground/50" />
                <span className="text-[11px] font-medium text-sidebar-foreground/50">Credits</span>
              </div>
              <span className="text-[11px] font-medium text-sidebar-foreground/80">
                {credits.balance.toLocaleString()}
              </span>
            </div>
            <div className="h-1 bg-sidebar-border rounded-full overflow-hidden mb-1">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  creditPct > 30 ? "bg-sidebar-primary" : "bg-destructive"
                )}
                style={{ width: `${creditPct}%` }}
              />
            </div>
            <Link
              href="/dashboard/settings?tab=billing"
              className="text-[10px] font-medium text-sidebar-primary hover:underline"
            >
              Top up →
            </Link>
          </div>
        )}

        {/* User profile popover trigger */}
        <div className={cn(
          "border-t border-sidebar-border flex-shrink-0 relative",
          isSidebarOpen ? "p-3" : "flex justify-center p-2"
        )}>
          <button
            onClick={() => setUserOpen(!userOpen)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg hover:bg-sidebar-accent transition-colors w-full text-left",
              isSidebarOpen ? "p-2" : "p-1.5"
            )}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-sidebar-primary-foreground flex-shrink-0 overflow-hidden bg-sidebar-primary">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                initials || "U"
              )}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-sidebar-foreground leading-tight truncate">
                  {displayName}
                </p>
                <p className="text-[11px] text-sidebar-foreground/50 leading-tight capitalize truncate">
                  {profile.email}
                </p>
              </div>
            )}
            {isSidebarOpen && (
              <ChevronUp className={cn("w-3.5 h-3.5 text-sidebar-foreground/40 transition-transform flex-shrink-0", userOpen && "rotate-180")} />
            )}
          </button>

          {/* User Popover */}
          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                className={cn(
                  "absolute bottom-full mb-2 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden",
                  isSidebarOpen ? "left-3 right-3" : "left-2 w-48"
                )}
              >
                <div className="p-1">
                  <div className="px-2 py-2 mb-1 border-b border-border">
                    <p className="font-semibold text-[12px] text-foreground truncate">{displayName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{workspace.name}</p>
                  </div>
                  {[
                    { icon: User, label: "Profile", action: () => router.push("/dashboard/settings?tab=profile") },
                    { icon: CreditCard, label: "Billing", action: () => router.push("/dashboard/settings?tab=billing") },
                    { icon: Settings, label: "Settings", action: () => router.push("/dashboard/settings") },
                  ].map(m => (
                    <button
                      key={m.label}
                      onClick={() => { setUserOpen(false); m.action() }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium hover:bg-muted text-foreground transition-colors text-left"
                    >
                      <m.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      {m.label}
                    </button>
                  ))}
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => { setUserOpen(false); handleSignOut() }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium text-destructive hover:bg-destructive/10 transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5 text-destructive/70" />
                    Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  )
}

