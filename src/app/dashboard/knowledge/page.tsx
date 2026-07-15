"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
  CheckCircle2, RefreshCw, Plus, Globe, FileSpreadsheet, FileText,
  Send, Loader2, X, Upload, AlertCircle, Clock, Trash2,
  Database, Zap, ExternalLink, File,
} from "lucide-react"
import { ReactFlow, Background, Controls, Node, Edge, useNodesState, useEdgesState } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type KnowledgeSource = {
  id: string
  name: string
  type: string
  source_url?: string
  status: "pending" | "processing" | "ready" | "error"
  error_message?: string
  total_chunks?: number
  chunk_count?: number
  last_synced_at?: string
  created_at: string
}

const TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  website: { icon: Globe, color: "text-blue-500" },
  pdf: { icon: FileText, color: "text-amber-500" },
  docx: { icon: File, color: "text-blue-600" },
  csv: { icon: FileSpreadsheet, color: "text-green-600" },
  xlsx: { icon: FileSpreadsheet, color: "text-green-700" },
  txt: { icon: FileText, color: "text-slate-500" },
  google_sheet: { icon: FileSpreadsheet, color: "text-green-500" },
  google_doc: { icon: File, color: "text-blue-500" },
}

const STATUS_COLORS = {
  pending: "bg-yellow-400",
  processing: "bg-blue-400 animate-pulse",
  ready: "bg-green-500",
  error: "bg-red-500",
}

function buildGraphNodes(sources: KnowledgeSource[]): { nodes: Node[]; edges: Edge[] } {
  const centerNode: Node = {
    id: "center",
    type: "default",
    data: { label: "Knowledge Base" },
    position: { x: 400, y: 250 },
    style: {
      background: "#1B1B1B",
      color: "white",
      fontWeight: "bold",
      fontSize: "13px",
      borderRadius: "50%",
      width: 72,
      height: 72,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "2px solid #FFE27C",
    },
  }

  const radius = 180
  const angleStep = (2 * Math.PI) / Math.max(sources.length, 1)

  const sourceNodes: Node[] = sources.map((src, i) => {
    const angle = i * angleStep - Math.PI / 2
    const x = 400 + radius * Math.cos(angle) - 36
    const y = 250 + radius * Math.sin(angle) - 20
    const color = src.status === "ready" ? "#22C55E" : src.status === "error" ? "#EF4444" : "#F59E0B"
    return {
      id: src.id,
      data: { label: src.name.slice(0, 12) + (src.name.length > 12 ? "…" : "") },
      position: { x, y },
      style: {
        background: "white",
        color: "#1B1B1B",
        fontSize: "11px",
        fontWeight: 500,
        borderRadius: "8px",
        padding: "6px 10px",
        border: `2px solid ${color}`,
        minWidth: 80,
        textAlign: "center",
      },
    }
  })

  const edges: Edge[] = sources.map(src => ({
    id: `e-${src.id}`,
    source: "center",
    target: src.id,
    style: { stroke: "#E2E8F0", strokeWidth: 1.5 },
    animated: src.status === "processing",
  }))

  return { nodes: [centerNode, ...sourceNodes], edges }
}

export default function KnowledgeHubPage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Add source modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addType, setAddType] = useState<"website" | "google_sheet" | "txt" | "file">("website")
  const [urlInput, setUrlInput] = useState("")
  const [nameInput, setNameInput] = useState("")
  const [textContent, setTextContent] = useState("")
  const [adding, setAdding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Query testing
  const [query, setQuery] = useState("What products or services do you offer?")
  const [isTesting, setIsTesting] = useState(false)
  const [queryResult, setQueryResult] = useState<{
    answer: string;
    sources: Array<{ name: string; type: string }>;
    confidence: number;
  } | null>(null)

  // Resync loading
  const [resyncing, setResyncing] = useState<string | null>(null)

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge/documents")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      const srcs: KnowledgeSource[] = data.sources ?? []
      setSources(srcs)

      const { nodes: n, edges: e } = buildGraphNodes(srcs)
      setNodes(n)
      setEdges(e)
    } catch {
      toast.error("Failed to load knowledge sources")
    } finally {
      setLoading(false)
    }
  }, [setNodes, setEdges])

  useEffect(() => {
    fetchSources()
    // Poll every 5s while any source is processing
    const interval = setInterval(() => {
      setSources(prev => {
        if (prev.some(s => s.status === "processing" || s.status === "pending")) {
          fetchSources()
        }
        return prev
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchSources])

  async function handleAddSource() {
    if (addType === "file") {
      fileInputRef.current?.click()
      return
    }

    const name = nameInput.trim() || urlInput.trim() || "New Source"
    if (!name) { toast.error("Please enter a name"); return }
    if ((addType === "website" || addType === "google_sheet") && !urlInput.trim()) {
      toast.error("Please enter a URL"); return
    }
    if (addType === "txt" && !textContent.trim()) {
      toast.error("Please enter some text content"); return
    }

    setAdding(true)
    try {
      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: addType,
          source_url: addType !== "txt" ? urlInput.trim() : undefined,
          content: addType === "txt" ? textContent.trim() : undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Source added! Processing started…")
      setShowAddModal(false)
      setUrlInput("")
      setNameInput("")
      setTextContent("")
      fetchSources()
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add source")
    } finally {
      setAdding(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setAdding(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: form })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${file.name} uploaded! Processing started…`)
      setShowAddModal(false)
      fetchSources()
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed")
    } finally {
      setAdding(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this knowledge source and all its data?")) return
    try {
      const res = await fetch(`/api/knowledge/documents?id=${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Source deleted")
      fetchSources()
    } catch {
      toast.error("Failed to delete source")
    }
  }

  async function handleResync(source: KnowledgeSource) {
    setResyncing(source.id)
    try {
      await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: source.name,
          type: source.type,
          source_url: source.source_url,
        }),
      })
      // Also delete the old source
      await fetch(`/api/knowledge/documents?id=${source.id}`, { method: "DELETE" })
      toast.success("Resyncing…")
      fetchSources()
    } catch {
      toast.error("Resync failed")
    } finally {
      setResyncing(null)
    }
  }

  async function handleTestQuery() {
    if (!query.trim()) return
    setIsTesting(true)
    setQueryResult(null)
    try {
      const res = await fetch("/api/knowledge/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), limit: 5, threshold: 0.3 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setQueryResult(data)
    } catch (err: any) {
      toast.error(err.message ?? "Query failed")
    } finally {
      setIsTesting(false)
    }
  }

  const totalChunks = sources.reduce((s, src) => s + (src.chunk_count ?? 0), 0)
  const readySources = sources.filter(s => s.status === "ready").length

  return (
    <div className="flex flex-col h-full flex-1 bg-white relative">

      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-border flex items-center justify-between z-10 bg-white">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Knowledge Hub</h1>
          <p className="text-[14px] text-muted-foreground">
            Your AI chatbot and voice agent use this knowledge graph to answer questions accurately.
          </p>
          <div className="flex items-center gap-3 mt-2">
            {readySources > 0 ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-[13px] text-green-600">{readySources} source{readySources !== 1 ? "s" : ""} ready · {totalChunks.toLocaleString()} knowledge chunks</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-[13px] text-muted-foreground">No sources yet — add your company data</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button
            onClick={() => { setLoading(true); fetchSources() }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Resync All
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left Panel: Sources */}
        <div className="w-[280px] bg-white border-r border-border p-4 flex flex-col shrink-0 overflow-y-auto">
          <h2 className="text-[14px] font-bold text-foreground mb-3">Data Sources</h2>

          <button
            onClick={() => setShowAddModal(true)}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[14px] py-2 rounded-lg transition-colors flex items-center justify-center gap-2 mb-4 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add Source
          </button>

          <div className="space-y-2 flex-1">
            {loading && sources.length === 0 && (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {!loading && sources.length === 0 && (
              <div className="text-center py-8">
                <Database className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-[13px] text-muted-foreground">No sources yet</p>
                <p className="text-[12px] text-muted-foreground/70">Add your website, docs, or files</p>
              </div>
            )}

            {sources.map(source => {
              const TypeIcon = TYPE_ICONS[source.type]?.icon ?? FileText
              const iconColor = TYPE_ICONS[source.type]?.color ?? "text-slate-500"
              return (
                <div key={source.id} className="group border border-border rounded-lg p-3 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <TypeIcon className={cn("h-4 w-4 shrink-0", iconColor)} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{source.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {source.type} · {source.chunk_count ?? 0} chunks
                        </p>
                      </div>
                    </div>
                    <div className={cn("w-2 h-2 rounded-full mt-1 shrink-0", STATUS_COLORS[source.status])} />
                  </div>

                  {source.status === "error" && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {source.error_message?.slice(0, 50) ?? "Error"}
                    </p>
                  )}

                  {source.status === "processing" && (
                    <p className="text-[11px] text-blue-500 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                    </p>
                  )}

                  {source.last_synced_at && source.status === "ready" && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(source.last_synced_at).toLocaleDateString()}
                    </p>
                  )}

                  <div className="hidden group-hover:flex items-center gap-2 mt-2">
                    <button
                      onClick={() => handleResync(source)}
                      disabled={resyncing === source.id}
                      className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                    >
                      {resyncing === source.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Resync
                    </button>
                    {source.source_url && (
                      <a href={source.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="text-[11px] text-red-500 hover:underline flex items-center gap-0.5 ml-auto"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="pt-4 border-t border-border mt-4 space-y-1">
            <p className="text-[12px] text-muted-foreground">
              <span className="font-medium">{totalChunks.toLocaleString()}</span> knowledge chunks
            </p>
            <p className="text-[12px] text-muted-foreground">
              <span className="font-medium">{sources.length}</span> data source{sources.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-2">
              Supported: Website · PDF · DOCX · CSV · Excel · TXT · Google Sheet
            </p>
          </div>
        </div>

        {/* Center: Graph Visualization */}
        <div className="flex-1 bg-muted/20 relative">
          {sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <Database className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <p className="text-[15px] font-medium text-foreground">Your knowledge graph will appear here</p>
              <p className="text-[13px] text-muted-foreground">Add data sources to build the graph</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add First Source
              </button>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              attributionPosition="bottom-right"
            >
              <Background color="#E2E8F0" gap={16} />
              <Controls className="!bg-white !border-border !rounded-lg !shadow-sm" />
            </ReactFlow>
          )}

          {sources.length > 0 && (
            <div className="absolute top-4 right-4 bg-white border border-border rounded-lg shadow-sm px-3 py-2 text-[12px] text-muted-foreground">
              <Zap className="h-3.5 w-3.5 inline mr-1 text-primary" />
              Live knowledge graph · {totalChunks.toLocaleString()} vectors indexed
            </div>
          )}
        </div>

        {/* Right Panel: Query Testing */}
        <div className="w-[320px] bg-white border-l border-border p-4 flex flex-col shrink-0">
          <h2 className="text-[14px] font-bold text-foreground mb-1">Test Knowledge Query</h2>
          <p className="text-[12px] text-muted-foreground mb-4">Ask a question to test your knowledge base</p>

          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask a question as your customer would..."
            className="w-full bg-muted border-none rounded-lg p-3 text-[13px] resize-none focus:ring-1 focus:ring-primary mb-3 outline-none"
            rows={3}
          />
          <button
            onClick={handleTestQuery}
            disabled={isTesting || !query.trim() || readySources === 0}
            className="w-full bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[13px] py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mb-4"
          >
            {isTesting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Querying Graph…</>
              : <><Send className="h-4 w-4" /> Test Query</>
            }
          </button>

          {readySources === 0 && !isTesting && (
            <p className="text-[12px] text-amber-600 text-center mb-3">Add and process sources first to enable queries</p>
          )}

          {queryResult && (
            <div className="flex-1 overflow-y-auto space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <p className="text-[12px] text-muted-foreground mb-2 font-medium">AI Response</p>
                <div className="bg-primary/5 border border-primary/20 rounded-[10px] p-[14px]">
                  <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                    {queryResult.answer}
                  </p>
                </div>
              </div>

              {queryResult.sources.length > 0 && (
                <div>
                  <p className="text-[12px] text-muted-foreground mb-2 font-medium">Sources used:</p>
                  <div className="flex flex-wrap gap-2">
                    {queryResult.sources.map((src, i) => {
                      const TypeIcon = TYPE_ICONS[src.type]?.icon ?? FileText
                      return (
                        <div key={i} className="flex items-center gap-1.5 bg-white border border-border px-2 py-1 rounded text-[11px] font-medium text-muted-foreground shadow-sm">
                          <TypeIcon className="h-3 w-3" /> {src.name}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className={cn(
                    "text-[12px] font-medium",
                    queryResult.confidence > 70 ? "text-green-600" : queryResult.confidence > 40 ? "text-amber-600" : "text-red-500"
                  )}>
                    Confidence: {queryResult.confidence}%
                  </p>
                </div>
                <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", queryResult.confidence > 70 ? "bg-green-500" : queryResult.confidence > 40 ? "bg-amber-500" : "bg-red-400")}
                    style={{ width: `${queryResult.confidence}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold text-foreground">Add Knowledge Source</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Source type selector */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {([
                { value: "website", label: "Website", icon: Globe },
                { value: "google_sheet", label: "Sheet", icon: FileSpreadsheet },
                { value: "txt", label: "Text", icon: FileText },
                { value: "file", label: "File", icon: Upload },
              ] as const).map(t => (
                <button
                  key={t.value}
                  onClick={() => setAddType(t.value as any)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-[12px] font-medium",
                    addType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  <t.icon className="h-5 w-5" />
                  {t.label}
                </button>
              ))}
            </div>

            {addType === "file" && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors mb-4"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-[14px] font-medium text-foreground">Drop files here or click to upload</p>
                <p className="text-[12px] text-muted-foreground">PDF, DOCX, CSV, XLSX, TXT — max 10MB</p>
              </div>
            )}

            {addType !== "file" && (
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-[13px] font-medium text-foreground block mb-1.5">Source Name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    placeholder="e.g. Company Website, FAQ Document"
                    className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  />
                </div>

                {(addType === "website" || addType === "google_sheet") && (
                  <div>
                    <label className="text-[13px] font-medium text-foreground block mb-1.5">
                      {addType === "website" ? "Website URL" : "Google Sheet URL"}
                    </label>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      placeholder={addType === "website" ? "https://yourcompany.com" : "https://docs.google.com/spreadsheets/..."}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                    />
                  </div>
                )}

                {addType === "txt" && (
                  <div>
                    <label className="text-[13px] font-medium text-foreground block mb-1.5">Content</label>
                    <textarea
                      value={textContent}
                      onChange={e => setTextContent(e.target.value)}
                      placeholder="Paste your company information, FAQs, product details..."
                      rows={6}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 border border-border rounded-lg py-2.5 text-[14px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              {addType !== "file" && (
                <button
                  onClick={handleAddSource}
                  disabled={adding}
                  className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 text-[14px] font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Source
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.md"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  )
}
