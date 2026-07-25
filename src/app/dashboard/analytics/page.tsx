"use client"

import React, { useState, useEffect } from "react"
import { Calendar, Download, Clock, MessageCircle, Bot, User, Star, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts"

const tabs = ["Overview", "Campaigns", "Voice Calls", "AI Performance", "Revenue", "Funnel"]

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("Overview")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  
  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch("/api/analytics")
        if (!res.ok) throw new Error("Failed to load analytics")
        const json = await res.json()
        setData(json)
      } catch (err: any) {
        setError(err.message || "Failed to load data")
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
        <h2 className="text-[18px] font-bold text-gray-900">Failed to load analytics</h2>
        <p className="text-[14px] text-gray-500">{error}</p>
      </div>
    )
  }

  const kpis: Array<{ label: string; value: any; subtext?: string; icon: any; iconColor?: string; bg?: string; color?: string; change?: string }> = [
    { label: "Total Conversations", value: data.messages.total_week + data.inbox.total_threads, icon: MessageCircle, color: "text-[#22C55E]" },
    { label: "Resolved by AI", value: data.inbox.ai_resolved_today, subtext: "Today", icon: Bot, iconColor: "text-[#C4B1F9]", bg: "bg-[#F5F3FF]" },
    { label: "Total Contacts", value: data.contacts.total, subtext: `+${data.contacts.new_today} today`, icon: User },
    { label: "Active Campaigns", value: data.campaigns.active, subtext: `${data.campaigns.total} total`, icon: Star },
    { label: "Voice Calls", value: data.voice.total_calls_month, subtext: "This month", color: "text-[#22C55E]", icon: Clock }
  ]

  const areaData = data.messages.daily_trend.map((d: any) => ({
    name: d.name,
    total: d.total,
    ai: d.ai,
    human: d.human
  }))

  const donutData = [
    { name: "WhatsApp", value: 90, color: "#22C55E" },
    { name: "Email", value: 10, color: "#3B82F6" },
  ]

  const campaigns = data.campaigns.list || []
  
  const aiMetrics = [
    { label: "Messages Delivered", value: `${data.messages.delivery_rate}%`, bar: data.messages.delivery_rate, color: "bg-[#22C55E]" },
    { label: "Messages Read", value: `${data.messages.read_rate}%`, bar: data.messages.read_rate, color: "bg-[#3B82F6]" },
    { label: "AI Resolved Today", value: `${data.inbox.ai_resolved_today}`, bar: data.inbox.ai_resolved_today > 0 ? 100 : 0, color: "bg-[#C4B1F9]" },
  ]

  return (
    <div className="flex flex-col h-full bg-white">
      
      {/* Header */}
      <div className="bg-white px-8 pt-8 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics & Reports</h1>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5 bg-white text-[13px] font-medium text-gray-900 hover:bg-gray-100 transition-colors">
                <Calendar className="h-4 w-4 text-gray-500" />
                Last 7 Days
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 border border-border rounded-lg px-4 py-2 bg-white text-[13px] font-medium text-gray-900 hover:bg-gray-100 transition-colors">
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="flex items-center gap-2 border border-border rounded-lg px-4 py-2 bg-white text-[13px] font-medium text-gray-900 hover:bg-gray-100 transition-colors">
              <Clock className="h-4 w-4" /> Schedule Report
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-3 text-[14px] font-medium transition-colors relative",
                activeTab === tab ? "text-gray-900 font-bold" : "text-gray-500 hover:text-gray-900"
              )}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* KPI Strip */}
          <div className="grid grid-cols-5 gap-4">
            {kpis.map((kpi, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-border p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", kpi.bg || "bg-gray-100")}>
                    <kpi.icon className={cn("h-4 w-4", kpi.iconColor || "text-gray-900")} />
                  </div>
                  <span className="text-[13px] font-medium text-gray-500 truncate">{kpi.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">{kpi.value.toLocaleString()}</span>
                  {kpi.change && <span className={cn("text-[12px] font-medium", kpi.color)}>{kpi.change}</span>}
                  {kpi.subtext && <span className="text-[12px] text-gray-500">{kpi.subtext}</span>}
                </div>
              </div>
            ))}
          </div>

          {activeTab === "Overview" ? (
            <>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-6">
            
            {/* Area Chart */}
            <div className="col-span-2 bg-white rounded-xl border border-border p-6 shadow-sm">
              <h2 className="text-[16px] font-bold text-gray-900 mb-6">Conversations Over Time</h2>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={areaData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#B1D8FC" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#B1D8FC" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C4B1F9" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#C4B1F9" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorHuman" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFE27C" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#FFE27C" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E8E4" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9B9B9B" }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9B9B9B" }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: "8px", border: "1px solid #E8E8E4", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                      itemStyle={{ fontSize: 13, fontWeight: 500 }}
                    />
                    <Area type="monotone" dataKey="total" name="Total" stroke="#3B82F6" fillOpacity={1} fill="url(#colorTotal)" />
                    <Area type="monotone" dataKey="ai" name="AI Resolved" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorAi)" />
                    <Area type="monotone" dataKey="human" name="Human" stroke="#F59E0B" fillOpacity={1} fill="url(#colorHuman)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" /><span className="text-[12px] text-gray-500">Total</span></div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" /><span className="text-[12px] text-gray-500">AI Resolved</span></div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" /><span className="text-[12px] text-gray-500">Human</span></div>
              </div>
            </div>

            {/* Donut Chart */}
            <div className="col-span-1 bg-white rounded-xl border border-border p-6 shadow-sm flex flex-col">
              <h2 className="text-[16px] font-bold text-gray-900 mb-2">Channel Distribution</h2>
              <div className="flex-1 flex flex-col items-center justify-center relative">
                <div className="h-[180px] w-[180px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        innerRadius={65}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-[12px] text-gray-500 font-medium">Total</span>
                    <span className="text-[18px] font-bold text-gray-900">{data.messages.total_week + data.inbox.total_threads}</span>
                  </div>
                </div>
                
                <div className="w-full mt-4 space-y-2">
                  {donutData.map(item => (
                    <div key={item.name} className="flex items-center justify-between text-[13px]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-gray-500">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-900">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-3 gap-6">
            
            {/* Campaign Performance Table */}
            <div className="col-span-2 bg-white rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[16px] font-bold text-gray-900">Recent Campaigns</h2>
                <button className="text-[13px] font-medium text-gray-900 border border-border px-3 py-1.5 rounded hover:bg-gray-100 transition-colors">
                  Download CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                {campaigns.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-[13px]">
                    No campaigns found
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-3 text-[12px] font-medium text-gray-500">Campaign</th>
                        <th className="pb-3 text-[12px] font-medium text-gray-500">Type</th>
                        <th className="pb-3 text-[12px] font-medium text-gray-500">Sent</th>
                        <th className="pb-3 text-[12px] font-medium text-gray-500">Open Rate</th>
                        <th className="pb-3 text-[12px] font-medium text-gray-500">Conversion</th>
                        <th className="pb-3 text-[12px] font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((camp: any, i: number) => (
                        <tr key={i} className="border-b border-[#F4F4F2] last:border-0">
                          <td className="py-3 text-[13px] font-medium text-gray-900">{camp.name}</td>
                          <td className="py-3">
                            <div className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#22C55E]/10 text-[#22C55E]">
                              {camp.type}
                            </div>
                          </td>
                          <td className="py-3 text-[13px] text-gray-500">{camp.sent}</td>
                          <td className="py-3 text-[13px] text-gray-500">{camp.open}</td>
                          <td className="py-3 text-[13px] text-gray-500">{camp.conv}</td>
                          <td className="py-3">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">{camp.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* AI Performance */}
            <div className="col-span-1 bg-white rounded-xl border border-border p-6 shadow-sm">
              <h2 className="text-[16px] font-bold text-gray-900 mb-6">Messaging Performance</h2>
              
              <div className="space-y-5">
                {aiMetrics.map((metric, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[13px] mb-2">
                      <span className="text-gray-500">{metric.label}</span>
                      <span className="font-bold text-gray-900">{metric.value}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className={cn("h-full", metric.color)} style={{ width: `${metric.bar}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
          </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[400px] bg-white rounded-xl border border-border text-center p-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-gray-500" />
              </div>
              <h2 className="text-[20px] font-bold text-gray-900 mb-2">{activeTab}</h2>
              <p className="text-[14px] text-gray-500 max-w-[400px]">
                The {activeTab} section is currently under development. Analytics for this module will be available shortly.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
