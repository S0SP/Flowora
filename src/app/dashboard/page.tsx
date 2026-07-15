"use client"

import { useEffect, useState } from "react"
import { Users, Megaphone, Bot, MessageCircle, Phone, TrendingUp, Zap, ArrowUpRight, RefreshCw } from "lucide-react"
import { XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { usePresence } from "@/hooks/use-presence"
import { PresenceDot } from "@/components/presence/PresenceDot"

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

function StatCard({ icon: Icon, label, value, sub, color, iconColor, href }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string; iconColor?: string; href?: string
}) {
  const card = (
    <div className={cn(
      "bg-white border border-border rounded-2xl p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow",
      href && "cursor-pointer"
    )}>
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", color ?? "bg-primary/10")}>
        <Icon className={cn("h-5 w-5", iconColor ?? "text-primary")} strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-muted-foreground font-medium">{label}</p>
        <p className="text-[26px] font-bold text-foreground leading-tight mt-0.5">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-[12px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  if (href) return <Link href={href}>{card}</Link>
  return card
}

function SkeletonCard() {
  return <div className="bg-white border border-border rounded-2xl p-5 h-[108px] animate-pulse" />
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState("Hello")
  const { rows, now } = usePresence()

  // Derive per-member status from last_seen_at
  const onlineRows = rows.filter(r => {
    const diff = now - new Date(r.last_seen_at).getTime()
    return diff < 90_000
  })
  const awayRows = rows.filter(r => {
    const diff = now - new Date(r.last_seen_at).getTime()
    return diff >= 90_000 && diff < 300_000
  })


  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening")
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
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

  return (
    <div className="flex flex-col gap-6 p-6 bg-[#FAFAF8] min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{greeting}! 👋</h1>
          <p className="text-[14px] text-muted-foreground mt-0.5">
            Here's what's happening across your workspace today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <Link
            href="/dashboard/campaigns"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-[14px] hover:bg-primary/90 shadow-sm"
          >
            <Zap className="h-4 w-4" /> New Campaign
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [1, 2, 3, 4].map(i => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              icon={Users} label="Total Contacts" color="bg-blue-50 border border-blue-100" iconColor="text-blue-600"
              value={analytics?.contacts.total ?? 0}
              sub={`+${analytics?.contacts.new_today ?? 0} today`}
              href="/dashboard/contacts"
            />
            <StatCard
              icon={MessageCircle} label="Open Conversations" color="bg-green-50 border border-green-100" iconColor="text-green-600"
              value={analytics?.inbox.open_threads ?? 0}
              sub={`${analytics?.inbox.ai_resolved_today ?? 0} AI resolved today`}
              href="/dashboard/inbox"
            />
            <StatCard
              icon={Megaphone} label="Active Campaigns" color="bg-amber-50 border border-amber-100" iconColor="text-amber-600"
              value={analytics?.campaigns.active ?? 0}
              sub={`${analytics?.campaigns.total ?? 0} total campaigns`}
              href="/dashboard/campaigns"
            />
            <StatCard
              icon={Phone} label="Voice Calls (Month)" color="bg-purple-50 border border-purple-100" iconColor="text-purple-600"
              value={analytics?.voice.completed_calls ?? 0}
              sub={`${analytics?.voice.total_minutes ?? 0} mins · ₹${analytics?.voice.total_cost_inr ?? 0}`}
              href="/dashboard/voice-agent/calls"
            />
          </>
        )}
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [1, 2, 3, 4].map(i => <div key={i} className="bg-white border border-border rounded-xl p-4 h-20 animate-pulse" />)
        ) : (
          <>
            {[
              { label: "Messages This Week", value: analytics?.messages.total_week ?? 0, icon: TrendingUp, color: "text-blue-600" },
              { label: "Delivery Rate", value: `${analytics?.messages.delivery_rate ?? 0}%`, icon: ArrowUpRight, color: "text-green-600" },
              { label: "Bot Replies Today", value: analytics?.messages.bot_today ?? 0, icon: Bot, color: "text-purple-600" },
              { label: "Knowledge Chunks", value: analytics?.knowledge.total_chunks ?? 0, icon: Zap, color: "text-amber-600" },
            ].map((s, i) => (
              <div key={i} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <s.icon className={cn("h-5 w-5 shrink-0", s.color)} />
                <div>
                  <p className="text-[12px] text-muted-foreground">{s.label}</p>
                  <p className="text-[18px] font-bold text-foreground">
                    {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Chart + Team Presence + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Message trend chart */}
        <div className="lg:col-span-2 bg-white border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">Messages Last 7 Days</h3>
              <p className="text-[12px] text-muted-foreground">Total outbound + inbound activity</p>
            </div>
          </div>
          {loading ? (
            <div className="h-[180px] bg-muted rounded-xl animate-pulse" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0EC" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                <RechartsTooltip
                  contentStyle={{ background: "white", border: "1px solid #E8E8E4", borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="messages" stroke="#FFE27C" fill="rgba(255,226,124,0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-[13px]">
              No message data yet
            </div>
          )}
        </div>

        {/* Team Presence Panel */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-foreground">Team Online</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[12px] text-muted-foreground">{onlineRows.length} online</span>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">No presence data yet</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1 -mx-1 px-1">
              {rows.map(r => {
                const diff = now - new Date(r.last_seen_at).getTime()
                const status = diff < 90_000 ? "online" as const : diff < 300_000 ? "away" as const : "offline" as const
                const initials = (r.full_name || r.email || "?").charAt(0).toUpperCase()
                const hue = (r.user_id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360

                return (
                  <div key={r.user_id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="relative shrink-0">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} className="w-8 h-8 rounded-full object-cover" alt={r.full_name || r.email} />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                          style={{ background: `hsl(${hue}, 55%, 55%)` }}
                        >
                          {initials}
                        </div>
                      )}
                      <PresenceDot status={status} className="absolute -bottom-0.5 -right-0.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{r.full_name || r.email || "Unknown"}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{status}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                      status === "online" ? "bg-green-100 text-green-700"
                        : status === "away" ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-500"
                    )}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="pt-3 mt-2 border-t border-border">
            <Link
              href="/dashboard/settings"
              onClick={(e) => { (e.currentTarget as any).__nav_item = "Members" }}
              className="text-[12px] text-primary font-medium hover:underline"
            >
              Manage Team →
            </Link>
          </div>
        </div>
      </div>

        {/* Quick links - moved to its own row below charts */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
          <h3 className="text-[15px] font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { href: "/dashboard/workflows/builder", icon: Zap, label: "Create Workflow", color: "bg-amber-50 text-amber-700" },
              { href: "/dashboard/broadcasts", icon: Megaphone, label: "New Broadcast", color: "bg-blue-50 text-blue-700" },
              { href: "/dashboard/contacts", icon: Users, label: "Import Contacts", color: "bg-green-50 text-green-700" },
              { href: "/dashboard/voice-agent", icon: Phone, label: "Start Voice Call", color: "bg-purple-50 text-purple-700" },
              { href: "/dashboard/knowledge", icon: Bot, label: "Update Knowledge Base", color: "bg-indigo-50 text-indigo-700" },
              { href: "/dashboard/chatbot", icon: MessageCircle, label: "Configure AI Chatbot", color: "bg-pink-50 text-pink-700" },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted transition-colors group text-center">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", a.color)}>
                  <a.icon className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors leading-tight">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

      {/* Status row */}
      {analytics && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[12px] text-muted-foreground mb-1">Read Rate (7d)</p>
            <p className="text-[20px] font-bold text-foreground">{analytics.messages.read_rate}%</p>
            <div className="mt-2 w-full bg-muted h-1.5 rounded-full">
              <div className="bg-primary h-full rounded-full" style={{ width: `${analytics.messages.read_rate}%` }} />
            </div>
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[12px] text-muted-foreground mb-1">Agent Replies Today</p>
            <p className="text-[20px] font-bold text-foreground">{analytics.messages.agent_today}</p>
            <p className="text-[11px] text-muted-foreground mt-1">human agents</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[12px] text-muted-foreground mb-1">AI Auto-Replies Today</p>
            <p className="text-[20px] font-bold text-primary">{analytics.messages.bot_today}</p>
            <p className="text-[11px] text-muted-foreground mt-1">WhatsApp chatbot</p>
          </div>
        </div>
      )}
    </div>
  )
}
