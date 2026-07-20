"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus, Search, Loader2, Calendar, Clock, Send, CheckCircle2,
  XCircle, Pause, Play, MoreHorizontal, RefreshCw, Trash2,
  Megaphone, ChevronRight, X, Users, MessageSquare, Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { format } from "date-fns"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "failed" | "cancelled"

type Campaign = {
  id: string
  name: string
  template_name: string
  template_language: string
  status: CampaignStatus
  scheduled_at: string | null
  recipient_count: number
  sent_count: number
  delivered_count: number
  failed_count: number
  created_at: string
  updated_at: string
}

type Template = { name: string; language: string; display_name: string; category: string }

const STATUS_CONFIG: Record<CampaignStatus, { label: string; dot: string; badge: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",      dot: "bg-gray-400",  badge: "bg-gray-100 text-gray-500",    icon: MessageSquare },
  scheduled: { label: "Scheduled",  dot: "bg-blue-400",  badge: "bg-blue-100 text-blue-700",    icon: Calendar      },
  running:   { label: "Running",    dot: "bg-amber-400 animate-pulse", badge: "bg-amber-100 text-amber-700", icon: Play },
  completed: { label: "Completed",  dot: "bg-green-500", badge: "bg-green-100 text-green-700",  icon: CheckCircle2  },
  failed:    { label: "Failed",     dot: "bg-red-500",   badge: "bg-red-100 text-red-700",      icon: XCircle       },
  cancelled: { label: "Cancelled",  dot: "bg-gray-300",  badge: "bg-gray-100 text-gray-500",    icon: Pause         },
}

// ── Create Campaign Modal ────────────────────────────────────────────────────
function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [scheduledAt, setScheduledAt] = useState("")
  const [recipientFilter, setRecipientFilter] = useState("all")

  // Fetch Meta templates
  useEffect(() => {
    fetch("/api/templates")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTemplates(data)
        else setTemplates([])
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false))
  }, [])

  async function handleLaunch() {
    if (!name || !selectedTemplate) { toast.error("Name and template are required"); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/campaigns/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          template_name: selectedTemplate.name,
          template_language: selectedTemplate.language,
          scheduled_at: scheduledAt || null,
          recipients_filter: { filter: recipientFilter },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(scheduledAt ? "Campaign scheduled!" : "Campaign created!")
      onCreated()
      onClose()
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create campaign")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#18181B] border border-border dark:border-[#27272A] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border dark:border-[#27272A] sticky top-0 bg-white dark:bg-[#18181B] z-10">
          <div>
            <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">New Campaign</h2>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"><X className="h-5 w-5 text-gray-500 dark:text-gray-400" /></button>
        </div>

        {/* Step progress */}
        <div className="px-6 pt-4 flex items-center gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn("flex-1 h-1.5 rounded-full transition-colors",
              s <= step ? "bg-primary" : "bg-gray-100 dark:bg-white/10")} />
          ))}
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1: Name */}
          {step === 1 && (
            <>
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">Campaign Name</h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">Give your campaign a descriptive name</p>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Webinar Invite Jan 2026"
                  className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-xl px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">Recipients</h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">Select who receives this campaign</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "all", label: "All Contacts", desc: "Send to entire contact list" },
                    { value: "opted_in", label: "WhatsApp Opted-In", desc: "Only opted-in contacts" },
                    { value: "new_leads", label: "New Leads (7d)", desc: "Added in last 7 days" },
                    { value: "custom", label: "Custom Filter", desc: "Apply custom criteria" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setRecipientFilter(opt.value)}
                      className={cn("text-left p-3 rounded-xl border-2 transition-all",
                        recipientFilter === opt.value ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-border dark:border-[#27272A] hover:border-primary/30 dark:hover:border-primary/50"
                      )}
                    >
                      <p className="text-[13px] font-medium text-gray-900 dark:text-white">{opt.label}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step 2: Template */}
          {step === 2 && (
            <>
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">Select WhatsApp Template</h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">
                  Only approved Meta templates can be used for broadcasts
                </p>
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[13px]">Loading templates from Meta…</span>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-border dark:border-[#27272A] rounded-xl">
                    <MessageSquare className="h-8 w-8 text-gray-500/40 dark:text-gray-400/40 mx-auto mb-2" />
                    <p className="text-[13px] text-gray-500 dark:text-gray-400">No approved templates found</p>
                    <p className="text-[12px] text-gray-500/70 dark:text-gray-400/70 mt-1">
                      Create and get templates approved in Meta Business Manager
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {templates.map(t => (
                      <button
                        key={`${t.name}-${t.language}`}
                        onClick={() => setSelectedTemplate(t)}
                        className={cn(
                          "w-full text-left p-4 rounded-xl border-2 transition-all",
                          selectedTemplate?.name === t.name && selectedTemplate?.language === t.language
                            ? "border-primary bg-primary/5 dark:bg-primary/10"
                            : "border-border dark:border-[#27272A] hover:border-primary/30 dark:hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{t.display_name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Approved</span>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">{t.language}</span>
                          </div>
                        </div>
                        <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 capitalize">{t.category?.toLowerCase()}</p>
                        <p className="text-[11px] text-gray-500/70 dark:text-gray-400/70 font-mono mt-1">{t.name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">Schedule Campaign</h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">Send now or schedule for later</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    onClick={() => setScheduledAt("")}
                    className={cn("p-4 rounded-xl border-2 text-left transition-all",
                      !scheduledAt ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-border dark:border-[#27272A] hover:border-primary/30 dark:hover:border-primary/50"
                    )}
                  >
                    <Zap className="h-5 w-5 text-primary mb-2" />
                    <p className="text-[14px] font-semibold text-gray-900 dark:text-white">Send Now</p>
                    <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">Launch immediately</p>
                  </button>
                  <button
                    onClick={() => !scheduledAt && setScheduledAt(new Date(Date.now() + 3600000).toISOString().slice(0, 16))}
                    className={cn("p-4 rounded-xl border-2 text-left transition-all",
                      scheduledAt ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-border dark:border-[#27272A] hover:border-primary/30 dark:hover:border-primary/50"
                    )}
                  >
                    <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400 mb-2" />
                    <p className="text-[14px] font-semibold text-gray-900 dark:text-white">Schedule Later</p>
                    <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">Pick a date & time</p>
                  </button>
                </div>

                {scheduledAt && (
                  <div>
                    <label className="block text-[13px] font-medium text-gray-900 dark:text-white mb-1.5">Scheduled Date & Time</label>
                    <DatePicker
                      selected={scheduledAt ? new Date(scheduledAt) : null}
                      onChange={(date: Date | null) => setScheduledAt(date ? date.toISOString() : "")}
                      showTimeSelect
                      timeFormat="HH:mm"
                      timeIntervals={15}
                      dateFormat="MMMM d, yyyy h:mm aa"
                      minDate={new Date()}
                      className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-xl px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                      placeholderText="Select date and time"
                      isClearable
                    />
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 dark:bg-white/5 border border-border dark:border-[#27272A] rounded-xl p-4 space-y-2">
                <h4 className="text-[13px] font-semibold text-gray-900 dark:text-white mb-2">Campaign Summary</h4>
                {[
                  ["Name", name],
                  ["Template", selectedTemplate?.display_name ?? "—"],
                  ["Language", selectedTemplate?.language ?? "—"],
                  ["Recipients", recipientFilter.replace(/_/g, " ")],
                  ["Launch", scheduledAt ? format(new Date(scheduledAt), "dd MMM yyyy, HH:mm") : "Immediately"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[13px]">
                    <span className="text-gray-500 dark:text-gray-400">{k}</span>
                    <span className="font-medium text-gray-900 dark:text-white capitalize">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 border border-border dark:border-[#27272A] text-gray-900 dark:text-white rounded-xl py-3 text-[14px] font-medium hover:bg-gray-100 dark:hover:bg-white/10">
              ← Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && !name) { toast.error("Campaign name is required"); return }
                if (step === 2 && !selectedTemplate) { toast.error("Please select a template"); return }
                setStep(s => s + 1)
              }}
              className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-[14px] font-bold hover:bg-primary/90"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={submitting}
              className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 text-[14px] font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {scheduledAt ? "Schedule Campaign" : "🚀 Launch Campaign"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | CampaignStatus>("all")
  const [showCreate, setShowCreate] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/schedule")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCampaigns(data.schedules ?? [])
    } catch {
      // fail silently — show empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const filtered = campaigns.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === "all" || c.status === filter
    return matchSearch && matchFilter
  })

  async function handleCancel(id: string) {
    if (!confirm("Cancel this campaign?")) return
    try {
      await fetch(`/api/campaigns/schedule?id=${id}`, { method: "DELETE" })
      toast.success("Campaign cancelled")
      fetchCampaigns()
    } catch {
      toast.error("Failed to cancel")
    }
  }

  const counts = {
    all: campaigns.length,
    scheduled: campaigns.filter(c => c.status === "scheduled").length,
    running: campaigns.filter(c => c.status === "running").length,
    completed: campaigns.filter(c => c.status === "completed").length,
    failed: campaigns.filter(c => c.status === "failed").length,
    draft: campaigns.filter(c => c.status === "draft").length,
    cancelled: campaigns.filter(c => c.status === "cancelled").length,
  }

  return (
    <div className="flex flex-col min-h-full bg-[#FAFAF8] dark:bg-black p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Broadcast Campaigns</h1>
          <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-0.5">
            Send WhatsApp template messages to your contacts at scale
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchCampaigns} className="p-2 rounded-xl border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-[14px] hover:bg-primary/90 shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.all },
          { label: "Scheduled", value: counts.scheduled, color: "text-blue-600 dark:text-blue-400" },
          { label: "Completed", value: counts.completed, color: "text-green-600 dark:text-green-400" },
          { label: "Running", value: counts.running, color: "text-amber-600 dark:text-amber-400" },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] rounded-xl p-4 shadow-sm">
            <p className="text-[12px] text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className={cn("text-[22px] font-bold mt-0.5", s.color ?? "text-gray-900 dark:text-white")}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full pl-9 pr-4 py-2.5 border border-border dark:border-[#27272A] rounded-xl text-[14px] bg-white dark:bg-[#111114] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {(["all", "scheduled", "running", "completed", "failed", "draft"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-2 rounded-xl text-[13px] font-medium transition-all",
              filter === f ? "bg-foreground dark:bg-white text-background dark:text-black" : "bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && counts[f] !== undefined && ` (${counts[f as keyof typeof counts] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] rounded-2xl p-8 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[14px]">Loading campaigns…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/5 border border-border dark:border-[#27272A] flex items-center justify-center mb-4">
            <Megaphone className="h-8 w-8 text-gray-500/40 dark:text-gray-400" />
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">No campaigns yet</p>
          <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1 mb-5">
            Launch your first WhatsApp broadcast campaign
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Create Campaign
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-[#FAFAF8] dark:bg-white/5 border-b border-border dark:border-[#27272A]">
              <tr>
                {["Campaign", "Template", "Status", "Scheduled", "Recipients", "Delivered", "Actions"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-[#27272A]">
              {filtered.map((c, idx) => {
                const cfg = STATUS_CONFIG[c.status]
                const StatusIcon = cfg.icon
                const isLastRow = idx === filtered.length - 1
                return (
                  <tr key={c.id} className="hover:bg-gray-100/20 dark:hover:bg-white/5 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{c.name}</p>
                      <p className="text-[12px] text-gray-500 dark:text-gray-400">
                        {format(new Date(c.created_at), "dd MMM yyyy")}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[13px] text-gray-900 dark:text-gray-200 font-medium truncate max-w-[160px]">
                        {c.template_name.replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{c.template_language}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full", cfg.badge)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-gray-500 dark:text-gray-400">
                      {c.scheduled_at
                        ? format(new Date(c.scheduled_at), "dd MMM, HH:mm")
                        : "—"}
                    </td>
                    <td className="px-5 py-4 text-[14px] text-gray-900 dark:text-white">{c.recipient_count.toLocaleString()}</td>
                    <td className="px-5 py-4">
                      <span className="text-[14px] text-green-600 dark:text-green-400 font-medium">{c.delivered_count.toLocaleString()}</span>
                      {c.failed_count > 0 && (
                        <span className="text-[12px] text-red-500 dark:text-red-400 ml-2">{c.failed_count} failed</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {c.status !== "completed" && c.status !== "cancelled" && (
                        <div className="relative">
                          <button
                            onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menuId === c.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                              <div className={cn(
                                "absolute right-0 z-20 bg-white dark:bg-[#18181B] border border-border dark:border-[#27272A] rounded-xl shadow-xl w-40 py-1 text-[13px]",
                                isLastRow ? "bottom-full mb-1" : "top-8"
                              )}>
                                <button
                                  onClick={() => { handleCancel(c.id); setMenuId(null) }}
                                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Cancel
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchCampaigns}
        />
      )}
    </div>
  )
}
