"use client"

import React, { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, Bell, X, Moon, Sun, Plus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useNotifications } from "@/context/NotificationsContext"
import { useUIStore } from "@/lib/store/useUIStore"
import { ThemeToggle } from "@/components/ThemeToggle"

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

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications()

  const [notifOpen, setNotifOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const handleMarkAllRead = async () => {
    await markAllRead()
  }

  // Build breadcrumbs
  const parts = pathname.split("/").filter(Boolean)
  const crumbs = parts.map((part, i) => ({
    label: PAGE_LABELS["/" + parts.slice(0, i + 1).join("/")] ?? part.charAt(0).toUpperCase() + part.slice(1),
    href: "/" + parts.slice(0, i + 1).join("/"),
    isLast: i === parts.length - 1,
  }))

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md px-5 flex-shrink-0">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, i) => (
          <React.Fragment key={crumb.href}>
            {i > 0 && <span className="text-gray-500/40">/</span>}
            {crumb.isLast ? (
              <span className="font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{crumb.label}</span>
            ) : (
               <button
                onClick={() => router.push(crumb.href)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors tracking-tight"
              >
                {crumb.label}
              </button>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Right side actions */}
      <div className="flex items-center gap-2.5">
        {/* Global New Campaign Action */}
        <button
          onClick={() => router.push("/dashboard/campaigns/new")}
          className="hidden sm:flex items-center gap-1.5 bg-transparent border border-border text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all active:scale-95 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Campaign
        </button>

        <div className="w-px h-4 bg-border hidden sm:block mx-1" />

        {/* Dark mode toggle */}
        <ThemeToggle />

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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchOpen(false) }}
                placeholder="Search..."
                className="w-full pl-9 pr-8 py-1.5 bg-gray-100 dark:bg-zinc-800 border border-border rounded-xl text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary transition-all"
              />
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery("") }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="search-closed"
              onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <Search className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className={cn(
              "relative p-1.5 rounded-lg transition-colors",
              notifOpen ? "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-100"
            )}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
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
                className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[13px] text-gray-900 dark:text-gray-100">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">{unreadCount}</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-[11px] font-medium text-primary hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto no-scrollbar">
                  {notifications.map(n => {
                    const isRead = !!n.read_at;
                    return (
                      <button
                        key={n.id}
                        onClick={() => { if (!isRead) markAsRead(n.id) }}
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors text-left border-b border-border last:border-0",
                          !isRead && "bg-gray-100/30"
                        )}
                      >
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className={cn("text-[12px] font-semibold leading-tight truncate", isRead ? "text-gray-500 dark:text-gray-500" : "text-gray-900 dark:text-gray-100")}>{n.title}</p>
                            <span className="text-[10px] text-gray-500 flex-shrink-0">{formatNotifTime(n.created_at)}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{n.body}</p>
                        </div>
                        {!isRead && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                      </button>
                    );
                  })}
                  {notifications.length === 0 && (
                    <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-[12px]">
                      You're all caught up!
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
