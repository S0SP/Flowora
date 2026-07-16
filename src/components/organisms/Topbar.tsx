"use client"

import React, { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, Bell, ChevronDown, Settings, LogOut, User, CreditCard, Sparkles, X, Moon, Sun } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/Avatar"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useNotifications } from "@/context/NotificationsContext"
import { useWorkspace } from "@/context/WorkspaceContext"
import { useUIStore } from "@/lib/store/useUIStore"

function formatNotifTime(dateStr: string) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return ""
  }
}

const getColorForType = (type: string) => {
  switch (type?.toLowerCase()) {
    case "lead": return "#FFE27C"
    case "workflow": return "#C4B1F9"
    case "credit": return "#EF4444"
    case "message": return "#B1D8FC"
    default: return "#7c3aed"
  }
}

// ─── Route → breadcrumb label mapping ────────────────────────────────────
const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/inbox": "Shared Inbox",
  "/dashboard/contacts": "Contacts",
  "/dashboard/leads": "Leads CRM",
  "/dashboard/workflows": "Workflows",
  "/dashboard/workflows/builder": "Workflow Builder",
  "/dashboard/campaigns": "Campaigns",
  "/dashboard/lead-capture": "Lead Capture",
  "/dashboard/chatbot": "AI Chatbot",
  "/dashboard/voice-agent": "Voice Agent",
  "/dashboard/knowledge": "Knowledge Hub",
  "/dashboard/analytics": "Analytics",
  "/dashboard/team": "Team & Agents",
  "/dashboard/settings": "Settings",
}

const MOCK_NOTIFICATIONS = [
  {
    id: "n1",
    type: "lead",
    title: "New hot lead assigned",
    body: "Ravi Mehta from Mumbai scored 89 — assigned to you",
    time: "2m ago",
    read: false,
    color: "#FFE27C",
  },
  {
    id: "n2",
    type: "workflow",
    title: "Workflow completed",
    body: "Webinar Lead Funnel ran 48 times today with 94% success",
    time: "18m ago",
    read: false,
    color: "#C4B1F9",
  },
  {
    id: "n3",
    type: "credit",
    title: "Credits running low",
    body: "You have 820 AI credits remaining. Top up to avoid disruption.",
    time: "1h ago",
    read: false,
    color: "#EF4444",
  },
  {
    id: "n4",
    type: "message",
    title: "Human takeover requested",
    body: "Sneha Patel (Inbox) is asking to speak with a human agent",
    time: "3h ago",
    read: true,
    color: "#B1D8FC",
  },
]

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications()
  const { profile, member } = useWorkspace()
  const { isDark, toggleDark } = useUIStore()

  const [notifOpen, setNotifOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const currentPage = PAGE_LABELS[pathname] ?? "Dashboard"

  const handleMarkAllRead = async () => {
    await markAllRead()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User"
  const initials = displayName.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("")

  // Build breadcrumbs
  const parts = pathname.split("/").filter(Boolean)
  const crumbs = parts.map((part, i) => ({
    label: PAGE_LABELS["/" + parts.slice(0, i + 1).join("/")] ?? part.charAt(0).toUpperCase() + part.slice(1),
    href: "/" + parts.slice(0, i + 1).join("/"),
    isLast: i === parts.length - 1,
  }))

  return (
    <header className="sticky top-0 z-30 flex h-12 w-full items-center justify-between border-b border-border bg-background/90 backdrop-blur-md px-5 flex-shrink-0">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, i) => (
          <React.Fragment key={crumb.href}>
            {i > 0 && <span className="text-muted-foreground/40">/</span>}
            {crumb.isLast ? (
              <span className="font-semibold text-foreground">{crumb.label}</span>
            ) : (
              <button
                onClick={() => router.push(crumb.href)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className="relative flex items-center justify-between w-[52px] h-[28px] bg-muted/60 dark:bg-zinc-800/80 border border-border/80 rounded-full p-1 cursor-pointer transition-all hover:bg-muted/80 focus:outline-none shrink-0"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {/* Animated Thumb */}
          <motion.div
            className="absolute top-[3px] left-[3px] w-[20px] h-[20px] bg-white dark:bg-zinc-950 border border-border/10 rounded-full shadow-md z-10"
            animate={{ x: isDark ? 24 : 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
          />
          
          {/* Sun Icon */}
          <Sun className={cn(
            "w-3.5 h-3.5 ml-1 transition-all duration-200 z-0",
            isDark ? "text-muted-foreground opacity-50 scale-75" : "text-amber-500 opacity-100 scale-100"
          )} />
          
          {/* Moon Icon */}
          <Moon className={cn(
            "w-3.5 h-3.5 mr-1 transition-all duration-200 z-0",
            isDark ? "text-purple-400 opacity-100 scale-100" : "text-muted-foreground opacity-50 scale-75"
          )} />
        </button>

        {/* Search */}
        <AnimatePresence mode="wait">
          {searchOpen ? (
            <motion.div
              key="search-open"
              initial={{ width: 32, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 32, opacity: 0 }}
              className="relative"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchOpen(false) }}
                placeholder="Search anything..."
                className="w-full pl-9 pr-8 py-1.5 bg-muted border border-border rounded-xl text-[13px] text-foreground focus:outline-none focus:border-primary transition-all"
              />
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery("") }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="search-closed"
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Search className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false) }}
            className={cn(
              "relative p-2 rounded-xl transition-colors",
              notifOpen ? "bg-[#F4F4F2] text-[#1B1B1B]" : "text-[#9B9B9B] hover:bg-[#F4F4F2] hover:text-[#1B1B1B]"
            )}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-[#FFE27C] text-[#1B1B1B] text-[9px] font-black flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E8E8E4] rounded-2xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#F4F4F2]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[14px] text-[#1B1B1B]">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 bg-[#FFE27C] text-[#1B1B1B] text-[10px] font-black rounded-full">{unreadCount}</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-[11px] font-semibold text-[#C4B1F9] hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map(n => {
                    const isRead = !!n.read_at;
                    const color = getColorForType(n.type);
                    return (
                      <button
                        key={n.id}
                        onClick={() => { if (!isRead) markAsRead(n.id) }}
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-3 hover:bg-[#FAFAF8] transition-colors text-left border-b border-[#F4F4F2] last:border-0",
                          !isRead && "bg-[#FAFAF8]"
                        )}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: color + "20" }}>
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn("text-[13px] font-semibold leading-tight truncate", isRead ? "text-[#6B6B6B]" : "text-[#1B1B1B]")}>{n.title}</p>
                            <span className="text-[10px] text-[#9B9B9B] flex-shrink-0">{formatNotifTime(n.created_at)}</span>
                          </div>
                          <p className="text-[11px] text-[#9B9B9B] mt-0.5 leading-tight line-clamp-2">{n.body}</p>
                        </div>
                        {!isRead && <div className="w-2 h-2 rounded-full bg-[#FFE27C] flex-shrink-0 mt-2" />}
                      </button>
                    );
                  })}
                  {notifications.length === 0 && (
                    <div className="py-8 text-center text-muted-foreground text-[13px]">
                      No notifications
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setUserOpen(!userOpen); setNotifOpen(false) }}
            className={cn(
              "flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl transition-colors",
              userOpen ? "bg-muted" : "hover:bg-muted"
            )}
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground flex-shrink-0 overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover rounded-full" />
              ) : (
                initials || "U"
              )}
            </div>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-[13px] font-semibold text-foreground leading-tight">{displayName}</span>
              <span className="text-[10px] text-muted-foreground leading-tight capitalize">{member?.role || "member"}</span>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", userOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border">
                  <p className="font-bold text-[13px] text-foreground">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground">{profile?.email}</p>
                </div>
                <div className="p-1.5">
                  {[
                    { icon: User, label: "Profile", action: () => router.push("/dashboard/settings?tab=profile") },
                    { icon: CreditCard, label: "Billing & Credits", action: () => router.push("/dashboard/settings?tab=billing") },
                    { icon: Sparkles, label: "Upgrade Plan", action: () => toast.info("Upgrade page coming soon"), accent: true },
                    { icon: Settings, label: "Settings", action: () => router.push("/dashboard/settings") },
                  ].map(m => (
                    <button
                      key={m.label}
                      onClick={() => { setUserOpen(false); m.action() }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium hover:bg-muted transition-colors",
                        m.accent ? "text-[#C4B1F9]" : "text-foreground"
                      )}
                    >
                      <m.icon className={cn("w-3.5 h-3.5", m.accent ? "text-[#C4B1F9]" : "text-muted-foreground")} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="border-t border-border p-1.5">
                  <button
                    onClick={() => { setUserOpen(false); handleSignOut() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-400" />
                    Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
