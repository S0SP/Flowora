"use client"

import React, { useState } from "react"
import { Search, ExternalLink, RefreshCw, X, Link as LinkIcon, Box } from "lucide-react"
import { cn } from "@/lib/utils"

const connected = [
  {
    name: "Google Sheets",
    desc: "Poll sheets for new leads and trigger workflows automatically",
    status: "Connected",
    account: "acme@gmail.com",
    lastSync: "Last sync: 2 min ago",
    icon: <div className="w-8 h-8 bg-green-100 text-green-700 flex items-center justify-center rounded-lg font-bold text-sm">GS</div>
  },
  {
    name: "HubSpot CRM",
    desc: "Sync contacts, deals, and pipeline data with HubSpot in real time",
    status: "Connected",
    account: "acme-hubspot.com",
    lastSync: "Last sync: 15 min ago",
    icon: <div className="w-8 h-8 bg-orange-100 text-orange-600 flex items-center justify-center rounded-lg font-bold text-sm">HS</div>
  },
  {
    name: "Slack",
    desc: "Receive workflow alerts and new lead notifications in your Slack channel",
    status: "Connected",
    account: "#flowora-alerts channel",
    lastSync: "Active",
    icon: <div className="w-8 h-8 bg-red-100 text-red-600 flex items-center justify-center rounded-lg font-bold text-sm">SL</div>
  },
]

const available = [
  { name: "WooCommerce", desc: "Connect your WooCommerce store for order and customer sync", status: "Not Connected" },
  { name: "Zapier", desc: "Build automated zaps using Flowora triggers and actions", status: "Not Connected" },
  { name: "Pipedrive", desc: "Sync pipeline stages and deal data with Pipedrive CRM", status: "Not Connected" },
  { name: "Zoho CRM", desc: "Two-way sync of leads and contacts with Zoho CRM", status: "Not Connected" },
  { name: "Razorpay", desc: "Trigger WhatsApp payment links and confirmation messages", status: "Not Connected" },
  { name: "Calendly", desc: "Send WhatsApp booking confirmations and reminders via Calendly", status: "Not Connected" },
  { name: "Notion", desc: "Sync lead notes and conversation summaries to Notion pages", status: "Coming Soon" },
  { name: "Make (Integromat)", desc: "Advanced automation scenarios using Make with Flowora modules", status: "Coming Soon" },
]

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState("All")
  const tabs = ["All", "Connected", "CRM", "Sheets & Data", "E-commerce", "Communication", "Payment"]

  return (
    <div className="flex flex-col min-h-full flex-1  bg-background p-8">
      <div className="max-w-[1280px] mx-auto w-full space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Integrations</h1>
          <p className="text-[14px] text-muted-foreground mb-6">Connect Flowora with your favourite tools to automate your workflow</p>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Search integrations..." className="w-[280px] pl-9 pr-3 py-2 border border-border rounded-lg bg-card text-[13px] focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            
            <div className="flex items-center gap-2 bg-muted p-1.5 rounded-full">
              {tabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3.5 py-1.5 text-[13px] rounded-full transition-colors font-medium",
                    activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Connected Integrations */}
        <div>
          <h2 className="text-[14px] font-semibold text-foreground mb-4">Connected</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connected.map((item, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  {item.icon}
                  <div className="flex items-center gap-1.5 bg-green-100 px-2 py-0.5 rounded text-[11px] font-medium text-green-700">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {item.status}
                  </div>
                </div>
                <h3 className="text-[15px] font-semibold text-foreground mb-1">{item.name}</h3>
                <p className="text-[13px] text-muted-foreground h-10 mb-4">{item.desc}</p>
                
                <div className="flex flex-col gap-1 mb-4">
                  <span className="text-[12px] text-muted-foreground">{item.account}</span>
                  <span className="text-[11px] text-muted-foreground">{item.lastSync}</span>
                </div>

                <div className="flex items-center gap-3">
                  <button className="flex-1 py-1.5 border border-border rounded-md text-[13px] font-medium text-foreground hover:bg-muted transition-colors">
                    Configure
                  </button>
                  <button className="px-3 py-1.5 text-[13px] font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors">
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Available Integrations */}
        <div>
          <h2 className="text-[14px] font-semibold text-foreground mb-4">Available Integrations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {available.map((item, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm hover:border-primary transition-colors flex flex-col cursor-pointer group">
                <div className="flex justify-between items-start mb-3">
                  <div className="w-8 h-8 bg-muted text-foreground flex items-center justify-center rounded-lg">
                    <Box className="w-4 h-4" />
                  </div>
                  <span className={cn(
                    "text-[11px] font-medium px-2 py-0.5 rounded",
                    item.status === "Coming Soon" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                  )}>
                    {item.status}
                  </span>
                </div>
                <h3 className="text-[14px] font-semibold text-foreground mb-1">{item.name}</h3>
                <p className="text-[12px] text-muted-foreground flex-1 mb-4">{item.desc}</p>
                
                {item.status === "Coming Soon" ? (
                  <button className="w-full py-1.5 border border-border rounded-md text-[13px] font-medium text-muted-foreground hover:bg-muted transition-colors">
                    Notify Me
                  </button>
                ) : (
                  <button className="w-full py-1.5 bg-primary hover:bg-primary/90 rounded-md text-[13px] font-semibold text-primary-foreground transition-colors group-hover:shadow-[0_2px_8px_rgba(108,71,255,0.4)]">
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Webhooks Section */}
        <div className="pt-4 border-t border-border">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-foreground mb-1">Webhooks</h2>
              <p className="text-[13px] text-muted-foreground">Configure inbound webhooks to trigger Flowora workflows from external tools</p>
            </div>
            <button className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] rounded-lg">
              + Add Webhook
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase">Webhook Name</th>
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase">Endpoint URL</th>
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase">Events</th>
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Typeform Lead Capture", url: "https://api.flowora.io/wh/tf_abc123", events: "form_submitted" },
                  { name: "Shopify Order Created", url: "https://api.flowora.io/wh/sh_xyz789", events: "orders/create, orders/paid" }
                ].map((wh, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3.5 px-5 text-[13px] font-medium text-foreground">{wh.name}</td>
                    <td className="py-3.5 px-5 text-[12px] font-mono text-muted-foreground">{wh.url}</td>
                    <td className="py-3.5 px-5 text-[13px] text-muted-foreground">{wh.events}</td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-3 text-muted-foreground">
                        <button className="hover:text-foreground"><LinkIcon className="h-4 w-4" /></button>
                        <button className="hover:text-foreground text-[13px] font-medium">Edit</button>
                        <button className="hover:text-destructive text-[13px] font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
