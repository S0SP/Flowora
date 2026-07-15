"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { Kanban, Table2, BarChart3, Upload, Plus, Filter, Settings2, X, Search, Trash2, Edit } from "lucide-react"
import { KanbanBoard } from "@/components/organisms/KanbanBoard"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import Papa from "papaparse"

export interface Lead {
  id: string
  name: string
  company: string
  value: string
  status: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost"
  created_at: string
}

export default function LeadsKanbanPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  
  const [view, setView] = useState<"kanban" | "table" | "analytics">("kanban")
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [pasteData, setPasteData] = useState("")
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<any>({ 
    name: "", 
    company: "", 
    value: "", 
    status: "new",
    phone: "",
    email: "",
    note: "",
    followupDate: "",
    customFields: { Interest: "Real Estate Chatbot" }
  })

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      return data.leads ?? []
    }
  })

  const addLeadMutation = useMutation({
    mutationFn: async (newLead: any) => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLead),
      })
      if (!res.ok) throw new Error("Failed to create")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      toast.success("Lead added successfully")
      setIsAddModalOpen(false)
    }
  })

  const editLeadMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: Partial<Lead> }) => {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
      if (!res.ok) throw new Error("Failed to update")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      toast.success("Lead updated successfully")
      setIsEditModalOpen(false)
    }
  })

  // Delete lead mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leads?id=${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      toast.success("Lead deleted successfully")
    }
  })

  // Bulk import leads mutation
  const importLeadsMutation = useMutation({
    mutationFn: async (leadsList: any[]) => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadsList),
      })
      if (!res.ok) throw new Error("Failed to import")
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      toast.success(`Successfully imported ${data.leads?.length ?? 0} leads`)
      setIsImportModalOpen(false)
      setPasteData("")
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to import leads")
    }
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row: any) => {
          const name = row.name || row.Name || row["Lead Name"] || row["name"] || "";
          const company = row.company || row.Company || row["Company Name"] || "";
          const value = row.value || row.Value || row["Estimated Value"] || "";
          const status = (row.status || row.Status || "new").toLowerCase().trim();
          return { name, company, value, status };
        }).filter(x => x.name)

        if (parsed.length > 0) {
          importLeadsMutation.mutate(parsed)
        } else {
          toast.error("No valid leads found in CSV. Make sure you have a 'name' or 'Lead Name' column.")
        }
      }
    })
  }

  const handlePasteImport = () => {
    if (!pasteData.trim()) return
    Papa.parse(pasteData, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row: any) => {
          const name = row.name || row.Name || row["Lead Name"] || row["name"] || "";
          const company = row.company || row.Company || row["Company Name"] || "";
          const value = row.value || row.Value || row["Estimated Value"] || "";
          const status = (row.status || row.Status || "new").toLowerCase().trim();
          return { name, company, value, status };
        }).filter(x => x.name)

        if (parsed.length > 0) {
          importLeadsMutation.mutate(parsed)
        } else {
          toast.error("No valid leads found. Make sure you have a header row with 'name' or 'Lead Name'.")
        }
      }
    })
  }

  const handleOpenAdd = (status: string = "new") => {
    setFormData({ 
      name: "", 
      company: "", 
      value: "", 
      status: status || "new",
      phone: "",
      email: "",
      note: "",
      followupDate: "",
      customFields: { Interest: "Real Estate Chatbot" }
    })
    setIsAddModalOpen(true)
  }

  const handleOpenEdit = (id: string) => {
    const lead = leads.find((l: any) => l.id === id)
    if (lead) {
      setFormData(lead)
      setEditingLeadId(id)
      setIsEditModalOpen(true)
    }
  }

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) return
    addLeadMutation.mutate(formData as Omit<Lead, "id" | "created_at">)
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLeadId) return
    editLeadMutation.mutate({ id: editingLeadId, updates: formData })
  }

  const handleDeleteLead = (id: string) => {
    if (confirm("Are you sure you want to delete this lead?")) {
      deleteLeadMutation.mutate(id)
    }
  }

  // Helper calculation logic for real analytics values
  const leadValues = leads
    .map(l => Number(String(l.value || 0).replace(/[^0-9.]/g, "")))
    .filter(v => v > 0)

  const pipelineValue = leads.reduce((sum, l) => sum + (Number(String(l.value || 0).replace(/[^0-9.]/g, "")) || 0), 0)
  
  const avgDealValue = leadValues.length 
    ? Math.round(leadValues.reduce((a, b) => a + b, 0) / leadValues.length) 
    : 0

  const wonLeads = leads.filter(l => l.status === "won").length
  const conversionRate = leads.length 
    ? ((wonLeads / leads.length) * 100).toFixed(1) + "%" 
    : "0%"

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const leadsThisWeek = leads.filter(l => new Date(l.created_at).getTime() >= oneWeekAgo).length

  // Filter leads for the table view
  const filteredTableLeads = leads.filter(l => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (l.name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q))
  })

  return (
    <div className="h-full flex-1 flex flex-col bg-muted/30 overflow-hidden relative">
      {/* Header Area */}
      <div className="flex-shrink-0 p-6 border-b bg-background">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-6">
            <h1 className="text-2xl font-bold text-foreground">Leads CRM</h1>
            
            {/* View Switchers */}
            <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border/80">
              <button 
                onClick={() => setView("kanban")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
                  view === "kanban" 
                    ? "bg-white text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Kanban className="h-3.5 w-3.5" /> Kanban
              </button>
              <button 
                onClick={() => setView("table")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
                  view === "table" 
                    ? "bg-white text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Table2 className="h-3.5 w-3.5" /> Table
              </button>
              <button 
                onClick={() => setView("analytics")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
                  view === "analytics" 
                    ? "bg-white text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Analytics
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative w-48 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary outline-none"
              />
            </div>

            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center justify-center rounded-lg text-xs font-semibold transition-all border border-border bg-white hover:bg-muted h-9 px-4 gap-2 text-muted-foreground shadow-sm"
            >
              <Upload className="h-4 w-4" /> Import Leads
            </button>
            <button 
              onClick={() => handleOpenAdd("new")} 
              className="inline-flex items-center justify-center rounded-lg text-xs font-bold transition-all bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-4 gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add Lead
            </button>
          </div>
        </div>

        {/* Dynamic Analytics Strip */}
        <div className="bg-white border border-border/80 rounded-xl p-4 shadow-sm flex items-center justify-between overflow-x-auto hide-scrollbar gap-4">
          <div className="flex flex-col px-4 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Total Leads</span>
            <span className="text-lg font-bold text-foreground">{leads.length}</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col px-4 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">This Week</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-foreground">+{leadsThisWeek}</span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold">New</span>
            </div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col px-4 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Conversion Rate</span>
            <span className="text-lg font-bold text-foreground">{conversionRate}</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col px-4 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Avg Deal Value</span>
            <span className="text-lg font-bold text-foreground">${avgDealValue.toLocaleString()}</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col px-4 min-w-[120px]">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Pipeline Value</span>
            <span className="text-lg font-bold text-foreground">${pipelineValue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto relative min-h-0">
        {view === "kanban" && (
          <KanbanBoard onOpenAdd={handleOpenAdd} onEditLead={handleOpenEdit} filterQuery={searchQuery} />
        )}

        {view === "table" && (
          <div className="p-6">
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-6 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Lead Name</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Deal Value</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Pipeline Stage</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E8E4]">
                  {filteredTableLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-[14px] font-semibold text-foreground">{lead.name}</span>
                      </td>
                      <td className="px-6 py-4 text-[13px] text-muted-foreground">{lead.company || "—"}</td>
                      <td className="px-6 py-4 text-[13px] font-bold text-foreground">
                        {lead.value ? `$${Number(lead.value).toLocaleString()}` : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          lead.status === "new" && "bg-chart-2/10 text-[#0f766e]",
                          lead.status === "contacted" && "bg-primary/10 text-primary",
                          lead.status === "qualified" && "bg-chart-4/10 text-[#c2410c]",
                          lead.status === "proposal" && "bg-lavender/20 text-[#6366f1]",
                          lead.status === "won" && "bg-chart-5/10 text-[#15803d]",
                          lead.status === "lost" && "bg-chart-3/10 text-[#b91c1c]"
                        )}>
                          {lead.status === "new" ? "New Lead" : lead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[12px] text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4 text-right space-x-1">
                        <button 
                          onClick={() => handleOpenEdit(lead.id)}
                          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteLead(lead.id)}
                          className="p-1.5 hover:bg-red-50 rounded-md text-muted-foreground hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredTableLeads.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        No leads found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === "analytics" && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stage Distribution */}
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-[15px] font-bold text-foreground mb-4">Pipeline Stage Distribution</h3>
              <div className="space-y-4">
                {[
                  { key: "new", label: "New Lead", color: "bg-[#0f766e]" },
                  { key: "contacted", label: "Contacted", color: "bg-primary" },
                  { key: "qualified", label: "Qualified", color: "bg-[#c2410c]" },
                  { key: "proposal", label: "Proposal Sent", color: "bg-[#6366f1]" },
                  { key: "won", label: "Won", color: "bg-[#15803d]" },
                  { key: "lost", label: "Lost", color: "bg-[#b91c1c]" }
                ].map(stage => {
                  const count = leads.filter(l => l.status === stage.key).length
                  const percentage = leads.length ? (count / leads.length) * 100 : 0
                  return (
                    <div key={stage.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-foreground">{stage.label}</span>
                        <span className="text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={cn("h-2 rounded-full", stage.color)} style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Financial Value Summary */}
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-foreground mb-4">Deal Value Breakdown</h3>
                <div className="space-y-4">
                  {[
                    { label: "Pipeline Value (Active)", value: leads.filter(l => l.status !== "won" && l.status !== "lost").reduce((sum, l) => sum + (Number(l.value) || 0), 0) },
                    { label: "Won Deals Value", value: leads.filter(l => l.status === "won").reduce((sum, l) => sum + (Number(l.value) || 0), 0) },
                    { label: "Lost Deals Value", value: leads.filter(l => l.status === "lost").reduce((sum, l) => sum + (Number(l.value) || 0), 0) }
                  ].map((stat, i) => (
                    <div key={i} className="flex justify-between py-2.5 border-b border-border last:border-0">
                      <span className="text-sm text-muted-foreground font-medium">{stat.label}</span>
                      <span className="text-sm font-bold text-foreground">${stat.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mt-6">
                <p className="text-xs text-muted-foreground font-medium mb-1">Win/Loss Ratio</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">
                    {leads.filter(l => l.status === "won" || l.status === "lost").length 
                      ? ((wonLeads / leads.filter(l => l.status === "won" || l.status === "lost").length) * 100).toFixed(0) + "%" 
                      : "0%"}
                  </span>
                  <span className="text-xs text-muted-foreground">win rate for closed deals</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[400px] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">Add New Lead</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSaveAdd} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto hide-scrollbar">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input required type="text" value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="John Doe" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Phone</label>
                  <input type="text" value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" placeholder="+919876543210" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Email</label>
                  <input type="email" value={formData.email || ""} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" placeholder="john@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company</label>
                <input type="text" value={formData.company || ""} onChange={e => setFormData({ ...formData, company: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Estimated Value</label>
                  <input type="text" value={formData.value || ""} onChange={e => setFormData({ ...formData, value: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="$5,000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Status</label>
                  <select value={formData.status || "new"} onChange={e => setFormData({ ...formData, status: e.target.value as any })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                    <option value="new">New Lead</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Internal Note</label>
                <textarea rows={2} value={formData.note || ""} onChange={e => setFormData({ ...formData, note: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white resize-none" placeholder="Interested in WhatsApp automation..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Follow-up Date</label>
                <DatePicker 
                  selected={formData.followupDate ? new Date(formData.followupDate) : null}
                  onChange={(date: Date | null) => setFormData({ ...formData, followupDate: date ? date.toISOString() : "" })}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  placeholderText="Select date and time"
                  isClearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Interest Attribute</label>
                <input type="text" value={formData.customFields?.Interest || ""} onChange={e => setFormData({ ...formData, customFields: { ...formData.customFields, Interest: e.target.value } })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" placeholder="Real Estate Chatbot" />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={addLeadMutation.isPending} className="px-4 py-2 bg-foreground text-white rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors">
                  {addLeadMutation.isPending ? "Saving..." : "Save Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[400px] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">Edit Lead</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto hide-scrollbar">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input required type="text" value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Phone</label>
                  <input type="text" value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" placeholder="+919876543210" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Email</label>
                  <input type="email" value={formData.email || ""} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" placeholder="john@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company</label>
                <input type="text" value={formData.company || ""} onChange={e => setFormData({ ...formData, company: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Estimated Value</label>
                  <input type="text" value={formData.value || ""} onChange={e => setFormData({ ...formData, value: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Status</label>
                  <select value={formData.status || "new"} onChange={e => setFormData({ ...formData, status: e.target.value as Lead["status"] })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                    <option value="new">New Lead</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Internal Note</label>
                <textarea rows={2} value={formData.note || ""} onChange={e => setFormData({ ...formData, note: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white resize-none" placeholder="Interested in WhatsApp automation..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Follow-up Date</label>
                <DatePicker 
                  selected={formData.followupDate ? new Date(formData.followupDate) : null}
                  onChange={(date: Date | null) => setFormData({ ...formData, followupDate: date ? date.toISOString() : "" })}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  placeholderText="Select date and time"
                  isClearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Interest Attribute</label>
                <input type="text" value={formData.customFields?.Interest || ""} onChange={e => setFormData({ ...formData, customFields: { ...formData.customFields, Interest: e.target.value } })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={editLeadMutation.isPending} className="px-4 py-2 bg-foreground text-white rounded-lg text-sm font-medium hover:bg-foreground/90">
                  {editLeadMutation.isPending ? "Saving..." : "Update Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Leads Modal */}
      {isImportModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-[500px] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">Import Leads</h2>
              <button onClick={() => setIsImportModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Import leads by uploading a CSV file or copying-and-pasting raw CSV data. Make sure your CSV contains a <code className="bg-muted px-1.5 py-0.5 rounded font-mono">name</code> column. <code className="bg-muted px-1.5 py-0.5 rounded font-mono">company</code>, <code className="bg-muted px-1.5 py-0.5 rounded font-mono">value</code>, and <code className="bg-muted px-1.5 py-0.5 rounded font-mono">status</code> are optional.
              </p>
              
              {/* File Uploader */}
              <div className="space-y-1">
                <label className="block text-sm font-semibold">Option 1: Upload CSV file</label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/30 transition-colors cursor-pointer relative">
                  <input 
                    type="file" 
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <span className="text-xs font-medium text-foreground block">Click to upload or drag CSV here</span>
                  <span className="text-[10px] text-muted-foreground mt-1 block">Only .csv files supported</span>
                </div>
              </div>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-border"></div>
                <span className="flex-shrink mx-4 text-muted-foreground text-xs uppercase font-bold tracking-widest">Or</span>
                <div className="flex-grow border-t border-border"></div>
              </div>

              {/* Paste CSV Box */}
              <div className="space-y-1">
                <label className="block text-sm font-semibold">Option 2: Paste Raw CSV Data</label>
                <textarea 
                  rows={6}
                  value={pasteData}
                  onChange={e => setPasteData(e.target.value)}
                  placeholder="name,company,value,status&#10;John Doe,Acme Corp,5000,new&#10;Jane Smith,Beta LLC,2500,contacted"
                  className="w-full border rounded-lg p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 bg-muted/20"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button 
                  type="button" 
                  onClick={handlePasteImport}
                  disabled={importLeadsMutation.isPending || !pasteData.trim()}
                  className="px-4 py-2 bg-foreground text-white rounded-lg text-sm font-medium hover:bg-foreground/90 disabled:opacity-50"
                >
                  {importLeadsMutation.isPending ? "Importing..." : "Import Pasted"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
