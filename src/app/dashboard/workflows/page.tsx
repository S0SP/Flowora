"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Plus, Search, Workflow, Play, Pause, MoreHorizontal,
  Zap, Clock, CheckCircle2, Trash2, Edit3, Loader2,
  MessageSquare, Mail, Phone, Database, GitBranch, Bell,
  RefreshCw, ArrowUpRight, Activity
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { format } from "date-fns"

type WorkflowStatus = "draft" | "active" | "paused" | "archived"

type Workflow = {
  id: string
  name: string
  description: string | null
  status: WorkflowStatus
  trigger_type: string | null
  total_runs: number
  last_run_at: string | null
  created_at: string
  updated_at: string
  nodes?: any[]
}

const STATUS_CONFIG: Record<WorkflowStatus, { label: string; dot: string; badge: string }> = {
  active:   { label: "Active",   dot: "bg-green-500",  badge: "bg-green-100 text-green-700" },
  draft:    { label: "Draft",    dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-500"   },
  paused:   { label: "Paused",   dot: "bg-amber-400",  badge: "bg-amber-100 text-amber-700" },
  archived: { label: "Archived", dot: "bg-red-400",    badge: "bg-red-100 text-red-700"     },
}

const TRIGGER_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  google_sheet: { icon: Database,      color: "text-green-600" },
  webhook:      { icon: Zap,           color: "text-blue-600"  },
  form:         { icon: MessageSquare, color: "text-purple-600"},
  manual:       { icon: Play,          color: "text-gray-500"  },
}

function WorkflowCard({ wf, onDelete, onToggle }: {
  wf: Workflow
  onDelete: (id: string) => void
  onToggle: (id: string, status: WorkflowStatus) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const cfg = STATUS_CONFIG[wf.status] ?? STATUS_CONFIG.draft
  const triggerCfg = TRIGGER_ICONS[wf.trigger_type ?? "manual"] ?? TRIGGER_ICONS.manual
  const TriggerIcon = triggerCfg.icon

  return (
    <div className="bg-white border border-border rounded-2xl p-5 hover:shadow-md transition-all group relative">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Workflow className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-gray-900 truncate">{wf.name}</h3>
            {wf.description && (
              <p className="text-[12px] text-gray-500 truncate mt-0.5">{wf.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full", cfg.badge)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </span>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white border border-border rounded-xl shadow-xl w-44 py-1 text-[13px]">
                  <Link href={`/dashboard/workflows/builder?id=${wf.id}`}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-gray-900">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Link>
                  <button
                    onClick={() => { onToggle(wf.id, wf.status === "active" ? "paused" : "active"); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-gray-900"
                  >
                    {wf.status === "active"
                      ? <><Pause className="h-3.5 w-3.5" /> Pause</>
                      : <><Play className="h-3.5 w-3.5" /> Activate</>
                    }
                  </button>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => { onDelete(wf.id); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Trigger */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-[12px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1">
          <TriggerIcon className={cn("h-3.5 w-3.5", triggerCfg.color)} />
          <span className="capitalize">{(wf.trigger_type ?? "manual").replace(/_/g, " ")} trigger</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[12px] text-gray-500">
        <div className="flex items-center gap-1">
          <Activity className="h-3.5 w-3.5" />
          <span>{(wf.total_runs ?? 0).toLocaleString()} runs</span>
        </div>
        {wf.last_run_at && (
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>Last: {format(new Date(wf.last_run_at), "dd MMM HH:mm")}</span>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[11px]">Updated {format(new Date(wf.updated_at), "dd MMM")}</span>
        </div>
      </div>
    </div>
  )
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | WorkflowStatus>("all")

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setWorkflows(data.workflows ?? [])
    } catch {
      toast.error("Failed to load workflows")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchWorkflows() }, [fetchWorkflows])

  const filtered = workflows.filter(w => {
    const matchSearch = w.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === "all" || w.status === filter
    return matchSearch && matchFilter
  })

  async function handleDelete(id: string) {
    if (!confirm("Delete this workflow? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/workflows?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Workflow deleted")
      setWorkflows(prev => prev.filter(w => w.id !== id))
    } catch {
      toast.error("Failed to delete workflow")
    }
  }

  async function handleToggle(id: string, currentStatus: WorkflowStatus) {
    const newStatus = currentStatus === "active" ? "paused" : "active"
    try {
      const res = await fetch("/api/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success(newStatus === "active" ? "Workflow activated" : "Workflow paused")
      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: newStatus } : w))
    } catch {
      toast.error("Failed to update workflow")
    }
  }

  const counts = {
    all: workflows.length,
    active: workflows.filter(w => w.status === "active").length,
    draft: workflows.filter(w => w.status === "draft").length,
    paused: workflows.filter(w => w.status === "paused").length,
  }

  return (
    <div className="flex flex-col min-h-full bg-[#FAFAF8] p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Builder</h1>
          <p className="text-[14px] text-gray-500 mt-0.5">Automate lead engagement with multi-channel AI workflows</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchWorkflows} className="p-2 rounded-xl border border-border bg-white hover:bg-gray-100 text-gray-500">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <Link
            href="/dashboard/workflows/builder"
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-[14px] hover:bg-primary/90 shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Workflow
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: counts.all, color: "text-gray-900" },
          { label: "Active", value: counts.active, color: "text-green-600" },
          { label: "Draft", value: counts.draft, color: "text-gray-500" },
          { label: "Total Runs", value: workflows.reduce((s, w) => s + (w.total_runs ?? 0), 0), color: "text-primary" },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[12px] text-gray-500">{s.label}</p>
            <p className={cn("text-[22px] font-bold mt-0.5", s.color)}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search workflows…"
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-[14px] bg-white focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {(["all", "active", "draft", "paused"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("px-3 py-2 rounded-xl text-[13px] font-medium transition-all",
              filter === f ? "bg-foreground text-background" : "bg-white border border-border text-gray-500 hover:text-gray-900"
            )}
          >
            {f === "all" ? `All (${counts.all})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f as keyof typeof counts] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-border rounded-2xl p-5 h-40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Workflow className="h-8 w-8 text-gray-500/40" />
          </div>
          <p className="text-lg font-semibold text-gray-900">No workflows yet</p>
          <p className="text-[14px] text-gray-500 mt-1 mb-5">
            Build your first automated lead funnel
          </p>
          <Link
            href="/dashboard/workflows/builder"
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Create First Workflow
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(wf => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}

          {/* Add new card */}
          <Link
            href="/dashboard/workflows/builder"
            className="border-2 border-dashed border-border rounded-2xl p-5 flex flex-col items-center justify-center gap-3 hover:border-primary hover:bg-primary/5 transition-all group min-h-[160px]"
          >
            <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <Plus className="h-5 w-5 text-gray-500 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-[14px] font-medium text-gray-500 group-hover:text-primary transition-colors">
              New Workflow
            </p>
          </Link>
        </div>
      )}
    </div>
  )
}
