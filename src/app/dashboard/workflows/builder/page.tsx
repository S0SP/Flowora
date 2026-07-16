"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
 ArrowLeft, Pencil, Play, Zap, Search, Globe, Database,
 GitBranch, Bell, Mail, Phone, Clock, MessageSquare,
 X, CheckCircle, Save, Loader2, BookmarkPlus,
 LayoutTemplate, CircuitBoard, Activity, BarChart3, RefreshCw,
 CheckCircle2, XCircle, AlertCircle, TrendingUp, Plus, Trash2,
 ChevronDown, Eye, EyeOff, Copy, Sparkles, Settings2, Info
} from "lucide-react"
import { cn } from "@/lib/utils"
import { WorkflowCanvas, initialNodes, initialEdges } from "@/components/organisms/WorkflowCanvas"
import { ReactFlowProvider, useNodesState, useEdgesState, addEdge, getIncomers } from "@xyflow/react"
import { toast } from "sonner"
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@/lib/workflow-templates"
import { SARVAM_VOICES, GEMINI_VOICES } from "@/lib/voices"
import { format } from "date-fns"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"

// Types 
type WorkflowStatus = "draft" | "active" | "paused"
type NodeBranch = { id: string; label: string; type: "true" | "false" | "button" | "fallback" | "custom" }

const templateIconMap: Record<string, React.ElementType> = {
 drip_whatsapp: MessageSquare, reminder_automation: Bell,
 sheets_forms_whatsapp: Database, meta_lead_ads: Globe,
}

const nodeLibrary = [
  {
    category: "TRIGGERS",
    nodes: [
      { id: "google_sheet", icon: Database, color: "text-emerald-600", label: "Google Sheet", sublabel: "New Row Added", bg: "bg-emerald-50", border: "border-emerald-200" },
      { id: "webhook", icon: Globe, color: "text-sky-600", label: "Webhook", sublabel: "HTTP POST Trigger", bg: "bg-sky-50", border: "border-sky-200" },
    ]
  },
 {
 category: "ACTIONS",
 nodes: [
 { id: "whatsapp", icon: MessageSquare, color: "text-green-600", label: "WhatsApp", sublabel: "Send Template / Custom", bg: "bg-green-50", border: "border-green-200" },
 { id: "email", icon: Mail, color: "text-blue-600", label: "Email", sublabel: "Send Email via SMTP", bg: "bg-blue-50", border: "border-blue-200" },
 { id: "voice", icon: Phone, color: "text-purple-600", label: "Voice Call", sublabel: "AI Voice Agent", bg: "bg-purple-50", border: "border-purple-200" },
 { id: "crm", icon: Database, color: "text-teal-600", label: "Update CRM", sublabel: "Move lead stage", bg: "bg-teal-50", border: "border-teal-200" },
 ]
 },
 {
 category: "FLOW CONTROL",
 nodes: [
 { id: "delay", icon: Clock, color: "text-amber-600", label: "Delay", sublabel: "Wait before next step", bg: "bg-amber-50", border: "border-amber-200" },
 { id: "condition", icon: GitBranch, color: "text-rose-600", label: "Condition", sublabel: "If / Else branching", bg: "bg-rose-50", border: "border-rose-200" },
 { id: "reminder", icon: Bell, color: "text-yellow-600", label: "Reminder", sublabel: "Scheduled notification", bg: "bg-yellow-50", border: "border-yellow-200" },
 ]
 }
]

// Reusable form primitives 
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
 return (
 <label className="block text-[12px] font-semibold text-foreground mb-1.5 tracking-wide uppercase">
 {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
 </label>
 )
}

function FieldWrap({ children, hint }: { children: React.ReactNode; hint?: string }) {
 return (
 <div className="space-y-1.5">
 {children}
 {hint && <p className="text-[11px] text-gray-400 leading-relaxed">{hint}</p>}
 </div>
 )
}

const inputCls = "w-full bg-[var(--node-bg)] border border-[var(--node-border)] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all shadow-sm text-[var(--text-primary)]"
const selectCls = "w-full bg-[var(--node-bg)] border border-[var(--node-border)] rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all cursor-pointer shadow-sm appearance-none text-[var(--text-primary)]"

// Variable Token Picker 
const COMMON_VARS = ["{{phone}}", "{{name}}", "{{email}}", "{{order.id}}", "{{company}}", "{{city}}"]

function getJsonKeys(obj: any, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return []
  let keys: string[] = []
  Object.entries(obj).forEach(([key, val]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (val && typeof val === "object" && !Array.isArray(val)) {
      keys.push(...getJsonKeys(val, fullKey))
    } else {
      keys.push(fullKey)
    }
  })
  return keys
}

function getVarsFromNode(node: any): string[] {
  const vars: string[] = []
  const typeKey = node.data?.subtype ?? node.data?.type ?? node.data?.id ?? "trigger"
  const d = node.data ?? {}
  
  if (typeKey === "google_sheet") {
    if (d.phoneColumn) vars.push(`{{${d.phoneColumn}}}`)
    if (d.nameColumn) vars.push(`{{${d.nameColumn}}}`)
    if (d.emailColumn) vars.push(`{{${d.emailColumn}}}`)
    if (d.customColumns) {
      const cols = Array.isArray(d.customColumns)
        ? d.customColumns
        : String(d.customColumns).split(",").map(c => c.trim()).filter(Boolean)
      cols.forEach((col: any) => {
        const placeholder = `{{${col}}}`
        if (!vars.includes(placeholder)) vars.push(placeholder)
      })
    }
  } else if (typeKey === "webhook") {
    if (d.payloadFields && Array.isArray(d.payloadFields)) {
      d.payloadFields.forEach((f: string) => vars.push(`{{${f}}}`))
    } else if (d.sampleJson) {
      try {
        const obj = JSON.parse(d.sampleJson)
        const keys = getJsonKeys(obj)
        keys.forEach(k => vars.push(`{{${k}}}`))
      } catch {}
    }
    // Always fallbacks if empty
    if (vars.length === 0) {
      vars.push("{{phone}}", "{{name}}", "{{email}}")
    }
  } else if (typeKey === "form") {
    vars.push("{{name}}", "{{email}}", "{{phone}}", "{{company}}")
  } else if (typeKey === "trigger") {
    vars.push("{{phone}}", "{{name}}", "{{email}}")
  } else if (typeKey === "whatsapp") {
    vars.push("{{whatsapp.status}}")
  } else if (typeKey === "email") {
    vars.push("{{email.status}}")
  } else if (typeKey === "voice") {
    vars.push("{{call.status}}", "{{call.duration}}")
  }
  return vars
}

function VarPicker({ onInsert, availableVars = COMMON_VARS }: { onInsert: (v: string) => void; availableVars?: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[11px] text-primary font-medium hover:underline">
        <Sparkles className="h-3 w-3" /> Insert Variable
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-6 left-0 z-50 bg-white border border-border rounded-xl shadow-xl p-2 w-48 space-y-0.5 max-h-64 overflow-y-auto">
            {availableVars.map(v => (
              <button key={v} type="button"
                onClick={() => { onInsert(v); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[12px] font-mono text-foreground hover:bg-muted rounded-lg transition-colors">
                {v}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Section header 
function SectionHeader({ icon: Icon, title, subtitle, color }: {
 icon: React.ElementType; title: string; subtitle: string; color: string
}) {
 const textColor = color.replace("bg-", "text-")
 return (
 <div className="px-4 py-3 border-b border-[var(--node-border)] bg-[var(--panel-bg)]">
 <div className="flex items-center gap-3">
 <div className={cn("w-7 h-7 rounded-[6px] bg-[var(--canvas-bg)] border border-[var(--node-border)] flex items-center justify-center shrink-0", textColor)}>
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div>
 <h3 className="text-[14px] font-semibold text-[var(--text-primary)] leading-tight">{title}</h3>
 <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
 </div>
 </div>
 </div>
 )
}

// Config Panels 

// Google Sheet
function GoogleSheetPanel({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const initInterval = Number(data.pollInterval ?? "60")
  let initValue = 60
  let initUnit = "seconds"
  if (initInterval % 3600 === 0) {
    initValue = initInterval / 3600
    initUnit = "hours"
  } else if (initInterval % 60 === 0) {
    initValue = initInterval / 60
    initUnit = "minutes"
  } else {
    initValue = initInterval
    initUnit = "seconds"
  }

  const [form, setForm] = useState({
    sheetUrl: data.sheetUrl ?? "",
    sheetName: data.sheetName ?? "",
    phoneColumn: data.phoneColumn ?? "phone",
    nameColumn: data.nameColumn ?? "name",
    emailColumn: data.emailColumn ?? "email",
    triggerOn: data.triggerOn ?? "new",
    pollValue: initValue,
    pollUnit: initUnit,
    customColumns: data.customColumns ?? ""
  })

  const [fetchingHeaders, setFetchingHeaders] = useState(false)
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>(
    data.customColumns 
      ? (Array.isArray(data.customColumns) ? data.customColumns : String(data.customColumns).split(",").map((c: string) => c.trim()).filter(Boolean))
      : []
  )

  const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

  const fetchHeaders = async () => {
    if (!form.sheetUrl) {
      toast.error("Please enter a Google Sheet URL first")
      return
    }
    setFetchingHeaders(true)
    try {
      const res = await fetch(`/api/workflows/fetch-sheet-headers?url=${encodeURIComponent(form.sheetUrl)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Failed to fetch columns")
      
      const cols = d.headers ?? []
      setDetectedHeaders(cols)
      
      const lowerCols = cols.map((c: string) => c.toLowerCase())
      const phoneIdx = lowerCols.findIndex((c: string) => c.includes("phone") || c.includes("mobile") || c.includes("whatsapp") || c.includes("number"))
      const nameIdx = lowerCols.findIndex((c: string) => c.includes("name") || c.includes("full") || c.includes("lead"))
      const emailIdx = lowerCols.findIndex((c: string) => c.includes("email") || c.includes("mail"))
      
      setForm(p => {
        const next = { ...p }
        if (phoneIdx !== -1) next.phoneColumn = cols[phoneIdx]
        if (nameIdx !== -1) next.nameColumn = cols[nameIdx]
        if (emailIdx !== -1) next.emailColumn = cols[emailIdx]
        next.customColumns = cols.join(", ")
        return next
      })
      
      toast.success(`Successfully fetched ${cols.length} column headers!`)
    } catch (err: any) {
      toast.error(err.message || "An error occurred while fetching sheet headers")
    } finally {
      setFetchingHeaders(false)
    }
  }

  const handleSaveClick = () => {
    const seconds = form.pollUnit === "seconds" 
      ? Number(form.pollValue) 
      : form.pollUnit === "minutes" 
        ? Number(form.pollValue) * 60 
        : Number(form.pollValue) * 3600
    
    onSave({
      sheetUrl: form.sheetUrl,
      sheetName: form.sheetName,
      phoneColumn: form.phoneColumn,
      nameColumn: form.nameColumn,
      emailColumn: form.emailColumn,
      triggerOn: form.triggerOn,
      pollInterval: String(seconds),
      customColumns: form.customColumns
    })
  }

  return (
    <>
      <SectionHeader icon={Database} title="Google Sheet Trigger" subtitle="Fires when a new row is added" color="bg-emerald-600" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-fadeIn">
        <FieldWrap hint="Paste the full Google Sheets URL. Make sure it's set to 'Anyone with link can view'.">
          <Label required>Sheet URL</Label>
          <div className="flex gap-2">
            <input className={cn(inputCls, "flex-1")} placeholder="https://docs.google.com/spreadsheets/d/..." value={form.sheetUrl} onChange={f("sheetUrl")} />
            <button type="button" onClick={fetchHeaders} disabled={fetchingHeaders} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[12px] font-bold shrink-0 flex items-center gap-1.5 transition-colors">
              {fetchingHeaders ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch Columns"}
            </button>
          </div>
        </FieldWrap>

        {detectedHeaders.length > 0 && (
          <div className="space-y-1.5">
            <Label>Detected Column Variables</Label>
            <div className="flex flex-wrap gap-1.5 bg-muted/40 border border-border rounded-lg p-2.5 max-h-32 overflow-y-auto">
              {detectedHeaders.map(h => (
                <span key={h} className="text-[10px] font-semibold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                  {`{{${h}}}`}
                </span>
              ))}
            </div>
          </div>
        )}

        <FieldWrap>
          <Label>Sheet Tab Name</Label>
          <input className={inputCls} placeholder="Sheet1" value={form.sheetName} onChange={f("sheetName")} />
        </FieldWrap>

        <div className="grid grid-cols-2 gap-3">
          <FieldWrap>
            <Label required>Phone Column</Label>
            <input className={inputCls} placeholder="phone" value={form.phoneColumn} onChange={f("phoneColumn")} />
          </FieldWrap>
          <FieldWrap>
            <Label>Name Column</Label>
            <input className={inputCls} placeholder="name" value={form.nameColumn} onChange={f("nameColumn")} />
          </FieldWrap>
        </div>

        <FieldWrap>
          <Label>Email Column</Label>
          <input className={inputCls} placeholder="email" value={form.emailColumn} onChange={f("emailColumn")} />
        </FieldWrap>

        <FieldWrap hint="Additional column headers you want to use downstream (comma-separated)">
          <Label>Custom Columns / Headers</Label>
          <input className={inputCls} placeholder="Age, Budget, Status" value={form.customColumns} onChange={f("customColumns")} />
        </FieldWrap>

        <FieldWrap>
          <Label>Trigger On</Label>
          <div className="grid grid-cols-2 gap-2">
            {[["new", "New Row Added"], ["updated", "Row Updated"]].map(([v, l]) => (
              <label key={v} className={cn("flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-all", form.triggerOn === v ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-emerald-200")}>
                <input type="radio" name="triggerOn" value={v} checked={form.triggerOn === v} onChange={f("triggerOn")} className="accent-emerald-600" />
                <span className="text-[12px] font-medium">{l}</span>
              </label>
            ))}
          </div>
        </FieldWrap>

        <div className="grid grid-cols-2 gap-3">
          <FieldWrap>
            <Label>Poll Interval Value</Label>
            <input type="number" min={1} className={inputCls} value={form.pollValue} onChange={f("pollValue")} />
          </FieldWrap>
          <FieldWrap>
            <Label>Poll Interval Unit</Label>
            <select className={selectCls} value={form.pollUnit} onChange={f("pollUnit")}>
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </FieldWrap>
        </div>
      </div>
      <div className="p-4 border-t border-border bg-muted/20">
        <button onClick={handleSaveClick} className="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors text-[13px] shadow-sm">
          Save Trigger Config
        </button>
      </div>
    </>
  )
}

// WhatsApp
function WhatsAppPanel({ data, onSave, availableVars }: { data: any; onSave: (d: any) => void; availableVars?: string[] }) {
  const [mode, setMode] = useState<"template" | "custom">(data.mode ?? "template")
  const [templateName, setTemplateName] = useState(data.templateName ?? "")
  const [templateLanguage, setTemplateLang] = useState(data.templateLanguage ?? "en")
  const [message, setMessage] = useState(data.message ?? "")
  const [branches, setBranches] = useState<NodeBranch[]>(data.branches ?? [])
  const [templates, setTemplates] = useState<any[]>([])
  const [loadingTpls, setLoadingTpls] = useState(false)
  const [fallbackMode, setFallbackMode] = useState<"ai" | "message">(data.fallbackMode ?? "ai")
  const [fallbackMsg, setFallbackMsg] = useState(data.fallbackMessage ?? "")
  const [variables, setVariables] = useState<Record<string, string>>(data.variables ?? {})
  const msgRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoadingTpls(true)
    fetch("/api/templates").then(r => r.json()).then(d => {
      setTemplates(Array.isArray(d) ? d : d.templates ?? [])
    }).catch(() => { }).finally(() => setLoadingTpls(false))
  }, [])

  const selectedTemplateText = useMemo(() => {
    const tpl = templates.find((t: any) => t.name === templateName)
    if (!tpl || !tpl.components) return ""
    const bodyComp = tpl.components.find((c: any) => c.type === "BODY")
    return bodyComp?.text || ""
  }, [templates, templateName])

  const templatePlaceholders = useMemo(() => {
    const matches = selectedTemplateText.match(/\{\{(\d+)\}\}/g) || []
    return Array.from(new Set(matches))
      .map((m: any) => String(m).replace(/\D/g, ""))
      .sort((a: any, b: any) => parseInt(a) - parseInt(b))
  }, [selectedTemplateText])

  const onTemplateChange = (name: string) => {
    setTemplateName(name)
    const tpl = templates.find((t: any) => t.name === name)
    if (tpl?.components) {
      const buttonComp = tpl.components.find((c: any) => c.type === "BUTTONS")
      if (buttonComp?.buttons) {
        const newBranches: NodeBranch[] = buttonComp.buttons.map((b: any, i: number) => ({
          id: `btn_${i}_${b.text?.replace(/\s+/g, "_").toLowerCase()}`,
          label: b.text,
          type: "button"
        }))
        newBranches.push({ id: "fallback", label: "Any other reply", type: "fallback" })
        setBranches(newBranches)
      } else {
        setBranches([])
      }
    }
  }

  const insertVar = (v: string) => {
    if (!msgRef.current) return
    const s = msgRef.current.selectionStart, e = msgRef.current.selectionEnd
    const val = message.slice(0, s) + v + message.slice(e)
    setMessage(val)
    setTimeout(() => { msgRef.current?.setSelectionRange(s + v.length, s + v.length); msgRef.current?.focus() }, 0)
  }

  const addCustomBranch = () => setBranches(p => [...p, { id: `custom_${Date.now()}`, label: "Custom Option", type: "custom" }])
  const removeBranch = (id: string) => setBranches(p => p.filter(b => b.id !== id))
  const updateBranch = (id: string, label: string) => setBranches(p => p.map(b => b.id === id ? { ...b, label } : b))

  const preview = useMemo(() =>
    message.replace(/\{\{([^}]+)\}\}/g, (_: string, p: string) => `[${p.split(".").pop()?.toUpperCase() ?? p}]`),
    [message]
  )

  const handleSaveClick = () => {
    let previewText = ""
    if (mode === "template") {
      previewText = selectedTemplateText.replace(/\{\{(\d+)\}\}/g, (_: string, num: string) => {
        const mapped = variables[num] ?? `{{${num}}}`
        return mapped.replace(/\{\{([^}]+)\}\}/g, (__: string, name: string) => `[${name.split(".").pop()?.toUpperCase() ?? name}]`)
      })
    } else {
      previewText = preview
    }

    onSave({
      mode,
      templateName,
      templateLanguage,
      message,
      branches,
      fallbackMode,
      fallbackMessage: fallbackMsg,
      previewText,
      variables
    })
  }

  return (
    <>
      <SectionHeader icon={MessageSquare} title="WhatsApp Message" subtitle="Send a template or custom message" color="bg-green-500" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-fadeIn">
        <div className="flex rounded-xl overflow-hidden border border-border">
          {(["template", "custom"] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cn("flex-1 py-2 text-[12px] font-bold transition-all capitalize",
                mode === m ? "bg-green-500 text-white" : "bg-white text-muted-foreground hover:bg-muted"
              )}>
              {m === "template" ? " Meta Template" : " Custom Message"}
            </button>
          ))}
        </div>

        {mode === "template" ? (
          <>
            <FieldWrap hint="Only approved templates appear here.">
              <Label required>Select Template</Label>
              {loadingTpls ? (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-[12px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading templates…
                </div>
              ) : (
                <select className={selectCls} value={templateName} onChange={e => onTemplateChange(e.target.value)}>
                  <option value="">— Select a template —</option>
                  {templates.map((t: any) => (
                    <option key={t.name} value={t.name}>{t.display_name ?? t.name} ({t.language})</option>
                  ))}
                </select>
              )}
            </FieldWrap>
            <FieldWrap>
              <Label>Language Code</Label>
              <input className={inputCls} value={templateLanguage} onChange={e => setTemplateLang(e.target.value)} placeholder="en" />
            </FieldWrap>

            {selectedTemplateText && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-green-700 mb-1">Template Message Body</p>
                <p className="text-[11px] text-green-600 font-mono leading-relaxed whitespace-pre-wrap">{selectedTemplateText}</p>
              </div>
            )}

            {templatePlaceholders.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-[12px] font-bold text-foreground">Map Template Variables</h4>
                {templatePlaceholders.map(num => (
                  <FieldWrap key={num}>
                    <div className="flex items-center justify-between mb-1">
                      <Label required>{`Parameter {{${num}}}`}</Label>
                      <VarPicker 
                        onInsert={(v) => setVariables(p => ({ ...p, [num]: (p[num] ?? "") + v }))} 
                        availableVars={availableVars} 
                      />
                    </div>
                    <input 
                      className={inputCls} 
                      placeholder={`Enter text or select a variable`} 
                      value={variables[num] ?? ""} 
                      onChange={e => setVariables(p => ({ ...p, [num]: e.target.value }))} 
                    />
                  </FieldWrap>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <FieldWrap hint="Use {{variable}} syntax to insert dynamic values.">
              <div className="flex items-center justify-between mb-1.5">
                <Label required>Message Text</Label>
                <VarPicker onInsert={insertVar} availableVars={availableVars} />
              </div>
              <textarea ref={msgRef} className={cn(inputCls, "min-h-[100px] resize-y")} placeholder="Hi {{name}}, your order {{order.id}} is ready!" value={message} onChange={e => setMessage(e.target.value)} />
            </FieldWrap>

            {message && (
              <div>
                <Label>Live Preview</Label>
                <div className="bg-[#efeae2] rounded-xl p-3">
                  <div className="bg-[#d9fdd3] rounded-[8px_8px_8px_0] px-3 py-2 text-[12px] text-[#111b21] leading-relaxed shadow-sm max-w-[90%]">
                    {preview}
                  </div>
                  <div className="text-right text-[10px] text-[#667781] mt-1">10:30 </div>
                </div>
              </div>
            )}
          </>
        )}

        {branches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Reply Branches</Label>
              <button type="button" onClick={addCustomBranch} className="flex items-center gap-1 text-[11px] text-primary font-medium hover:underline">
                <Plus className="h-3 w-3" /> Add Branch
              </button>
            </div>
            <div className="space-y-2">
              {branches.map(b => (
                <div key={b.id} className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border",
                  b.type === "button" ? "bg-blue-50 border-blue-200" :
                    b.type === "fallback" ? "bg-gray-50 border-gray-200" : "bg-purple-50 border-purple-200"
                )}>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground w-14 shrink-0">
                    {b.type === "button" ? "BTN" : b.type === "fallback" ? "ELSE" : "CUSTOM"}
                  </span>
                  <input
                    className="flex-1 bg-transparent text-[12px] font-medium focus:outline-none"
                    value={b.label}
                    onChange={e => updateBranch(b.id, e.target.value)}
                    disabled={b.type === "fallback"}
                  />
                  {b.type !== "true" && b.type !== "false" && b.type !== "fallback" && (
                    <button type="button" onClick={() => removeBranch(b.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {branches.some(b => b.type === "fallback") && (
          <div className="border border-dashed border-border rounded-xl p-3 space-y-3">
            <Label>Fallback Reply Action</Label>
            <div className="grid grid-cols-2 gap-2">
              {[["ai", " Route to AI"], ["message", " Custom Reply"]].map(([v, l]) => (
                <label key={v} className={cn("flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-[11px] font-semibold",
                  fallbackMode === v ? "border-green-500 bg-green-50 text-green-700" : "border-border text-muted-foreground hover:border-green-200"
                )}>
                  <input type="radio" name="fallback" value={v} checked={fallbackMode === v} onChange={() => setFallbackMode(v as any)} className="hidden" />
                  {l}
                </label>
              ))}
            </div>
            {fallbackMode === "message" && (
              <textarea className={cn(inputCls, "min-h-[60px]")} placeholder="Sorry, please tap one of the buttons above." value={fallbackMsg} onChange={e => setFallbackMsg(e.target.value)} />
            )}
          </div>
        )}
      </div>
      <div className="p-4 border-t border-border bg-muted/20">
        <button onClick={handleSaveClick}
          className="w-full py-2.5 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition-colors text-[13px] shadow-sm">
          Save WhatsApp Node
        </button>
      </div>
    </>
  )
}

// Email
function EmailPanel({ data, onSave, availableVars }: { data: any; onSave: (d: any) => void; availableVars?: string[] }) {
 const [form, setForm] = useState({
 toEmail: data.toEmail ?? "{{email}}",
 subject: data.subject ?? "",
 html: data.html ?? "<p>Hi {{name}},</p><p>Thanks for your interest!</p>",
 fromName: data.fromName ?? "Flowra",
 fromEmail: data.fromEmail ?? "",
 })
 const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))
 return (
 <>
 <SectionHeader icon={Mail} title="Send Email" subtitle="Send via configured SMTP" color="bg-blue-500" />
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 <FieldWrap>
 <Label required>To Email</Label>
 <input className={inputCls} value={form.toEmail} onChange={f("toEmail")} placeholder="{{email}}" />
 </FieldWrap>
 <div className="grid grid-cols-2 gap-3">
 <FieldWrap>
 <Label>From Name</Label>
 <input className={inputCls} value={form.fromName} onChange={f("fromName")} />
 </FieldWrap>
 <FieldWrap>
 <Label>From Email</Label>
 <input className={inputCls} value={form.fromEmail} onChange={f("fromEmail")} placeholder="hello@you.com" />
 </FieldWrap>
 </div>
 <FieldWrap>
 <Label required>Subject</Label>
 <input className={inputCls} value={form.subject} onChange={f("subject")} placeholder="Hi {{name}}, your spot is confirmed!" />
 </FieldWrap>
 <FieldWrap hint="HTML supported. Use {{variable}} for dynamic content.">
 <div className="flex items-center justify-between mb-1.5">
 <Label required>Body (HTML)</Label>
 <VarPicker onInsert={(v) => setForm(p => ({ ...p, html: p.html + v }))} availableVars={availableVars} />
 </div>
 <textarea className={cn(inputCls, "min-h-[140px] font-mono text-[12px] resize-y")} value={form.html} onChange={f("html")} />
 </FieldWrap>
 </div>
 <div className="p-4 border-t border-border bg-muted/20">
 <button onClick={() => onSave(form)} className="w-full py-2.5 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors text-[13px] shadow-sm">
 Save Email Node
 </button>
 </div>
 </>
 )
}

// Voice Agent
function VoicePanel({ data, onSave, availableVars }: { data: any; onSave: (d: any) => void; availableVars?: string[] }) {
 const [settings, setSettings] = useState<any>(null)
 const [loading, setLoading] = useState(true)
 const [form, setForm] = useState({
 voiceId: data.voiceId ?? "anushka",
 agentType: data.agentType ?? "livekit",
 systemPrompt: data.systemPrompt ?? "",
 callObjective: data.callObjective ?? "",
 toPhone: data.toPhone ?? "{{phone}}",
 })
 const [presets, setPresets] = useState<any[]>([])
 const [selectedPresetId, setSelectedPresetId] = useState<string>("")

 const f = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }))

 useEffect(() => {
 fetch("/api/voice/settings").then(r => r.json()).then(d => {
 const s = d.settings
 if (s) {
 setSettings(s)
 setForm(p => ({
 ...p,
 voiceId: p.voiceId || s.voice_id || "anushka",
 agentType: p.agentType || s.agent_type || "livekit",
 systemPrompt: p.systemPrompt || s.system_prompt || "",
 callObjective: p.callObjective || s.call_objective || "",
 }))
 }
 }).catch(() => { }).finally(() => setLoading(false))

 fetch("/api/voice/agents").then(r => r.json()).then(d => {
 if (d.agents) setPresets(d.agents)
 }).catch(() => { })
 }, [])

 const handleSelectPreset = (presetId: string) => {
   setSelectedPresetId(presetId)
   if (!presetId) return
   const preset = presets.find(p => p.id === presetId)
   if (preset) {
     setForm(p => ({
       ...p,
       agentType: preset.agent_type || "livekit",
       voiceId: preset.voice_id || "anushka",
       systemPrompt: preset.system_prompt || "",
       callObjective: preset.config?.call_objective || preset.first_message || "",
     }))
     toast.success(`Loaded preset: ${preset.name} ✓`)
   }
 }

 const availableVoices = typeof SARVAM_VOICES !== "undefined" ? SARVAM_VOICES : [
 { id: "anushka", name: "Anushka", lang: "Hinglish" },
 { id: "manisha", name: "Manisha", lang: "Hindi" },
 { id: "sophia", name: "Sophia", lang: "English" },
 { id: "ryan", name: "Ryan", lang: "English" },
 ]

 const voices = form.agentType === "gemini" ? GEMINI_VOICES : SARVAM_VOICES;

 return (
 <>
 <SectionHeader icon={Phone} title="AI Voice Call" subtitle="Automated outbound call with AI" color="bg-purple-600" />
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 {loading && (
 <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg text-[12px] text-purple-700">
 <Loader2 className="h-3 w-3 animate-spin" /> Loading voice settings…
 </div>
 )}
 {settings && (
 <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
 <p className="text-[11px] font-semibold text-purple-700 mb-1">Loaded from Voice Agent Settings</p>
 <p className="text-[11px] text-purple-600">Hours: {settings.calling_hours_start}–{settings.calling_hours_end} · Max attempts: {settings.max_call_attempts}</p>
 </div>
 )}
 <FieldWrap>
 <Label required>To Phone</Label>
 <input className={inputCls} value={form.toPhone} onChange={f("toPhone")} placeholder="{{phone}}" />
 </FieldWrap>
 <FieldWrap>
 <Label>Load Preset Settings</Label>
 <select className={selectCls} value={selectedPresetId} onChange={(e) => handleSelectPreset(e.target.value)}>
 <option value="">-- Select a Preset to Prefill --</option>
 {presets.map((p: any) => (
 <option key={p.id} value={p.id}>{p.name} ({p.agent_type === "gemini" ? "Gemini" : "LiveKit"})</option>
 ))}
 </select>
 </FieldWrap>
 <FieldWrap>
 <Label>Agent Engine</Label>
 <select className={selectCls} value={form.agentType} onChange={(e) => {
   const val = e.target.value;
   setForm(p => ({
     ...p,
     agentType: val,
     voiceId: val === "gemini" ? "Zephyr" : "anushka"
   }));
 }}>
 <option value="livekit">LiveKit + Sarvam TTS (Hindi/English)</option>
 <option value="gemini">Gemini Live (Multilingual)</option>
 </select>
 </FieldWrap>
 <FieldWrap>
 <Label required>Voice</Label>
 <select className={selectCls} value={form.voiceId} onChange={f("voiceId")}>
 {Array.isArray(voices) && voices.map((v: any) => (
 <option key={v.id ?? v} value={v.id ?? v}>{v.name ?? v} {("style" in v) ? `· ${v.style}` : ""}</option>
 ))}
 </select>
 </FieldWrap>
 <FieldWrap hint="Define what the AI agent should say and do on the call.">
 <div className="flex items-center justify-between mb-1.5">
 <Label required>System Prompt</Label>
 <VarPicker onInsert={(v) => setForm(p => ({ ...p, systemPrompt: p.systemPrompt + v }))} availableVars={availableVars} />
 </div>
 <textarea className={cn(inputCls, "min-h-[100px] resize-y")} value={form.systemPrompt} onChange={f("systemPrompt")} placeholder="You are a friendly sales agent calling about..." />
 </FieldWrap>
 <FieldWrap>
 <Label>Call Objective</Label>
 <textarea className={cn(inputCls, "min-h-[60px] resize-y")} value={form.callObjective} onChange={f("callObjective")} placeholder="Book a demo, qualify the lead, answer questions..." />
 </FieldWrap>
 <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
 <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
 <p className="text-[11px] text-amber-700 leading-relaxed">~15 credits/min · Avg 3 min call = ~45 credits per contact</p>
 </div>
 </div>
 <div className="p-4 border-t border-border bg-muted/20">
 <button onClick={() => onSave(form)} className="w-full py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors text-[13px] shadow-sm">
 Save Voice Node
 </button>
 </div>
 </>
 )
}

// Delay
function DelayPanel({ data, onSave }: { data: any; onSave: (d: any) => void }) {
 const [days, setDays] = useState(data.delayDays ?? 0)
 const [hours, setHours] = useState(data.delayHours ?? 0)
 const [mins, setMins] = useState(data.delayMinutes ?? 0)
 const totalMins = days * 1440 + hours * 60 + mins
 const humanize = () => {
 const parts = []
 if (days) parts.push(`${days} day${days !== 1 ? "s" : ""}`)
 if (hours) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`)
 if (mins) parts.push(`${mins} min${mins !== 1 ? "s" : ""}`)
 return parts.join(", ") || "0 minutes"
 }
 return (
 <>
 <SectionHeader icon={Clock} title="Time Delay" subtitle="Pause before the next step" color="bg-amber-500" />
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 <div className="grid grid-cols-3 gap-3">
 {[["Days", days, setDays], ["Hours", hours, setHours], ["Minutes", mins, setMins]].map(([label, val, setter]: any) => (
 <FieldWrap key={label}>
 <Label>{label}</Label>
 <input type="number" min={0} className={inputCls} value={val} onChange={e => setter(Math.max(0, Number(e.target.value)))} />
 </FieldWrap>
 ))}
 </div>
 <div className="bg-[var(--canvas-bg)] border border-[var(--node-border)] rounded-md p-4 text-center shadow-sm">
 <Clock className="h-5 w-5 text-[var(--text-tertiary)] mx-auto mb-1.5" />
 <p className="text-[14px] font-bold text-[var(--text-primary)]"> {humanize()}</p>
 <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">= {totalMins.toLocaleString()} total minutes</p>
 </div>
 <div className="bg-[var(--canvas-bg)] border border-[var(--node-border)] rounded-md p-3 flex gap-2 shadow-sm">
 <Info className="h-4 w-4 text-[var(--text-secondary)] shrink-0 mt-0.5" />
 <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">Delays over 1 minute are handled by QStash for reliable delivery across server restarts.</p>
 </div>
 </div>
 <div className="p-4 border-t border-border bg-muted/20">
 <button onClick={() => onSave({ delayDays: days, delayHours: hours, delayMinutes: mins, label: `Wait ${humanize()}` })}
 className="w-full py-2.5 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors text-[13px] shadow-sm">
 Save Delay
 </button>
 </div>
 </>
 )
}

// Condition
function ConditionPanel({ data, onSave }: { data: any; onSave: (d: any) => void }) {
 const [field, setField] = useState(data.field ?? "")
 const [operator, setOperator] = useState(data.operator ?? "equals")
 const [value, setValue] = useState(data.value ?? "")
 const [branches, setBranches] = useState<NodeBranch[]>(data.branches ?? [
 { id: "true", label: "True ", type: "true" },
 { id: "false", label: "False ", type: "false" },
 { id: "fallback", label: "Fallback (else)", type: "fallback" },
 ])

 const addBranch = () => setBranches(p => [...p, { id: `branch_${Date.now()}`, label: "Custom Branch", type: "custom" }])
 const removeBranch = (id: string) => setBranches(p => p.filter(b => !["true", "false", "fallback"].includes(b.id) ? b.id !== id : true))
 const updateLabel = (id: string, label: string) => setBranches(p => p.map(b => b.id === id ? { ...b, label } : b))

 const fieldOptions = ["phone", "email", "name", "lead_source", "stage", "city", "country", "score", "custom_field"]
 const operatorOptions = [
 { v: "equals", l: "equals (==)" },
 { v: "not_equals", l: "does not equal (!=)" },
 { v: "contains", l: "contains" },
 { v: "starts_with", l: "starts with" },
 { v: "not_empty", l: "is not empty" },
 { v: "is_empty", l: "is empty" },
 { v: "gt", l: "greater than (>)" },
 { v: "lt", l: "less than (<)" },
 ]

 return (
 <>
 <SectionHeader icon={GitBranch} title="Condition (If / Else)" subtitle="Branch the flow based on logic" color="bg-rose-500" />
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
 <p className="text-[11px] text-rose-700 font-semibold mb-1">If this condition is true:</p>
 <p className="text-[11px] text-rose-600">
 <code className="font-mono">{field || "field"}</code>
 {" "}<span className="italic">{operatorOptions.find(o => o.v === operator)?.l ?? operator}</span>
 {" "}<code className="font-mono">{["not_empty", "is_empty"].includes(operator) ? "" : value || "value"}</code>
 </p>
 </div>

 <FieldWrap>
 <Label required>Field to Check</Label>
 <div className="flex gap-2">
 <select className={cn(selectCls, "flex-1")} value={field} onChange={e => setField(e.target.value)}>
 <option value="">— Select field —</option>
 {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
 </select>
 </div>
 <input className={cn(inputCls, "mt-2")} placeholder="Or type a custom field name" value={field} onChange={e => setField(e.target.value)} />
 </FieldWrap>

 <FieldWrap>
 <Label required>Operator</Label>
 <select className={selectCls} value={operator} onChange={e => setOperator(e.target.value)}>
 {operatorOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
 </select>
 </FieldWrap>

 {!["not_empty", "is_empty"].includes(operator) && (
 <FieldWrap>
 <Label required>Value</Label>
 <input className={inputCls} value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. Facebook Ads" />
 </FieldWrap>
 )}

 {/* Branches editor */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <Label>Output Branches</Label>
 <button type="button" onClick={addBranch} className="flex items-center gap-1 text-[11px] text-primary font-medium hover:underline">
 <Plus className="h-3 w-3" /> Add Branch
 </button>
 </div>
 <div className="space-y-2">
 {branches.map(b => (
 <div key={b.id} className={cn(
 "flex items-center gap-2 px-3 py-2 rounded-lg border",
 b.type === "true" ? "bg-green-50 border-green-200" :
 b.type === "false" ? "bg-red-50 border-red-200" :
 b.type === "fallback" ? "bg-gray-50 border-gray-200" : "bg-purple-50 border-purple-200"
 )}>
 <span className={cn("text-[9px] font-bold uppercase tracking-widest w-12 shrink-0",
 b.type === "true" ? "text-green-600" : b.type === "false" ? "text-red-600" : b.type === "fallback" ? "text-gray-500" : "text-purple-600"
 )}>
 {b.type === "custom" ? "PATH" : b.type.toUpperCase()}
 </span>
 <input
 className="flex-1 bg-transparent text-[12px] font-medium focus:outline-none"
 value={b.label}
 onChange={e => updateLabel(b.id, e.target.value)}
 disabled={["true", "false", "fallback"].includes(b.type)}
 />
 {b.type === "custom" && (
 <button type="button" onClick={() => removeBranch(b.id)} className="text-muted-foreground hover:text-red-500">
 <Trash2 className="h-3 w-3" />
 </button>
 )}
 </div>
 ))}
 </div>
 </div>
 </div>
 <div className="p-4 border-t border-border bg-muted/20">
 <button onClick={() => onSave({ field, operator, value, branches })}
 className="w-full py-2.5 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors text-[13px] shadow-sm">
 Save Condition
 </button>
 </div>
 </>
 )
}

// CRM
function CRMPanel({ data, onSave }: { data: any; onSave: (d: any) => void }) {
 const [stage, setStage] = useState(data.stage ?? "new_lead")
 const [dealValue, setDealValue] = useState(data.dealValue ?? "")
 const [tags, setTags] = useState(data.tags ?? "")
 const stages = [
 { v: "new_lead", l: "🟡 New Lead", color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
 { v: "contacted", l: " Contacted", color: "bg-blue-50 border-blue-200 text-blue-700" },
 { v: "qualified", l: "🟢 Qualified", color: "bg-green-50 border-green-200 text-green-700" },
 { v: "proposal", l: "🟣 Proposal", color: "bg-purple-50 border-purple-200 text-purple-700" },
 { v: "negotiation", l: "🟠 Negotiation", color: "bg-orange-50 border-orange-200 text-orange-700" },
 { v: "won", l: " Won", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
 { v: "lost", l: " Lost", color: "bg-red-50 border-red-200 text-red-700" },
 ]
 return (
 <>
 <SectionHeader icon={Database} title="Update CRM" subtitle="Move lead to a pipeline stage" color="bg-teal-600" />
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 <FieldWrap>
 <Label required>Target Stage</Label>
 <div className="grid grid-cols-1 gap-2">
 {stages.map(s => (
 <label key={s.v} className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-all",
 stage === s.v ? "border-teal-500 bg-teal-50" : "border-border hover:border-teal-200"
 )}>
 <input type="radio" name="stage" value={s.v} checked={stage === s.v} onChange={() => setStage(s.v)} className="accent-teal-600" />
 <span className="text-[12px] font-semibold">{s.l}</span>
 </label>
 ))}
 </div>
 </FieldWrap>
 <FieldWrap>
 <Label>Deal Value (optional)</Label>
 <input type="number" className={inputCls} value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="0" />
 </FieldWrap>
 <FieldWrap hint="Comma-separated tags to apply">
 <Label>Add Tags</Label>
 <input className={inputCls} value={tags} onChange={e => setTags(e.target.value)} placeholder="webinar, facebook-ad, hot-lead" />
 </FieldWrap>
 </div>
 <div className="p-4 border-t border-border bg-muted/20">
 <button onClick={() => onSave({ stage, dealValue, tags })}
 className="w-full py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors text-[13px] shadow-sm">
 Save CRM Update
 </button>
 </div>
 </>
 )
}

// Webhook
function WebhookPanel({ data, onSave, workflowId }: { data: any; onSave: (d: any) => void; workflowId: string | null }) {
  const url = workflowId 
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/workflows/trigger?workflowId=${workflowId}`
    : "Save workflow first to generate Webhook URL"

  const [method, setMethod] = useState(data.method ?? "POST")
  const [headers, setHeaders] = useState(data.headers ?? "{}")
  const [sampleJson, setSampleJson] = useState(data.sampleJson ?? `{\n  "phone": "+14155552671",\n  "name": "John Doe",\n  "email": "john@example.com"\n}`)
  const [detectedFields, setDetectedFields] = useState<string[]>(data.payloadFields ?? ["phone", "name", "email"])

  const copy = () => {
    if (!workflowId) {
      toast.error("Please save the workflow first to generate a valid Webhook URL")
      return
    }
    navigator.clipboard.writeText(url)
    toast.success("Webhook URL copied to clipboard!")
  }

  // Prettify / Validate JSON
  const handlePrettify = () => {
    try {
      const parsed = JSON.parse(sampleJson)
      setSampleJson(JSON.stringify(parsed, null, 2))
      const keys = getJsonKeys(parsed)
      setDetectedFields(keys)
      toast.success("JSON verified and fields extracted!")
    } catch {
      toast.error("Invalid JSON format")
    }
  }

  const handleSaveClick = () => {
    let fields: string[] = []
    if (sampleJson.trim()) {
      try {
        const parsed = JSON.parse(sampleJson)
        fields = getJsonKeys(parsed)
      } catch {
        toast.error("Invalid JSON format. Please verify it before saving.")
        return
      }
    }
    onSave({ method, headers, sampleJson, payloadFields: fields })
  }

  return (
    <>
      <SectionHeader icon={Globe} title="Webhook Trigger" subtitle="Receive HTTP requests to start flow" color="bg-sky-600" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-fadeIn">
        <FieldWrap hint={workflowId ? "Copy this URL and configure your webhook source." : "Save the workflow first to generate the webhook trigger URL."}>
          <Label>Your Webhook URL</Label>
          <div className="bg-muted rounded-xl p-3 flex items-center gap-2">
            <code className="text-[11px] flex-1 truncate text-foreground font-mono">{url}</code>
            <button type="button" onClick={copy} className="shrink-0 p-1.5 bg-white border border-border rounded-lg hover:bg-sky-50 transition-colors">
              <Copy className="h-3.5 w-3.5 text-sky-600" />
            </button>
          </div>
        </FieldWrap>

        <FieldWrap>
          <Label>Method</Label>
          <select className={selectCls} value={method} onChange={e => setMethod(e.target.value)}>
            <option value="POST">POST</option>
            <option value="GET">GET</option>
          </select>
        </FieldWrap>

        <FieldWrap hint="Optional custom headers as JSON object">
          <Label>Headers (JSON)</Label>
          <textarea className={cn(inputCls, "font-mono text-[12px] min-h-[60px]")} value={headers} onChange={e => setHeaders(e.target.value)} placeholder='{"X-Api-Key": "secret"}' />
        </FieldWrap>

        <FieldWrap hint="Paste a sample JSON payload from your source system to extract dynamic variables.">
          <div className="flex items-center justify-between mb-1">
            <Label>Sample JSON Payload</Label>
            <button type="button" onClick={handlePrettify} className="text-[10px] text-sky-600 font-bold hover:underline">
              Verify & Format
            </button>
          </div>
          <textarea className={cn(inputCls, "font-mono text-[12px] min-h-[140px] resize-y")} value={sampleJson} onChange={e => setSampleJson(e.target.value)} placeholder='{"phone": "+1...", "name": "John"}' />
        </FieldWrap>

        {detectedFields.length > 0 && (
          <div className="space-y-1.5">
            <Label>Extracted Payload Variables</Label>
            <div className="flex flex-wrap gap-1.5 bg-muted/40 border border-border rounded-lg p-2.5 max-h-32 overflow-y-auto">
              {detectedFields.map(f => (
                <span key={f} className="text-[10px] font-semibold font-mono bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded">
                  {`{{${f}}}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-border bg-muted/20">
        <button onClick={handleSaveClick} className="w-full py-2.5 bg-sky-600 text-white font-bold rounded-xl hover:bg-sky-700 transition-colors text-[13px] shadow-sm">
          Save Webhook
        </button>
      </div>
    </>
  )
}

// Reminder
function ReminderPanel({ data, onSave }: { data: any; onSave: (d: any) => void }) {
 const [eventDate, setEventDate] = useState(data.eventDate ?? "")
 const [reminders, setReminders] = useState<{ when: string; template: string }[]>(data.reminders ?? [
 { when: "3d", template: "" },
 { when: "1d", template: "" },
 { when: "1h", template: "" },
 ])
 const [templates, setTemplates] = useState<any[]>([])
 useEffect(() => {
 fetch("/api/templates").then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : d.templates ?? [])).catch(() => { })
 }, [])
 const updateR = (i: number, k: string, v: string) => setReminders(p => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
 const addR = () => setReminders(p => [...p, { when: "30m", template: "" }])
 const removeR = (i: number) => setReminders(p => p.filter((_, idx) => idx !== i))
 return (
 <>
 <SectionHeader icon={Bell} title="Event Reminder" subtitle="Send timed reminders before an event" color="bg-yellow-500" />
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 <FieldWrap hint="ISO 8601 format: 2026-03-15T18:00:00">
 <Label required>Event Date & Time</Label>
 <DatePicker
   selected={eventDate ? new Date(eventDate) : null}
   onChange={(date: Date | null) => setEventDate(date ? date.toISOString() : "")}
   showTimeSelect
   timeFormat="HH:mm"
   timeIntervals={15}
   dateFormat="MMMM d, yyyy h:mm aa"
   className={inputCls}
   placeholderText="Select date and time"
   isClearable
 />
 </FieldWrap>
 <div>
 <div className="flex items-center justify-between mb-2">
 <Label>Reminder Schedule</Label>
 <button type="button" onClick={addR} className="flex items-center gap-1 text-[11px] text-primary font-medium hover:underline"><Plus className="h-3 w-3" /> Add</button>
 </div>
 <div className="space-y-2">
 {reminders.map((r, i) => (
 <div key={i} className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
 <select className="text-[12px] bg-transparent font-semibold text-yellow-700 focus:outline-none" value={r.when} onChange={e => updateR(i, "when", e.target.value)}>
 {["5m", "15m", "30m", "1h", "3h", "6h", "12h", "1d", "2d", "3d", "7d"].map(w => <option key={w} value={w}>{w} before</option>)}
 </select>
 <select className="flex-1 text-[12px] bg-transparent focus:outline-none" value={r.template} onChange={e => updateR(i, "template", e.target.value)}>
 <option value="">— Template —</option>
 {templates.map((t: any) => <option key={t.name} value={t.name}>{t.display_name ?? t.name}</option>)}
 </select>
 {reminders.length > 1 && <button type="button" onClick={() => removeR(i)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
 </div>
 ))}
 </div>
 </div>
 </div>
 <div className="p-4 border-t border-border bg-muted/20">
 <button onClick={() => onSave({ eventDate, reminders })}
 className="w-full py-2.5 bg-yellow-500 text-white font-bold rounded-xl hover:bg-yellow-600 transition-colors text-[13px] shadow-sm">
 Save Reminder
 </button>
 </div>
 </>
 )
}

// Config Panel Router 
function NodeConfigPanel({ node, onSave, onClose, workflowId, availableVars }: {
 node: any; onSave: (d: any) => void; onClose: () => void; workflowId: string | null; availableVars?: string[]
}) {
  const typeKey = node.data?.subtype ?? node.data?.type ?? node.data?.id ?? "trigger"
  const data = node.data ?? {}

  const panel = (() => {
    switch (typeKey) {
      case "google_sheet": case "trigger": return <GoogleSheetPanel data={data} onSave={onSave} />
      case "whatsapp": return <WhatsAppPanel data={data} onSave={onSave} availableVars={availableVars} />
      case "email": return <EmailPanel data={data} onSave={onSave} availableVars={availableVars} />
      case "voice": return <VoicePanel data={data} onSave={onSave} availableVars={availableVars} />
      case "delay": return <DelayPanel data={data} onSave={onSave} />
      case "condition": return <ConditionPanel data={data} onSave={onSave} />
      case "update_crm": case "crm": return <CRMPanel data={data} onSave={onSave} />
      case "webhook": return <WebhookPanel data={data} onSave={onSave} workflowId={workflowId} />
      case "reminder": return <ReminderPanel data={data} onSave={onSave} />
      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6 text-center">
            <Settings2 className="h-10 w-10 opacity-20" />
            <p className="text-[14px] font-semibold">Config panel for <b>{typeKey}</b> coming soon</p>
          </div>
        )
    }
  })()

  return (
    <div className="w-[320px] bg-[var(--panel-bg)] border-l border-[var(--node-border)] flex flex-col shrink-0 z-10 shadow-[-8px_0_24px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Close button */}
      <button onClick={onClose} className="absolute top-[60px] right-[324px] z-50 p-1.5 bg-[var(--panel-bg)] border border-[var(--node-border)] text-[var(--text-secondary)] rounded-full shadow-md hover:bg-[var(--canvas-bg)] transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
      {panel}
    </div>
  )
}

// Main Builder Page 
export default function WorkflowBuilderPage() {
 const router = useRouter()
 const [activeTab, setActiveTab] = useState("Builder")
 const [activeRightPanel, setActiveRightPanel] = useState<string | null>(null)
 const [workflowId, setWorkflowId] = useState<string | null>(null)
 const [workflowName, setWorkflowName] = useState("New Workflow")
 const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft")
 const [saving, setSaving] = useState(false)
 const [activating, setActivating] = useState(false)
 const [editingName, setEditingName] = useState(false)
 const [leftTab, setLeftTab] = useState<"nodes" | "templates">("templates")
 const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null)
 const [nodeSearch, setNodeSearch] = useState("")
 const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
 const [showTestModal, setShowTestModal] = useState(false)
 const [testName, setTestName] = useState("Sumit")
 const [testPhone, setTestPhone] = useState("+14155552671")
 const [testEmail, setTestEmail] = useState("sumit@example.com")
 const [testing, setTesting] = useState(false)
 const [testRunResult, setTestRunResult] = useState<any>(null)
 const [workflowRuns, setWorkflowRuns] = useState<any[]>([])
 const [runsLoading, setRunsLoading] = useState(false)
 const [runsLoaded, setRunsLoaded] = useState(false)
 const [customTemplates, setCustomTemplates] = useState<WorkflowTemplate[]>([])
 const [templateName, setTemplateName] = useState("")
 const [templateDesc, setTemplateDesc] = useState("")
 const [templateCat, setTemplateCat] = useState<"drip" | "reminder" | "automation" | "ads">("automation")

 useEffect(() => {
 const saved = localStorage.getItem("custom-workflow-templates")
 if (saved) try { setCustomTemplates(JSON.parse(saved)) } catch { }
 }, [])

 // Inject onClick into nodes
 const injectClick = useCallback((nds: any[]) =>
 nds.map(n => ({ ...n, data: { ...n.data, onClick: setActiveRightPanel } })),
 [setActiveRightPanel]
 )

 const [nodes, setNodes, onNodesChange] = useNodesState(injectClick(initialNodes))
 const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

 // Load workflow from URL param
 useEffect(() => {
 const params = new URLSearchParams(window.location.search)
 const urlId = params.get("id")
 if (!urlId) return
 setWorkflowId(urlId)
 fetch(`/api/workflows?id=${urlId}`).then(r => r.json()).then(d => {
 if (!d.workflow) return
 const wf = d.workflow
 setWorkflowName(wf.name)
 setWorkflowStatus(wf.status)
 if (wf.nodes?.length) setNodes(injectClick(wf.nodes))
 if (wf.edges?.length) setEdges(wf.edges)
 }).catch(() => toast.error("Failed to load workflow"))
 }, [])

 const onConnect = useCallback((params: any) => {
 setEdges(eds => addEdge({ ...params, type: "flowEdge" }, eds) as any)
 }, [setEdges])

 const activeNode = nodes.find(n => n.id === activeRightPanel)

 const updateNodeData = useCallback((newData: any) => {
 if (!activeRightPanel) return
 setNodes(nds => nds.map(n =>
 n.id === activeRightPanel
 ? { ...n, data: { ...n.data, ...newData, onClick: setActiveRightPanel } }
 : n
 ))
 toast.success("Node saved ", { duration: 1500 })
 }, [activeRightPanel, setNodes])

 async function handleSaveDraft() {
 setSaving(true)
 try {
 const res = await fetch("/api/workflows", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: workflowId, name: workflowName, nodes, edges, status: "draft" }),
 })
 const data = await res.json()
 if (!res.ok) throw new Error(data.error)
 setWorkflowId(data.workflow.id)
 setWorkflowStatus("draft")
 toast.success("Workflow saved as draft")
 } catch (err: any) {
 toast.error(err.message ?? "Save failed")
 } finally {
 setSaving(false)
 }
 }

 async function handleActivate() {
 setActivating(true)
 try {
 const saveRes = await fetch("/api/workflows", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: workflowId, name: workflowName, nodes, edges, status: "active" }),
 })
 const saveData = await saveRes.json()
 if (!saveRes.ok) throw new Error(saveData.error)
 const id = saveData.workflow.id
 setWorkflowId(id)
 setWorkflowStatus("active")
 await fetch("/api/workflows", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id, status: "active" }),
 })
 toast.success("Workflow is now LIVE ")
 } catch (err: any) {
 toast.error(err.message ?? "Activation failed")
 } finally {
 setActivating(false)
 }
 }

 const handleTestRunSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setTesting(true)
 setTestRunResult({ status: "saving", message: "Saving workflow…" })
 try {
 const saveRes = await fetch("/api/workflows", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: workflowId, name: workflowName, nodes, edges, status: workflowStatus }),
 })
 const saveData = await saveRes.json()
 if (!saveRes.ok) throw new Error(saveData.error || "Save failed")
 setWorkflowId(saveData.workflow.id)
 setTestRunResult({ status: "triggering", message: "Triggering test run…" })
 const trigRes = await fetch("/api/workflows/trigger", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ workflowId: saveData.workflow.id, testMode: true, triggerData: { name: testName, phone: testPhone, email: testEmail } }),
 })
 const trigData = await trigRes.json()
 if (!trigRes.ok) throw new Error(trigData.error || "Trigger failed")
 setTestRunResult({ status: "success", message: "Test executed!", runId: trigData.runId })
 toast.success("Test run successful!")
 } catch (err: any) {
 setTestRunResult({ status: "failed", message: err.message })
 toast.error(err.message)
 } finally {
 setTesting(false)
 }
 }

 const fetchRuns = useCallback(async () => {
 if (!workflowId) return
 setRunsLoading(true)
 try {
 const res = await fetch(`/api/workflows/runs?workflowId=${workflowId}`)
 const d = await res.json()
 if (res.ok) setWorkflowRuns(d.runs ?? [])
 } catch { } finally { setRunsLoading(false); setRunsLoaded(true) }
 }, [workflowId])

 useEffect(() => {
 if ((activeTab === "Logs" || activeTab === "Analytics") && !runsLoaded) fetchRuns()
 }, [activeTab, runsLoaded, fetchRuns])

 const loadTemplate = (tpl: WorkflowTemplate) => {
 if (nodes.length > 1 && !confirm("Replace current workflow with this template?")) return
 setNodes(injectClick(tpl.nodes))
 setEdges(tpl.edges)
 setWorkflowName(tpl.name)
 setSelectedTemplate(tpl)
 setActiveRightPanel(null)
 toast.success(`"${tpl.name}" loaded`)
 }

 const handleSaveTemplate = (e: React.FormEvent) => {
 e.preventDefault()
 if (!templateName.trim()) return
 const tpl: WorkflowTemplate = {
 id: `custom_${Date.now()}`, name: templateName, description: templateDesc,
 category: templateCat, icon: CircuitBoard, color: "text-primary", bgColor: "bg-primary/10",
 tags: ["Custom"], estimatedSetupMinutes: 2,
 nodes: nodes.map(n => ({ ...n, data: { ...n.data, onClick: undefined } })),
 edges, configFields: []
 }
 const updated = [...customTemplates, tpl]
 setCustomTemplates(updated)
 localStorage.setItem("custom-workflow-templates", JSON.stringify(updated))
 setShowSaveTemplateModal(false)
 setTemplateName(""); setTemplateDesc("")
 toast.success("Template saved!")
 }

 const filteredLibrary = useMemo(() =>
 nodeLibrary.filter(cat => cat.nodes.some(n => !nodeSearch || n.label.toLowerCase().includes(nodeSearch.toLowerCase()))),
 [nodeSearch]
 )

 return (
 <div className="fixed inset-0 z-50 flex flex-col bg-[#fafaf9]">
 {/* Topbar */}
 <div className="h-[52px] bg-zinc-900 px-5 flex items-center justify-between shrink-0 z-20 border-b border-zinc-800">
 <div className="flex items-center gap-4">
 <button onClick={() => router.push("/dashboard/workflows")}
 className="flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-white transition-colors">
 <ArrowLeft className="h-4 w-4" /> Workflows
 </button>
 <div className="w-px h-5 bg-zinc-700" />
 <div className="flex items-center gap-2">
 {editingName ? (
 <input autoFocus value={workflowName} onChange={e => setWorkflowName(e.target.value)}
 onBlur={() => setEditingName(false)} onKeyDown={e => e.key === "Enter" && setEditingName(false)}
 className="text-[15px] font-semibold bg-zinc-800 text-white border border-zinc-600 rounded-lg px-2.5 py-1 focus:outline-none w-52" />
 ) : (
 <span className="text-[15px] font-semibold text-white">{workflowName}</span>
 )}
 <button onClick={() => setEditingName(true)} className="p-1 rounded hover:bg-zinc-800 transition-colors">
 <Pencil className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
 </button>
 </div>
 <span className={cn("text-[11px] px-2.5 py-1 rounded-full font-semibold tracking-wide",
 workflowStatus === "active" ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-400"
 )}>
 {workflowStatus === "active" ? " LIVE" : " DRAFT"}
 </span>
 </div>

 <div className="flex h-full items-center">
 {["Builder", "Logs", "Analytics"].map(tab => (
 <button key={tab} onClick={() => setActiveTab(tab)}
 className={cn("h-full px-5 text-[13px] font-medium transition-colors border-b-2",
 activeTab === tab ? "border-primary text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
 )}>
 {tab}
 </button>
 ))}
 </div>

 <div className="flex items-center gap-2.5">
 <button onClick={handleSaveDraft} disabled={saving}
 className="px-3.5 py-1.5 text-[12px] font-semibold border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors disabled:opacity-40">
 {saving ? <><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Saving…</> : <><Save className="h-3 w-3 inline mr-1" />Save</>}
 </button>
 <button onClick={() => setShowSaveTemplateModal(true)}
 className="px-3 py-1.5 text-[12px] font-semibold border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors flex items-center gap-1.5">
 <BookmarkPlus className="h-3.5 w-3.5" /> Template
 </button>
 <button onClick={() => { setTestRunResult(null); setShowTestModal(true) }}
 className="px-3 py-1.5 text-[12px] font-semibold border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-lg transition-colors flex items-center gap-1.5">
 <Play className="h-3.5 w-3.5" /> Test Run
 </button>
 <button onClick={handleActivate} disabled={activating}
 className={cn("flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-bold rounded-lg shadow-sm transition-all disabled:opacity-50",
 workflowStatus === "active"
 ? "bg-red-500 text-white hover:bg-red-600"
 : "bg-primary text-foreground hover:bg-primary/90 shadow-primary/20"
 )}>
 <Zap className="h-3.5 w-3.5" />
 {activating ? "Working…" : workflowStatus === "active" ? "Deactivate" : "Activate"}
 </button>
 </div>
 </div>

 {/* Builder Tab */}
 {activeTab === "Builder" && (
 <div className="flex flex-1 overflow-hidden">
 {/* Left Panel */}
 <div className="w-[256px] bg-[var(--panel-bg)] border-r border-[var(--node-border)] flex flex-col shrink-0 z-10">
 <div className="flex border-b border-[var(--node-border)] shrink-0">
 {(["templates", "nodes"] as const).map(tab => (
 <button key={tab} onClick={() => setLeftTab(tab)}
 className={cn("flex-1 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 uppercase tracking-wide",
 leftTab === tab ? "border-primary text-[var(--text-primary)]" : "border-transparent text-muted-foreground hover:text-[var(--text-primary)]"
 )}>
 {tab === "templates" ? <><LayoutTemplate className="h-3.5 w-3.5" />Templates</> : <><CircuitBoard className="h-3.5 w-3.5" />Nodes</>}
 </button>
 ))}
 </div>

 {leftTab === "templates" && (
 <div className="flex-1 overflow-y-auto p-3 space-y-2">
 <p className="text-[10px] text-muted-foreground px-1 pb-0.5 uppercase tracking-wide font-semibold">Pre-built starting points</p>
 {[...customTemplates, ...WORKFLOW_TEMPLATES].map(tpl => {
 const TplIcon = templateIconMap[tpl.id] ?? Zap
 return (
 <button key={tpl.id} onClick={() => loadTemplate(tpl)}
 className={cn("w-full text-left p-3 rounded-xl border-2 transition-all group hover:shadow-sm",
 selectedTemplate?.id === tpl.id ? "border-primary bg-primary/5" : "border-[var(--node-border)] hover:border-primary/30"
 )}>
 <div className="flex items-center gap-2 mb-1">
 <TplIcon className={cn("h-3.5 w-3.5 shrink-0", tpl.color)} />
 <span className="text-[12px] font-bold text-[var(--text-primary)] leading-tight">{tpl.name}</span>
 {selectedTemplate?.id === tpl.id && <CheckCircle className="h-3 w-3 text-primary ml-auto shrink-0" />}
 </div>
 <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{tpl.description}</p>
 <div className="flex gap-1 mt-1.5 flex-wrap">
 {tpl.tags.slice(0, 3).map(tag => (
 <span key={tag} className={cn("text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase", tpl.bgColor, tpl.color)}>{tag}</span>
 ))}
 </div>
 </button>
 )
 })}
 <div className="border-t border-[var(--node-border)] pt-2">
 <button onClick={() => {
 setNodes(injectClick(initialNodes)); setEdges(initialEdges)
 setSelectedTemplate(null); setWorkflowName("New Workflow")
 }} className="w-full text-[11px] text-muted-foreground hover:text-[var(--text-primary)] py-2 hover:bg-[var(--canvas-bg)] rounded-lg transition-colors font-medium">
 + Start from scratch
 </button>
 </div>
 </div>
 )}

 {leftTab === "nodes" && (
 <>
 <div className="p-3 border-b border-[var(--node-border)] shrink-0">
 <div className="relative">
 <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
 <input type="text" placeholder="Search nodes…" value={nodeSearch} onChange={e => setNodeSearch(e.target.value)}
 className="w-full bg-[var(--canvas-bg)] rounded-lg h-[34px] pl-8 pr-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary text-[var(--text-primary)]" />
 </div>
 </div>
 <div className="flex-1 overflow-y-auto p-3 space-y-4">
 {filteredLibrary.map(cat => (
 <div key={cat.category}>
 <h4 className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-2 px-1">{cat.category}</h4>
 <div className="space-y-1">
 {cat.nodes.filter(n => !nodeSearch || n.label.toLowerCase().includes(nodeSearch.toLowerCase())).map((node, i) => (
 <div key={i} draggable
 onDragStart={e => { e.dataTransfer.setData("application/reactflow", node.id); e.dataTransfer.effectAllowed = "move" }}
 className="flex items-center gap-3 p-3 bg-[var(--node-bg)] rounded-xl border border-[var(--node-border)] cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/30 transition-all">
 <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-[var(--node-border)] bg-[var(--canvas-bg)]", node.bg)}>
 <node.icon className={cn("h-4 w-4", node.color)} strokeWidth={2.25} />
 </div>
 <div>
 <p className="text-[12px] font-bold text-[var(--text-primary)] leading-tight mb-0.5">{node.label}</p>
 <p className="text-[10px] text-[var(--text-tertiary)]">{node.sublabel}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 </>
 )}
 </div>

 {/* Canvas */}
 <div className="flex-1 relative overflow-hidden">
 <ReactFlowProvider>
 <WorkflowCanvas
 nodes={nodes} edges={edges}
 onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
 onConnect={onConnect} setNodes={setNodes}
 setActiveRightPanel={setActiveRightPanel}
 />
 </ReactFlowProvider>
 </div>

 {/* Right Config Panel */}
 {activeRightPanel && activeNode && (() => {
          // Compute dynamic availableVars based on upstream nodes using React Flow getIncomers
          const visited = new Set<string>()
          const varsSet = new Set<string>(COMMON_VARS) // always include defaults

          const traverse = (currentId: string) => {
            if (visited.has(currentId)) return
            visited.add(currentId)
            
            const incomers = getIncomers({ id: currentId } as any, nodes, edges)
            for (const inc of incomers) {
              const nodeVars = getVarsFromNode(inc)
              nodeVars.forEach(v => varsSet.add(v))
              traverse(inc.id)
            }
          }
          traverse(activeNode.id)
          const computedVars = Array.from(varsSet)

          return (
            <NodeConfigPanel
              node={activeNode}
              workflowId={workflowId}
              availableVars={computedVars}
              onSave={(newData) => { updateNodeData(newData); setActiveRightPanel(null) }}
              onClose={() => setActiveRightPanel(null)}
            />
          )
        })()}
 </div>
 )}

 {/* Logs Tab */}
 {activeTab === "Logs" && (
 <div className="flex flex-1 flex-col overflow-hidden bg-[#fafaf9]">
 <div className="px-8 py-5 border-b border-border bg-white flex items-center justify-between">
 <div>
 <h2 className="text-[18px] font-bold flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Execution Logs</h2>
 <p className="text-[13px] text-muted-foreground mt-0.5">{workflowId ? `Runs for: ${workflowName}` : "Save workflow first to see logs."}</p>
 </div>
 {workflowId && (
 <button onClick={() => { setRunsLoaded(false); fetchRuns() }} disabled={runsLoading}
 className="flex items-center gap-1.5 px-3 py-2 text-[13px] border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50">
 <RefreshCw className={cn("h-3.5 w-3.5", runsLoading && "animate-spin")} /> Refresh
 </button>
 )}
 </div>
 <div className="flex-1 overflow-y-auto p-8">
 {!workflowId ? (
 <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-center">
 <Save className="h-10 w-10 opacity-20" />
 <p className="font-semibold">Save the workflow to view logs</p>
 </div>
 ) : runsLoading ? (
 <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
 <Loader2 className="h-5 w-5 animate-spin" /><span>Loading…</span>
 </div>
 ) : workflowRuns.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-center">
 <Activity className="h-10 w-10 opacity-20" />
 <p className="font-semibold">No runs yet</p>
 <p className="text-[13px]">Use Test Run or activate to see executions here.</p>
 </div>
 ) : (
 <div className="space-y-3 max-w-4xl">
 {workflowRuns.map(run => (
 <div key={run.id} className="border border-border rounded-xl p-4 bg-white shadow-sm">
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-2">
 {run.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
 run.status === "failed" ? <XCircle className="h-4 w-4 text-red-500" /> :
 run.status === "running" ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin" /> :
 <AlertCircle className="h-4 w-4 text-amber-500" />}
 <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full",
 run.status === "completed" ? "bg-green-100 text-green-700" :
 run.status === "failed" ? "bg-red-100 text-red-700" :
 run.status === "running" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
 )}>{run.status.toUpperCase()}</span>
 <span className="text-[11px] font-mono text-muted-foreground">#{run.id?.slice(0, 8)}</span>
 </div>
 <span className="text-[11px] text-muted-foreground">{run.created_at ? format(new Date(run.created_at), "dd MMM HH:mm:ss") : "—"}</span>
 </div>
 <div className="flex gap-4 text-[12px] text-muted-foreground">
 <span>Trigger: <b className="text-foreground">{run.trigger_type ?? "manual"}</b></span>
 <span>Steps: <b className="text-foreground">{run.steps_completed ?? 0}/{run.steps_total ?? 0}</b></span>
 {run.error_message && <span className="text-red-600 font-medium"> {run.error_message}</span>}
 </div>
 {run.trigger_data && Object.keys(run.trigger_data).length > 0 && (
 <details className="mt-2">
 <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground font-medium">Trigger data </summary>
 <pre className="mt-1 text-[10px] font-mono bg-muted/50 p-2 rounded-lg text-foreground overflow-x-auto">{JSON.stringify(run.trigger_data, null, 2)}</pre>
 </details>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 )}

 {/* Analytics Tab */}
 {activeTab === "Analytics" && (() => {
 const completed = workflowRuns.filter(r => r.status === "completed").length
 const failed = workflowRuns.filter(r => r.status === "failed").length
 const total = workflowRuns.length
 const rate = total > 0 ? Math.round((completed / total) * 100) : 0
 return (
 <div className="flex flex-1 flex-col overflow-hidden bg-[#fafaf9]">
 <div className="px-8 py-5 border-b border-border bg-white flex items-center justify-between">
 <div>
 <h2 className="text-[18px] font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> Analytics</h2>
 <p className="text-[13px] text-muted-foreground mt-0.5">Execution performance overview</p>
 </div>
 {workflowId && (
 <button onClick={() => { setRunsLoaded(false); fetchRuns() }} disabled={runsLoading}
 className="flex items-center gap-1.5 px-3 py-2 text-[13px] border border-border rounded-lg hover:bg-muted disabled:opacity-50">
 <RefreshCw className={cn("h-3.5 w-3.5", runsLoading && "animate-spin")} /> Refresh
 </button>
 )}
 </div>
 <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl">
 <div className="grid grid-cols-4 gap-4">
 {[
 { label: "Total Runs", value: total, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
 { label: "Successful", value: completed, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
 { label: "Failed", value: failed, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
 { label: "Success Rate", value: `${rate}%`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
 ].map(({ label, value, icon: Icon, color, bg }) => (
 <div key={label} className="border border-border rounded-xl p-5 bg-white shadow-sm">
 <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", bg)}>
 <Icon className={cn("h-5 w-5", color)} />
 </div>
 <p className="text-[28px] font-bold text-foreground leading-none mb-1">{value}</p>
 <p className="text-[12px] text-muted-foreground font-medium">{label}</p>
 </div>
 ))}
 </div>
 <div className="border border-border rounded-xl p-6 bg-white shadow-sm">
 <h3 className="text-[14px] font-bold mb-4 flex items-center gap-2"><CircuitBoard className="h-4 w-4 text-muted-foreground" /> Workflow Nodes ({nodes.length})</h3>
 <div className="space-y-2">
 {nodes.map(n => (
 <div key={n.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
 <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
 <span className="text-[13px] font-semibold text-foreground flex-1">{n.data?.label ?? n.id}</span>
 <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{n.data?.subtype ?? n.data?.type ?? n.type}</span>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 )
 })()}

 {/* Save Template Modal */}
 {showSaveTemplateModal && (
 <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden">
 <div className="px-5 py-4 border-b border-border flex justify-between items-center bg-muted/30">
 <h3 className="font-bold text-[15px] flex items-center gap-2"><BookmarkPlus className="h-4 w-4 text-primary" /> Save as Template</h3>
 <button onClick={() => setShowSaveTemplateModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
 </div>
 <form onSubmit={handleSaveTemplate} className="p-5 space-y-4">
 <div><Label required>Template Name</Label><input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} className={inputCls} placeholder="My Drip Workflow" required /></div>
 <div><Label>Description</Label><textarea value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} className={cn(inputCls, "min-h-[80px]")} placeholder="Briefly describe what this does…" /></div>
 <div><Label>Category</Label>
 <select value={templateCat} onChange={e => setTemplateCat(e.target.value as any)} className={selectCls}>
 <option value="drip">Drip Campaign</option>
 <option value="automation">General Automation</option>
 <option value="reminder">Reminder / Alert</option>
 <option value="ads">Lead Gen / Ads</option>
 </select>
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button type="button" onClick={() => setShowSaveTemplateModal(false)} className="px-4 py-2 text-[13px] font-medium hover:bg-muted rounded-lg">Cancel</button>
 <button type="submit" className="px-4 py-2 text-[13px] font-bold bg-primary text-foreground rounded-lg hover:bg-primary/90 shadow-sm">Save Template</button>
 </div>
 </form>
 </div>
 </div>
 )}

 {/* Test Run Modal */}
 {showTestModal && (
 <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden">
 <div className="px-5 py-4 border-b border-border flex justify-between items-center bg-muted/30">
 <h3 className="font-bold text-[15px] flex items-center gap-2"><Play className="h-4 w-4 text-primary" /> Test Workflow</h3>
 <button onClick={() => setShowTestModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
 </div>
 <div className="p-5">
 {!testRunResult ? (
 <form onSubmit={handleTestRunSubmit} className="space-y-4">
 <p className="text-[13px] text-muted-foreground">Provide dummy contact data to simulate a live execution.</p>
 <div><Label required>Contact Name</Label><input type="text" value={testName} onChange={e => setTestName(e.target.value)} className={inputCls} required /></div>
 <div><Label required>Phone (with country code)</Label><input type="text" value={testPhone} onChange={e => setTestPhone(e.target.value)} className={inputCls} required /></div>
 <div><Label required>Email</Label><input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} className={inputCls} required /></div>
 <div className="flex justify-end gap-2 pt-2">
 <button type="button" onClick={() => setShowTestModal(false)} className="px-4 py-2 text-[13px] font-medium hover:bg-muted rounded-lg" disabled={testing}>Cancel</button>
 <button type="submit" disabled={testing} className="flex items-center gap-2 px-4 py-2 text-[13px] font-bold bg-primary text-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 shadow-sm">
 {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
 {testing ? "Running…" : "Start Test"}
 </button>
 </div>
 </form>
 ) : (
 <div className="text-center py-4 space-y-4">
 {(testRunResult.status === "saving" || testRunResult.status === "triggering") && (
 <div className="flex flex-col items-center gap-3">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-[13px] font-medium text-foreground">{testRunResult.message}</p>
 </div>
 )}
 {testRunResult.status === "success" && (
 <div className="flex flex-col items-center gap-3">
 <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="h-7 w-7 text-green-600" /></div>
 <p className="text-[14px] font-bold text-green-700">Test Executed Successfully</p>
 <p className="text-[12px] text-muted-foreground font-mono">Run ID: {testRunResult.runId}</p>
 <button onClick={() => { setShowTestModal(false); setTestRunResult(null); setActiveTab("Logs"); setRunsLoaded(false) }}
 className="w-full px-4 py-2 text-[13px] font-bold bg-primary text-foreground rounded-xl hover:bg-primary/90">View Logs →</button>
 </div>
 )}
 {testRunResult.status === "failed" && (
 <div className="flex flex-col items-center gap-3">
 <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center"><XCircle className="h-7 w-7 text-red-600" /></div>
 <p className="text-[14px] font-bold text-red-700">Test Failed</p>
 <p className="text-[11px] bg-red-50 text-red-600 p-3 rounded-xl w-full text-left font-mono break-all">{testRunResult.message}</p>
 <button onClick={() => setTestRunResult(null)} className="w-full px-4 py-2 text-[13px] font-bold bg-muted hover:bg-muted/80 rounded-xl">Try Again</button>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 )
}