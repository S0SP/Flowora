"use client"

import React, { useState } from "react"
import { Calendar, Download, Clock, MessageCircle, Bot, User, Star, Mail } from "lucide-react"
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

const mockDataRange1 = {
  area: [
    { name: "Jan 7", total: 1200, ai: 600, human: 600 },
    { name: "Jan 8", total: 1800, ai: 1000, human: 800 },
    { name: "Jan 9", total: 2200, ai: 1300, human: 900 },
    { name: "Jan 10", total: 1900, ai: 1100, human: 800 },
    { name: "Jan 11", total: 2400, ai: 1500, human: 900 },
    { name: "Jan 12", total: 2100, ai: 1200, human: 900 },
    { name: "Jan 13", total: 2500, ai: 1400, human: 1100 },
    { name: "Jan 14", total: 2354, ai: 1282, human: 1072 },
  ],
  kpis: [
    { label: "Total Conversations", value: "23,548", change: "+16.3%", color: "text-[#22C55E]", icon: MessageCircle },
    { label: "Resolved by AI", value: "12,820", subtext: "54.4%", icon: Bot, iconColor: "text-[#C4B1F9]", bg: "bg-[#F5F3FF]" },
    { label: "Human Handled", value: "10,720", subtext: "45.6%", icon: User },
    { label: "Avg. Response Time", value: "38s", change: "-12.5%", color: "text-[#22C55E]", icon: Clock },
    { label: "Customer Satisfaction", value: "4.7 / 5.0", change: "+0.3", color: "text-[#22C55E]", icon: Star }
  ],
  donut: [
    { name: "WhatsApp", value: 68, color: "#22C55E" },
    { name: "Email", value: 18, color: "#3B82F6" },
    { name: "Voice", value: 9, color: "#C4B1F9" },
    { name: "Web", value: 5, color: "#FFE27C" },
  ]
}

const mockDataRange2 = {
  area: [
    { name: "Jan 1", total: 800, ai: 300, human: 500 },
    { name: "Jan 2", total: 950, ai: 400, human: 550 },
    { name: "Jan 3", total: 1100, ai: 500, human: 600 },
    { name: "Jan 4", total: 1050, ai: 480, human: 570 },
    { name: "Jan 5", total: 1200, ai: 600, human: 600 },
    { name: "Jan 6", total: 1150, ai: 580, human: 570 },
    { name: "Jan 7", total: 1200, ai: 600, human: 600 },
  ],
  kpis: [
    { label: "Total Conversations", value: "18,240", change: "+5.1%", color: "text-[#22C55E]", icon: MessageCircle },
    { label: "Resolved by AI", value: "8,100", subtext: "44.4%", icon: Bot, iconColor: "text-[#C4B1F9]", bg: "bg-[#F5F3FF]" },
    { label: "Human Handled", value: "10,140", subtext: "55.6%", icon: User },
    { label: "Avg. Response Time", value: "42s", change: "-2.5%", color: "text-[#22C55E]", icon: Clock },
    { label: "Customer Satisfaction", value: "4.4 / 5.0", change: "+0.1", color: "text-[#22C55E]", icon: Star }
  ],
  donut: [
    { name: "WhatsApp", value: 55, color: "#22C55E" },
    { name: "Email", value: 25, color: "#3B82F6" },
    { name: "Voice", value: 15, color: "#C4B1F9" },
    { name: "Web", value: 5, color: "#FFE27C" },
  ]
}


const campaigns = [
  { name: "Webinar Jan 20", type: "WhatsApp", typeBg: "bg-[#22C55E]/10", typeColor: "text-[#22C55E]", sent: "4,200", open: "68%", conv: "12%", status: "Active", statusBg: "bg-[#22C55E]/10", statusColor: "text-[#22C55E]" },
  { name: "Q1 Newsletter", type: "Email", typeBg: "bg-[#3B82F6]/10", typeColor: "text-[#3B82F6]", sent: "12,500", open: "24%", conv: "3%", status: "Completed", statusBg: "bg-gray-100", statusColor: "text-gray-500" },
  { name: "Voice Outreach", type: "Voice", typeBg: "bg-[#C4B1F9]/10", typeColor: "text-[#C4B1F9]", sent: "850", open: "42%", conv: "8%", status: "Active", statusBg: "bg-[#22C55E]/10", statusColor: "text-[#22C55E]" },
  { name: "Abandoned Cart", type: "WhatsApp", typeBg: "bg-[#22C55E]/10", typeColor: "text-[#22C55E]", sent: "1,120", open: "82%", conv: "24%", status: "Paused", statusBg: "bg-[#F59E0B]/10", statusColor: "text-[#F59E0B]" }
]

const aiMetrics = [
  { label: "Intent Recognition", value: "94.2%", bar: 94, color: "bg-[#22C55E]" },
  { label: "Sentiment Analysis Accuracy", value: "88.5%", bar: 88, color: "bg-[#3B82F6]" },
  { label: "Goal Completion Rate", value: "76.4%", bar: 76, color: "bg-[#C4B1F9]" },
  { label: "Fallback to Human", value: "12.8%", bar: 12, color: "bg-[#F59E0B]" }
]

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("Overview")
  const [dateRange, setDateRange] = useState<"current" | "previous">("current")
  
  const currentData = dateRange === "current" ? mockDataRange1 : mockDataRange2

  return (
    <div className="flex flex-col h-full  bg-white">
      
      {/* Header */}
      <div className="bg-white px-8 pt-8 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics & Reports</h1>
            <div className="flex items-center gap-3">
              <button onClick={() => setDateRange(r => r === "current" ? "previous" : "current")} className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5 bg-white text-[13px] font-medium text-gray-900 hover:bg-gray-100 transition-colors">
                <Calendar className="h-4 w-4 text-gray-500" />
                {dateRange === "current" ? "Jan 7 – Jan 14, 2026" : "Jan 1 – Jan 7, 2026"}
              </button>
              <span className="text-[12px] text-gray-500">vs {dateRange === "current" ? "Jan 1–7" : "Dec 25-31"}</span>
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
            {currentData.kpis.map((kpi, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-border p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", kpi.bg || "bg-gray-100")}>
                    <kpi.icon className={cn("h-4 w-4", kpi.iconColor || "text-gray-900")} />
                  </div>
                  <span className="text-[13px] font-medium text-gray-500 truncate">{kpi.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">{kpi.value}</span>
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
                  <AreaChart data={currentData.area} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
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
                        data={currentData.donut}
                        innerRadius={65}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {currentData.donut.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-[12px] text-gray-500 font-medium">Total</span>
                    <span className="text-[18px] font-bold text-gray-900">23k</span>
                  </div>
                </div>
                
                <div className="w-full mt-4 space-y-2">
                  {currentData.donut.map(item => (
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
                <h2 className="text-[16px] font-bold text-gray-900">Campaign Performance</h2>
                <button className="text-[13px] font-medium text-gray-900 border border-border px-3 py-1.5 rounded hover:bg-gray-100 transition-colors">
                  Download CSV
                </button>
              </div>

              <div className="overflow-x-auto">
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
                    {campaigns.map((camp, i) => (
                      <tr key={i} className="border-b border-[#F4F4F2] last:border-0">
                        <td className="py-3 text-[13px] font-medium text-gray-900">{camp.name}</td>
                        <td className="py-3">
                          <div className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium", camp.typeBg, camp.typeColor)}>
                            {camp.type}
                          </div>
                        </td>
                        <td className="py-3 text-[13px] text-gray-500">{camp.sent}</td>
                        <td className="py-3 text-[13px] text-gray-500">{camp.open}</td>
                        <td className="py-3 text-[13px] text-gray-500">{camp.conv}</td>
                        <td className="py-3">
                          <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded", camp.statusBg, camp.statusColor)}>{camp.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Performance */}
            <div className="col-span-1 bg-white rounded-xl border border-border p-6 shadow-sm">
              <h2 className="text-[16px] font-bold text-gray-900 mb-6">AI Performance</h2>
              
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
