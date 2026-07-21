"use client"

import { useEffect, useState } from "react"
import { Users, Megaphone, Bot, MessageCircle, Phone, TrendingUp, Zap, ArrowUpRight, RefreshCw, FileText } from "lucide-react"
import { XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { usePresence } from "@/hooks/use-presence"
import { PresenceDot } from "@/components/presence/PresenceDot"
import { useWorkspace } from "@/context/WorkspaceContext"
import { formatCurrency } from "@/lib/currency"

type Analytics = {
  contacts: { total: number; new_today: number }
  campaigns: { total: number; active: number }
  messages: {
    total_week: number; delivered_week: number; read_week: number
    delivery_rate: number; read_rate: number
    bot_today: number; agent_today: number
    daily_trend: Array<{ date: string; count: number }>
  }
  inbox: { open_threads: number; total_threads: number; ai_resolved_today: number }
  voice: { total_calls_month: number; completed_calls: number; total_minutes: number; total_cost_inr: number }
  knowledge: { total_chunks: number }
}

function SkeletonMetric() {
  return <div className="bg-card p-5 h-[100px] animate-pulse" />
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const { rows, now } = usePresence()
  const { workspace, member } = useWorkspace()

  // Derive per-member status from last_seen_at and explicit status
  const onlineRows = rows.filter(r => {
    if (r.status === "offline") return false;
    const diff = now - new Date(r.last_seen_at).getTime()
    return diff < 90_000
  })

  useEffect(() => {
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
    setLoading(true)
    try {
      const res = await fetch("/api/analytics")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAnalytics(data)
    } catch {
      // Keep skeleton if fetch fails
    } finally {
      setLoading(false)
    }
  }

  const trend = analytics?.messages.daily_trend ?? []
  const chartData = trend.map(d => ({
    date: new Date(d.date).toLocaleDateString("en", { weekday: "short" }),
    messages: d.count,
  }))

  const role = member?.role || "agent"
  const isManagerOrAbove = ["owner", "admin", "manager"].includes(role)
  const isAdminOrAbove = ["owner", "admin"].includes(role)

  const quickActions = [
    { href: "/dashboard/workflows/builder", icon: Zap, label: "Create Workflow", allowed: isManagerOrAbove },
    { href: "/dashboard/broadcasts", icon: Megaphone, label: "New Broadcast", allowed: isManagerOrAbove },
    { href: "/dashboard/contacts", icon: Users, label: "Import Contacts", allowed: isManagerOrAbove },
    { href: "/dashboard/voice-agent", icon: Phone, label: "Start Voice Call", allowed: isAdminOrAbove },
    { href: "/dashboard/knowledge", icon: FileText, label: "Update Knowledge", allowed: isManagerOrAbove },
    { href: "/dashboard/chatbot", icon: Bot, label: "Configure Chatbot", allowed: isAdminOrAbove },
  ].filter(a => a.allowed)

  const metrics = [
    { 
      label: "Total Contacts", value: analytics?.contacts.total ?? 0, 
      sub: analytics?.contacts.new_today ? `+${analytics.contacts.new_today} today` : undefined, icon: Users 
    },
    { 
      label: "Open Conversations", value: analytics?.inbox.open_threads ?? 0, 
      sub: analytics?.inbox.ai_resolved_today ? `${analytics.inbox.ai_resolved_today} AI resolved today` : undefined, icon: MessageCircle 
    },
    { 
      label: "Active Campaigns", value: analytics?.campaigns.active ?? 0, 
      sub: analytics?.campaigns.total ? `${analytics.campaigns.total} total` : undefined, icon: Megaphone 
    },
    { 
      label: "Voice Calls (Mo)", value: analytics?.voice.completed_calls ?? 0, 
      sub: analytics?.voice.total_minutes ? `${analytics.voice.total_minutes} mins · ${formatCurrency(analytics.voice.total_cost_inr, workspace.default_currency)}` : undefined, icon: Phone 
    },
    { label: "Messages (7d)", value: analytics?.messages.total_week ?? 0, icon: TrendingUp },
    { label: "Delivery Rate", value: `${analytics?.messages.delivery_rate ?? 0}%`, icon: ArrowUpRight },
    { label: "Bot Replies Today", value: analytics?.messages.bot_today ?? 0, icon: Bot },
    { label: "Knowledge Chunks", value: analytics?.knowledge.total_chunks ?? 0, icon: FileText },
  ]

  return (
    <div className="flex flex-col p-4 md:p-6 bg-background min-h-full gap-6">
      
      {/* Command Bar (Quick Actions) & Refresh */}
      <div className="flex items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mb-1">
          {quickActions.map(a => (
            <Link key={a.label} href={a.href} className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border hover:border-primary/50 hover:bg-muted/50 rounded-full text-[12px] font-semibold text-foreground transition-all whitespace-nowrap">
              <a.icon className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2.5} />
              {a.label}
            </Link>
          ))}
        </div>
        <button
          onClick={fetchAnalytics}
          className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-transparent hover:bg-muted rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* High-Density Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border rounded-xl overflow-hidden">
        {loading ? (
          [...Array(8)].map((_, i) => <SkeletonMetric key={i} />)
        ) : (
          metrics.map(m => (
            <div key={m.label} className="bg-card p-4 flex flex-col gap-1 relative overflow-hidden group hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{m.label}</span>
                <m.icon className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground leading-none tracking-tight">
                  {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
                </span>
              </div>
              {m.sub && <span className="text-[11px] font-medium text-muted-foreground mt-0.5">{m.sub}</span>}
            </div>
          ))
        )}
      </div>

      {/* Chart + Team Presence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message trend chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[13px] font-bold text-foreground tracking-tight">Message Volume</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total outbound + inbound activity (last 7 days)</p>
            </div>
          </div>
          {loading ? (
            <div className="h-[200px] bg-muted/50 rounded-lg animate-pulse" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--foreground))", opacity: 0.7 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--foreground))", opacity: 0.7 }} axisLine={false} tickLine={false} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                  itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="messages" stroke="#10B981" fillOpacity={1} fill="url(#colorMessages)" strokeWidth={2.5} activeDot={{ r: 4, strokeWidth: 0, fill: "#10B981" }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-[12px] border border-dashed border-border rounded-lg">
              No message data available
            </div>
          )}
        </div>

        {/* Team Presence Panel */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold text-foreground tracking-tight">Team Presence</h3>
            <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-bold text-green-700 dark:text-green-400">{onlineRows.length} online</span>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center border border-dashed border-border rounded-lg">
              <div>
                <Users className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-[11px] text-muted-foreground">No team members</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-0.5 -mx-2 px-2 no-scrollbar">
              {rows.map(r => {
                const diff = now - new Date(r.last_seen_at).getTime()
                const isStale = diff > 90_000;
                const status = r.status === "offline" || isStale 
                  ? "offline" 
                  : r.status === "away" || diff > 300_000 
                    ? "away" 
                    : "online";
                const initials = (r.full_name || r.email || "?").charAt(0).toUpperCase()
                const hue = (r.user_id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360

                return (
                  <div key={r.user_id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="relative shrink-0">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} className="w-7 h-7 rounded-full object-cover" alt={r.full_name || r.email} />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                          style={{ background: `hsl(${hue}, 55%, 55%)` }}
                        >
                          {initials}
                        </div>
                      )}
                      <PresenceDot status={status} className="absolute -bottom-0.5 -right-0.5 w-2 h-2 border-2 border-card" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{r.full_name || r.email || "Unknown"}</p>
                      <p className="text-[10px] text-muted-foreground capitalize leading-tight mt-0.5">{status}</p>
                    </div>
                    <Link href="/dashboard/inbox" className="text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors">
                      Message
                    </Link>
                  </div>
                )
              })}
            </div>
          )}

          <div className="pt-3 mt-3 border-t border-border">
            <Link
              href="/dashboard/settings"
              onClick={(e) => { (e.currentTarget as any).__nav_item = "Members" }}
              className="text-[11px] text-primary font-semibold hover:underline flex items-center justify-center w-full"
            >
              Manage Workspace Team
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
