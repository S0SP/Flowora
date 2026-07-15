"use client"

import React, { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, Bell, ChevronDown, Settings, LogOut, User, CreditCard, Sparkles, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/Avatar"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useNotifications } from "@/context/NotificationsContext"

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
  "/dashboard/integrations": "Integrations",
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

  // Build breadcrumbs
  const parts = pathname.split("/").filter(Boolean)
  const crumbs = parts.map((part, i) => ({
    label: PAGE_LABELS["/" + parts.slice(0, i + 1).join("/")] ?? part.charAt(0).toUpperCase() + part.slice(1),
    href: "/" + parts.slice(0, i + 1).join("/"),
    isLast: i === parts.length - 1,
  }))

  return (
    <header className="sticky top-0 z-30 flex h-12 w-full items-center justify-between border-b border-[#E8E8E4] bg-white/90 backdrop-blur-md px-5 flex-shrink-0">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, i) => (
          <React.Fragment key={crumb.href}>
            {i > 0 && <span className="text-[#D4D4D0]">/</span>}
            {crumb.isLast ? (
              <span className="font-semibold text-[#1B1B1B]">{crumb.label}</span>
            ) : (
              <button
                onClick={() => router.push(crumb.href)}
                className="text-[#9B9B9B] hover:text-[#1B1B1B] transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9B9B9B]" />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchOpen(false) }}
                placeholder="Search anything..."
                className="w-full pl-9 pr-8 py-1.5 bg-[#F4F4F2] border border-[#E8E8E4] rounded-xl text-[13px] focus:outline-none focus:border-[#FFE27C] transition-all"
              />
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery("") }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9B9B9B] hover:text-[#1B1B1B]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="search-closed"
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-xl text-[#9B9B9B] hover:bg-[#F4F4F2] hover:text-[#1B1B1B] transition-colors"
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
              userOpen ? "bg-[#F4F4F2]" : "hover:bg-[#F4F4F2]"
            )}
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026024d" />
              <AvatarFallback className="text-[11px] bg-[#FFE27C] text-[#1B1B1B] font-bold">A</AvatarFallback>
            </Avatar>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-[13px] font-semibold text-[#1B1B1B] leading-tight">Admin</span>
              <span className="text-[10px] text-[#9B9B9B] leading-tight">Owner</span>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-[#9B9B9B] transition-transform", userOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#E8E8E4] rounded-2xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-[#F4F4F2]">
                  <p className="font-bold text-[13px] text-[#1B1B1B]">Admin User</p>
                  <p className="text-[11px] text-[#9B9B9B]">admin@acmecorp.com</p>
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
                        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium hover:bg-[#FAFAF8] transition-colors",
                        m.accent ? "text-[#C4B1F9]" : "text-[#1B1B1B]"
                      )}
                    >
                      <m.icon className={cn("w-3.5 h-3.5", m.accent ? "text-[#C4B1F9]" : "text-[#6B6B6B]")} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#F4F4F2] p-1.5">
                  <button
                    onClick={() => { setUserOpen(false); handleSignOut() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
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
