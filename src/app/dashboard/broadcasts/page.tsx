"use client"

import { useState, useEffect, useCallback } from "react"
import { Megaphone, Plus, Send, Loader2, Users, Clock, CheckCheck, X, ChevronDown, Trash2, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useWorkspace } from "@/context/WorkspaceContext"
import { format } from "date-fns"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

type BroadcastStatus = "draft" | "scheduled" | "running" | "completed" | "failed"
type Broadcast = {
  id: string
  name: string
  status: BroadcastStatus
  template_name: string | null
  recipients_count: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  scheduled_at: string | null
  completed_at: string | null
  created_at: string
}

type Template = { name: string; language: string; display_name: string; category: string }

const STATUS_STYLE: Record<BroadcastStatus, string> = {
  draft: "bg-gray-100 text-gray-500",
  scheduled: "bg-blue-100 text-blue-600",
  running: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
}

export default function BroadcastsPage() {
  const supabase = createClient()
  const { workspace } = useWorkspace()

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Create form state
  const [name, setName] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [scheduleAt, setScheduleAt] = useState("")
  const [creating, setCreating] = useState(false)

  // Stats derived from list
  const stats = {
    total: broadcasts.length,
    running: broadcasts.filter(b => b.status === "running").length,
    completed: broadcasts.filter(b => b.status === "completed").length,
    totalSent: broadcasts.reduce((a, b) => a + (b.sent_count ?? 0), 0),
  }

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })

      if (error) throw error
      setBroadcasts(data ?? [])
    } catch (err: any) {
      // Table might not exist yet — show empty state gracefully
      setBroadcasts([])
    } finally {
      setLoading(false)
    }
  }, [workspace.id])

  useEffect(() => {
    fetchBroadcasts()
  }, [fetchBroadcasts])

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const res = await fetch("/api/templates")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setTemplates(data)
      if (data.length > 0) setSelectedTemplate(data[0].name)
    } catch {
      toast.error("Failed to load templates")
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  const openModal = () => {
    setShowModal(true)
    fetchTemplates()
  }

  const handleCreate = async () => {
    if (!name.trim() || !selectedTemplate) {
      toast.error("Name and template are required")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          templateName: selectedTemplate,
          scheduledAt: scheduleAt || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to create broadcast")
      }
      toast.success("Broadcast created!")
      setShowModal(false)
      setName("")
      setScheduleAt("")
      setCsvFile(null)
      fetchBroadcasts()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this broadcast?")) return
    try {
      const { error } = await supabase
        .from("broadcasts")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspace.id)
      if (error) throw error
      toast.success("Broadcast deleted")
      fetchBroadcasts()
    } catch {
      toast.error("Failed to delete broadcast")
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-muted/30 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-border px-8 py-5 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-foreground flex items-center gap-2.5">
              <Megaphone className="h-6 w-6 text-primary" />
              Broadcasts
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Send WhatsApp message templates to multiple contacts at once</p>
          </div>
          <button
            onClick={openModal}
            className="flex items-center gap-2 bg-foreground text-white px-4 py-2.5 rounded-lg text-[13px] font-semibold hover:bg-foreground/90 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Broadcast
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b border-border px-8 py-4 shrink-0">
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: "Total Broadcasts", value: stats.total, icon: Megaphone, color: "text-primary" },
            { label: "Running Now", value: stats.running, icon: Clock, color: "text-amber-600" },
            { label: "Completed", value: stats.completed, icon: CheckCheck, color: "text-green-600" },
            { label: "Messages Sent", value: stats.totalSent.toLocaleString(), icon: Send, color: "text-blue-600" },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                <s.icon className={cn("h-5 w-5", s.color)} />
              </div>
              <div>
                <div className="text-[20px] font-bold text-foreground leading-tight">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-5">
              <Megaphone className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-[20px] font-bold text-foreground mb-2">No broadcasts yet</h2>
            <p className="text-[14px] text-muted-foreground max-w-[380px] mb-6">
              Send a WhatsApp message template to hundreds of contacts at once. Use broadcasts for promotions, reminders, or updates.
            </p>
            <button
              onClick={openModal}
              className="flex items-center gap-2 bg-foreground text-white px-5 py-2.5 rounded-lg text-[14px] font-semibold hover:bg-foreground/90 transition-all"
            >
              <Plus className="h-4 w-4" /> Create First Broadcast
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => (
              <div key={b.id} className="bg-white border border-border rounded-xl p-5 flex items-center gap-5 hover:shadow-sm transition-shadow">
                {/* Icon */}
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Megaphone className="h-5 w-5 text-primary" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[15px] font-semibold text-foreground truncate">{b.name}</span>
                    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0", STATUS_STYLE[b.status])}>
                      {b.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    {b.template_name && <span>Template: <span className="font-medium text-foreground">{b.template_name}</span></span>}
                    <span>·</span>
                    <span>Created {format(new Date(b.created_at), "MMM d, yyyy")}</span>
                    {b.scheduled_at && (
                      <>
                        <span>·</span>
                        <span>Scheduled {format(new Date(b.scheduled_at), "MMM d HH:mm")}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 shrink-0">
                  {[
                    { label: "Recipients", value: b.recipients_count ?? 0 },
                    { label: "Sent", value: b.sent_count ?? 0 },
                    { label: "Delivered", value: b.delivered_count ?? 0 },
                    { label: "Read", value: b.read_count ?? 0 },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-[16px] font-bold text-foreground">{s.value.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {b.status === "draft" && (
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-7" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[18px] font-bold text-foreground">New Broadcast</h3>
                <p className="text-[13px] text-muted-foreground mt-0.5">Send a template message to your contacts</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-muted rounded-lg">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[13px] font-semibold text-foreground mb-1.5 block">Broadcast Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Weekend Promo - July"
                  className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-[13px] font-semibold text-foreground mb-1.5 block">Message Template</label>
                {loadingTemplates ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading templates...
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedTemplate}
                      onChange={e => setSelectedTemplate(e.target.value)}
                      className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white pr-9"
                    >
                      {templates.length === 0 && (
                        <option value="">No approved templates found</option>
                      )}
                      {templates.map(t => (
                        <option key={t.name} value={t.name}>{t.display_name || t.name} ({t.language})</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>

              <div>
                <label className="text-[13px] font-semibold text-foreground mb-1.5 block">
                  Schedule <span className="font-normal text-muted-foreground">(optional — leave blank to send now)</span>
                </label>
                <DatePicker
                  selected={scheduleAt ? new Date(scheduleAt) : null}
                  onChange={(date: Date | null) => setScheduleAt(date ? date.toISOString() : "")}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholderText="Select date and time"
                  isClearable
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[12px] text-blue-700">
                <strong>Tip:</strong> Recipients are loaded from your Contacts list. Only contacts with valid WhatsApp numbers will receive the message.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim() || !selectedTemplate}
                className="flex-1 py-2.5 bg-foreground text-white rounded-lg text-[14px] font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {creating ? "Creating..." : scheduleAt ? "Schedule Broadcast" : "Send Broadcast"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
