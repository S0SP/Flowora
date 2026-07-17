"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  BookOpen, Sliders, GitBranch, Radio, FlaskConical, BarChart3,
  Globe, FileText, FileSpreadsheet, Plus, MessageSquare, ArrowRight,
  Loader2, Trash2, Edit, Check, X, Zap, Save, RefreshCw, HelpCircle, Send,
  Smartphone, Tablet, Monitor, ChevronDown, ChevronUp,
  Bot, Headphones, Sparkles, Heart, Star, Zap as ZapIcon,
  Smile, Coffee, Sun, Moon, Flower2, Rocket, Shield, Bell,
  Copy, ExternalLink, RotateCcw, PanelRight, Expand, Shrink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"
import { useWorkspace } from "@/context/WorkspaceContext"

// ── Custom Dropdown Component ──────────────────────────────────────────────────────────
function CustomSelect({ value, onChange, options, className }: { value: string, onChange: (val: string) => void, options: { value: string, label: string }[], className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = options.find(o => o.value === value) || options[0]
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className={cn("relative", className)} ref={ref}>
      <div onClick={() => setIsOpen(!isOpen)}
        className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-white cursor-pointer flex items-center justify-between hover:bg-gray-50 transition-colors">
        <span>{selected?.label}</span>
        <ChevronDown className="h-4 w-4 text-gray-500 opacity-50" />
      </div>
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 w-full bg-white border border-border rounded-lg shadow-lg z-50 py-1 max-h-48 overflow-y-auto">
          {options.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false) }}
              className="px-3 py-2 text-[13px] cursor-pointer hover:bg-gray-100 text-gray-900 transition-colors">
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const navItems = [
  { icon: BookOpen, label: "Knowledge", tab: "Knowledge" },
  { icon: Sliders, label: "Behavior", tab: "Behavior" },
  { icon: HelpCircle, label: "FAQs", tab: "FAQs" },
  { icon: GitBranch, label: "Escalation", tab: "Escalation" },
  { icon: Radio, label: "Channels", tab: "Channels" },
  { icon: FlaskConical, label: "Testing", tab: "Testing" },
  { icon: BarChart3, label: "Analytics", tab: "Analytics" },
]

const behaviorSchema = z.object({
  botName: z.string().min(2),
  persona: z.string().min(10),
  language: z.string(),
  responseLength: z.number().min(0).max(100),
  fallback: z.string().min(5),
  useKnowledgeBase: z.boolean(),
  whatsappEnabled: z.boolean(),
  webWidgetEnabled: z.boolean(),
  widgetTitle: z.string().optional(),
  widgetSubtitle: z.string().optional(),
  widgetGreeting: z.string().optional(),
  widgetPrimaryColor: z.string().optional(),
  widgetPosition: z.enum(["right", "left"]).optional(),
  widgetPlaceholder: z.string().optional(),
  widgetShowBranding: z.boolean().optional(),
  widgetIconId: z.string().optional(),
  widgetCustomLauncherIcon: z.string().optional(),
  widgetCustomBotAvatar: z.string().optional(),
  widgetCustomHeaderIcon: z.string().optional(),
  widgetStyle: z.string().optional(),
})

type BehaviorFormValues = z.infer<typeof behaviorSchema>

type FAQ = {
  id?: string
  question: string
  answer: string
  match_type: "exact" | "contains" | "starts_with"
  is_active: boolean
}

type TestMessage = { id: string; text: string; sender: "user" | "ai" }

// ── FAQ Manager ──────────────────────────────────────────────────────────────
function FAQManager({ workspaceId }: { workspaceId?: string }) {
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newFaq, setNewFaq] = useState<Partial<FAQ>>({ question: "", answer: "", match_type: "contains" })
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchFaqs = useCallback(async () => {
    try {
      const res = await fetch("/api/chatbot/faqs")
      if (res.ok) { const data = await res.json(); setFaqs(data.faqs ?? []) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchFaqs() }, [fetchFaqs])

  async function handleSaveFaq(faq: Partial<FAQ>) {
    if (!faq.question?.trim() || !faq.answer?.trim()) { toast.error("Question and answer are required"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/chatbot/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(faq),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("FAQ saved")
      setShowAdd(false)
      setEditingId(null)
      setNewFaq({ question: "", answer: "", match_type: "contains" })
      fetchFaqs()
    } catch (err: any) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this FAQ?")) return
    await fetch(`/api/chatbot/faqs?id=${id}`, { method: "DELETE" })
    toast.success("FAQ deleted")
    fetchFaqs()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-bold text-gray-900 mb-1">Fixed FAQ Answers</h2>
        <p className="text-[13px] text-gray-500">
          These answers are returned <strong>instantly without AI</strong> when a customer's message matches.
          Useful for pricing, hours, contact info — no LLM cost, zero latency.
        </p>
      </div>

      {/* Priority notice */}
      <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[13px] text-gray-900">
          FAQs are checked <strong>before the AI knowledge base</strong>. If a question matches, the fixed answer
          is sent instantly — no API call needed.
        </p>
      </div>

      {/* FAQ list */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px]">Loading FAQs…</span>
        </div>
      ) : (
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={faq.id ?? i} className="border border-border rounded-xl p-4">
              {editingId === faq.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] font-medium text-gray-900 block mb-1">Trigger phrase (what customer says)</label>
                    <input
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
                      defaultValue={faq.question}
                      id={`q-${faq.id}`}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-gray-900 block mb-1">Reply (what bot says)</label>
                    <textarea rows={3}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
                      defaultValue={faq.answer}
                      id={`a-${faq.id}`}
                    />
                  </div>
                  <CustomSelect
                    value={faq.match_type}
                    onChange={(val) => {
                      const el = document.getElementById(`m-${faq.id}`) as any;
                      if (el) el.value = val;
                    }}
                    options={[
                      { value: "contains", label: "Contains" },
                      { value: "exact", label: "Exact match" },
                      { value: "starts_with", label: "Starts with" }
                    ]}
                  />
                  <input type="hidden" id={`m-${faq.id}`} defaultValue={faq.match_type} />
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveFaq({
                      id: faq.id,
                      question: (document.getElementById(`q-${faq.id}`) as HTMLInputElement)?.value,
                      answer: (document.getElementById(`a-${faq.id}`) as HTMLTextAreaElement)?.value,
                      match_type: (document.getElementById(`m-${faq.id}`) as HTMLSelectElement)?.value as any,
                      is_active: true,
                    })} disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-medium">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-border rounded-lg text-[13px]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium capitalize">{faq.match_type}</span>
                      {!faq.is_active && <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-medium">Disabled</span>}
                    </div>
                    <p className="text-[13px] font-semibold text-gray-900 mb-0.5">"{faq.question}"</p>
                    <p className="text-[13px] text-gray-500 line-clamp-2">{faq.answer}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setEditingId(faq.id ?? null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => faq.id && handleDelete(faq.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {faqs.length === 0 && !showAdd && (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-xl text-gray-500">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No FAQs yet — add common customer questions</p>
            </div>
          )}
        </div>
      )}

      {/* Add new FAQ */}
      {showAdd ? (
        <div className="border-2 border-primary/30 border-dashed rounded-xl p-4 space-y-3 bg-primary/5">
          <p className="text-[13px] font-semibold text-gray-900">New FAQ Entry</p>
          <div>
            <label className="text-[12px] font-medium block mb-1">Customer says (trigger phrase)</label>
            <input type="text" value={newFaq.question ?? ""} onChange={e => setNewFaq(p => ({ ...p, question: e.target.value }))}
              placeholder="e.g. what is your price, pricing"
              className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" />
          </div>
          <div>
            <label className="text-[12px] font-medium block mb-1">Bot replies with</label>
            <textarea rows={3} value={newFaq.answer ?? ""} onChange={e => setNewFaq(p => ({ ...p, answer: e.target.value }))}
              placeholder="Our pricing starts at ₹999/month. Visit flowora.io/pricing for details."
              className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none" />
          </div>
          <CustomSelect
            value={newFaq.match_type as string}
            onChange={val => setNewFaq(p => ({ ...p, match_type: val as any }))}
            options={[
              { value: "contains", label: "Contains match (recommended)" },
              { value: "exact", label: "Exact match" },
              { value: "starts_with", label: "Starts with" }
            ]}
          />
          <div className="flex gap-2">
            <button onClick={() => handleSaveFaq(newFaq)} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-bold disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add FAQ
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-border rounded-lg text-[13px]">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full border-2 border-dashed border-border rounded-xl py-3 flex items-center justify-center gap-2 text-[14px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <Plus className="h-4 w-4" /> Add FAQ Answer
        </button>
      )}
    </div>
  )
}

// ── Main Chatbot Page ──────────────────────────────────────────────────────────
export default function ChatbotPage() {
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id

  const [activeTab, setActiveTab] = useState("Behavior")
  const [isTestDrawerOpen, setIsTestDrawerOpen] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [origin, setOrigin] = useState("http://localhost:3000")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [])

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<BehaviorFormValues>({
    resolver: zodResolver(behaviorSchema),
    defaultValues: {
      botName: "Aria",
      persona: "You are Aria, a friendly and professional AI assistant. You help customers with product inquiries, pricing, demos, and support. Always be concise, warm, and solution-focused.",
      language: "auto",
      responseLength: 65,
      fallback: "I'm sorry, I can't help with that right now. Let me connect you with a human agent.",
      useKnowledgeBase: true,
      whatsappEnabled: true,
      webWidgetEnabled: false,
      widgetTitle: "Chat with Aria",
      widgetSubtitle: "Ask us anything!",
      widgetGreeting: "Hi there! How can I help you today?",
      widgetPrimaryColor: "#7c3aed",
      widgetPosition: "right",
      widgetPlaceholder: "Type your message...",
      widgetShowBranding: true,
      widgetIconId: "message-square",
      widgetStyle: "modern",
    }
  })

  // Watch values for real-time widget preview
  const whatsappEnabled = watch("whatsappEnabled")
  const webWidgetEnabled = watch("webWidgetEnabled")
  const widgetTitle = watch("widgetTitle")
  const widgetSubtitle = watch("widgetSubtitle")
  const widgetGreeting = watch("widgetGreeting")
  const widgetPrimaryColor = watch("widgetPrimaryColor")
  const widgetPosition = watch("widgetPosition")
  const widgetPlaceholder = watch("widgetPlaceholder")
  const widgetShowBranding = watch("widgetShowBranding")
  const widgetIconId = watch("widgetIconId")
  const widgetStyle = watch("widgetStyle")

  // Preview state
  const [previewDevice, setPreviewDevice] = useState<"phone" | "tablet" | "desktop">("desktop")
  const [previewUrlInput, setPreviewUrlInput] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewUrlLoading, setPreviewUrlLoading] = useState(false)
  const [widgetOpen, setWidgetOpen] = useState(true)
  const [widgetSize, setWidgetSize] = useState({ width: 350, height: 500 })
  const [expandedWidgetSection, setExpandedWidgetSection] = useState<string>("header")

  const handleWidgetResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = widgetSize.width
    const startHeight = widgetSize.height
    const isLeft = widgetPosition === "left"

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = isLeft ? (moveEvent.clientX - startX) : (startX - moveEvent.clientX)
      const deltaY = startY - moveEvent.clientY
      setWidgetSize({
        width: Math.max(300, Math.min(600, startWidth + deltaX)),
        height: Math.max(400, Math.min(800, startHeight + deltaY))
      })
    }

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    document.body.style.cursor = isLeft ? "nesw-resize" : "nwse-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }, [widgetSize, widgetPosition])

  // Load settings
  useEffect(() => {
    fetch("/api/chatbot")
      .then(r => r.json())
      .then(data => {
        if (data.settings) {
          reset({
            botName: data.settings.botName ?? "Aria",
            persona: data.settings.persona ?? "",
            language: data.settings.language ?? "auto",
            responseLength: data.settings.responseLength ?? 65,
            fallback: data.settings.fallback ?? "",
            useKnowledgeBase: data.settings.useKnowledgeBase ?? true,
            whatsappEnabled: data.settings.whatsappEnabled ?? true,
            webWidgetEnabled: data.settings.webWidgetEnabled ?? false,
            widgetTitle: data.chatWidget?.title ?? "Chat with Aria",
            widgetSubtitle: data.chatWidget?.subtitle ?? "Ask us anything!",
            widgetGreeting: data.chatWidget?.greeting ?? "Hi there! How can I help you today?",
            widgetPrimaryColor: data.chatWidget?.primaryColor ?? "#7c3aed",
            widgetPosition: data.chatWidget?.position ?? "right",
            widgetPlaceholder: data.chatWidget?.placeholder ?? "Type your message...",
            widgetShowBranding: data.chatWidget?.poweredBy !== false,
            widgetIconId: data.chatWidget?.iconId ?? "message-square",
            widgetCustomLauncherIcon: data.chatWidget?.customLauncherIcon ?? "",
            widgetCustomBotAvatar: data.chatWidget?.customBotAvatar ?? "",
            widgetCustomHeaderIcon: data.chatWidget?.customHeaderIcon ?? "",
            widgetStyle: data.chatWidget?.style ?? "modern",
          })
        }
      })
      .catch(() => { })
      .finally(() => setLoadingSettings(false))
  }, [reset])

  const onSave = async (data: BehaviorFormValues) => {
    setSavingSettings(true)
    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botName: data.botName,
          persona: data.persona,
          language: data.language,
          responseLength: data.responseLength,
          fallback: data.fallback,
          useKnowledgeBase: data.useKnowledgeBase,
          isActive: true,
          whatsappEnabled: data.whatsappEnabled,
          webWidgetEnabled: data.webWidgetEnabled,
          chatWidget: {
            title: data.widgetTitle,
            subtitle: data.widgetSubtitle,
            greeting: data.widgetGreeting,
            primaryColor: data.widgetPrimaryColor,
            position: data.widgetPosition,
            placeholder: data.widgetPlaceholder,
            poweredBy: !!data.widgetShowBranding,
            iconId: data.widgetIconId,
            customLauncherIcon: data.widgetCustomLauncherIcon,
            customBotAvatar: data.widgetCustomBotAvatar,
            customHeaderIcon: data.widgetCustomHeaderIcon,
            style: data.widgetStyle,
          }
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Chatbot settings saved successfully!")
    } catch (err: any) { toast.error(err.message) }
    finally { setSavingSettings(false) }
  }

  // Test chat
  const [testMessages, setTestMessages] = useState<TestMessage[]>([
    { id: "1", text: "Hello, what are your pricing plans?", sender: "user" },
    { id: "2", text: "Hi there! 👋 I'm here to help. Type your question and I'll respond using your knowledge base.", sender: "ai" }
  ])
  const [testInput, setTestInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [testMessages, isTyping])

  const handleTestSend = async () => {
    if (!testInput.trim()) return
    const userMsg: TestMessage = { id: Date.now().toString(), text: testInput, sender: "user" }
    setTestMessages(prev => [...prev, userMsg])
    const query = testInput
    setTestInput("")
    setIsTyping(true)

    try {
      const res = await fetch("/api/chatbot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query, history: testMessages }),
      })
      const data = await res.json()
      setTestMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: data.reply ?? data.error ?? "No response",
        sender: "ai"
      }])
    } catch {
      setTestMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: "Failed to get response. Check API settings.", sender: "ai" }])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="flex flex-col h-full flex-1 bg-white relative overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">AI Chatbot</h1>
            <div className="flex items-center gap-1.5 bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
              <span className="text-[12px] font-medium text-[#22C55E]">Active</span>
            </div>
          </div>
          <p className="text-[14px] text-gray-500">
            Powered by your knowledge base — answers customer questions autonomously on WhatsApp and Web.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/knowledge" className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 border border-border rounded-lg px-3 py-2">
            <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
          </Link>
          <button type="button" onClick={() => setIsTestDrawerOpen(true)} className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold text-gray-900 bg-white border border-border hover:bg-gray-50 shadow-sm rounded-lg transition-colors">
            🧪 Test Bot
          </button>
          <button onClick={handleSubmit(onSave, (errs) => {
            console.error("Validation errors:", errs);
            toast.error("Could not save. Please check the 'Behavior' tab for invalid fields.");
          })} disabled={savingSettings}
            className="flex items-center gap-1.5 px-5 py-2.5 text-[14px] font-bold text-gray-900 bg-primary hover:bg-primary/90 shadow-sm rounded-lg transition-colors disabled:opacity-50">
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left Nav */}
        <div className="w-[200px] border-r border-border p-4 flex flex-col gap-1 shrink-0 bg-white">
          {navItems.map((item) => (
            <button key={item.tab} onClick={() => setActiveTab(item.tab)}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors w-full",
                activeTab === item.tab ? "bg-primary/10 text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              )}>
              <item.icon className={cn("h-4 w-4", activeTab === item.tab ? "text-primary" : "text-gray-500")} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Center Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-white">
          <div className={cn(activeTab === "Widget" ? "w-full" : "max-w-4xl")}>
            <form className="space-y-8" onSubmit={e => e.preventDefault()}>

              {/* Knowledge Sources */}
              {(activeTab === "Knowledge" || activeTab === "Behavior") && (
                <section>
                  <div className="mb-4">
                    <h2 className="text-[18px] font-bold text-gray-900 mb-1">Knowledge Sources</h2>
                    <p className="text-[13px] text-gray-500">
                      The AI uses your knowledge base (Graph RAG) to answer questions accurately.
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-100/30 rounded-xl border border-border mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Zap className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-gray-900">Company Knowledge Base</p>
                        <p className="text-[12px] text-gray-500">Managed in Knowledge Hub → used by chatbot + voice agent</p>
                      </div>
                    </div>
                    <Link href="/dashboard/knowledge" className="text-[13px] text-primary hover:underline font-medium">
                      Manage →
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="useKb" {...register("useKnowledgeBase")} className="accent-primary" />
                    <label htmlFor="useKb" className="text-[13px] text-gray-900">Use knowledge base when answering questions</label>
                  </div>
                </section>
              )}

              {activeTab === "Behavior" && <div className="w-full h-px bg-[#E8E8E4]" />}

              {/* Behavior */}
              {activeTab === "Behavior" && (
                <section>
                  <h2 className="text-[18px] font-bold text-gray-900 mb-4">Chatbot Behavior</h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5">Bot Name (shown to customers)</label>
                      <input type="text" {...register("botName")}
                        className={cn("w-full border rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none", errors.botName ? "border-destructive" : "border-border")} />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5">Bot Persona / Tone</label>
                      <textarea rows={5} {...register("persona")}
                        className={cn("w-full border rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none", errors.persona ? "border-destructive" : "border-border")} />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5">Language</label>
                      <CustomSelect
                        value={watch("language")}
                        onChange={(val) => setValue("language", val, { shouldDirty: true })}
                        options={[
                          { value: "auto", label: "Auto-detect" },
                          { value: "en", label: "English only" },
                          { value: "hi", label: "Hindi only" },
                          { value: "hinglish", label: "Hinglish (Hindi + English)" }
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5">Response Length</label>
                      <div className="flex items-center gap-4">
                        <span className="text-[12px] text-gray-500">Concise</span>
                        <input type="range" min={0} max={100} {...register("responseLength", { valueAsNumber: true })} className="flex-1 accent-primary" />
                        <span className="text-[12px] text-gray-500">Detailed</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5">Out-of-Scope Fallback</label>
                      <textarea rows={2} {...register("fallback")}
                        className={cn("w-full border rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none", errors.fallback ? "border-destructive" : "border-border")} />
                    </div>
                  </div>
                </section>
              )}

              {/* FAQs tab */}
              {activeTab === "FAQs" && <FAQManager />}

              {/* Escalation */}
              {activeTab === "Escalation" && (
                <section>
                  <h2 className="text-[18px] font-bold text-gray-900 mb-4">Escalation Rules</h2>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 p-4 border border-border rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md">
                        <button type="button" className="w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors bg-[#10B981]">
                          <div className="bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 translate-x-4" />
                        </button>
                        <span className="text-[13px] font-medium text-gray-900">Escalate if unresolved after</span>
                        <input type="number" defaultValue={3} className="w-20 border border-border rounded-[6px] px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                        <span className="text-[13px] font-medium text-gray-900">user messages.</span>
                      </div>

                      <div className="flex items-center gap-3 p-4 border border-border rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md">
                        <button type="button" className="w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors bg-[#10B981]">
                          <div className="bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 translate-x-4" />
                        </button>
                        <span className="text-[13px] font-medium text-gray-900">Escalate if deal value exceeds</span>
                        <CustomSelect value="$" onChange={() => { }} options={[{ value: "$", label: "$" }, { value: "₹", label: "₹" }, { value: "€", label: "€" }]} className="w-20" />
                        <input type="number" defaultValue={10000} className="w-28 border border-border rounded-[6px] px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                      </div>

                      <div className="flex items-center gap-3 p-4 border border-border rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md">
                        <button type="button" className="w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors bg-[#10B981]">
                          <div className="bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 translate-x-4" />
                        </button>
                        <span className="text-[13px] font-medium text-gray-900">Customer explicitly asks for human</span>
                      </div>

                      <div className="flex items-center gap-3 p-4 border border-border rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md">
                        <button type="button" className="w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors bg-[#10B981]">
                          <div className="bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 translate-x-4" />
                        </button>
                        <span className="text-[13px] font-medium text-gray-900">Sentiment is negative/angry</span>
                      </div>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-2">When escalated, the conversation is assigned to the next available agent in the Shared Inbox.</p>
                  </div>
                </section>
              )}

              {/* Channels */}
              {activeTab === "Channels" && (
                <section className="space-y-6">
                  {/* Channel toggles */}
                  <div>
                    <h2 className="text-[18px] font-bold text-gray-900 mb-4">Active Channels</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-border rounded-lg p-4 flex items-center justify-between bg-gray-100/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#F0FDF4]">
                            <MessageSquare className="h-5 w-5 text-[#22C55E]" />
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-gray-900">WhatsApp Business</p>
                            <p className="text-[12px] text-gray-500">Auto-reply on WhatsApp</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setValue("whatsappEnabled", !whatsappEnabled)}
                          className={cn("w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors", whatsappEnabled ? "bg-[#22C55E]" : "bg-gray-100-foreground/30")}>
                          <div className={cn("bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200", whatsappEnabled ? "translate-x-4" : "")} />
                        </button>
                      </div>
                      <div className="border border-border rounded-lg p-4 flex items-center justify-between bg-gray-100/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100">
                            <Globe className="h-5 w-5 text-gray-900" />
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-gray-900">Web Widget</p>
                            <p className="text-[12px] text-gray-500">Chat bubble on your website</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setValue("webWidgetEnabled", !webWidgetEnabled)}
                          className={cn("w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors", webWidgetEnabled ? "bg-[#22C55E]" : "bg-gray-100-foreground/30")}>
                          <div className={cn("bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200", webWidgetEnabled ? "translate-x-4" : "")} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-3">
                      WhatsApp channel connects via your <Link href="/dashboard/settings" className="text-primary hover:underline">Settings → WhatsApp Business API</Link> credentials.
                    </p>
                  </div>

                  {/* Web Widget Full Studio */}
                  {webWidgetEnabled && (() => {
                    // Icon map for launcher
                    const launcherIcons: Array<{ id: string; icon: React.FC<any>; label: string }> = [
                      { id: "message-square", icon: MessageSquare, label: "Chat" },
                      { id: "bot", icon: Bot, label: "Bot" },
                      { id: "headphones", icon: Headphones, label: "Support" },
                      { id: "sparkles", icon: Sparkles, label: "AI" },
                      { id: "heart", icon: Heart, label: "Care" },
                      { id: "rocket", icon: Rocket, label: "Rocket" },
                      { id: "shield", icon: Shield, label: "Trust" },
                      { id: "bell", icon: Bell, label: "Alert" },
                    ]
                    const currentIcon = launcherIcons.find(i => i.id === widgetIconId) ?? launcherIcons[0]
                    const LauncherIcon = currentIcon.icon

                    // Widget style presets
                    const stylePresets = [
                      { id: "modern", label: "Modern", desc: "Rounded corners, drop shadow", borderRadius: "16px" },
                      { id: "minimal", label: "Minimal", desc: "Clean flat design", borderRadius: "8px" },
                      { id: "sharp", label: "Sharp", desc: "Angular, professional", borderRadius: "0px" },
                      { id: "pill", label: "Pill", desc: "Soft bubble style", borderRadius: "24px" },
                    ]
                    const currentStyle = stylePresets.find(s => s.id === widgetStyle) ?? stylePresets[0]

                    // Device dimensions
                    const deviceConfig = {
                      phone: { width: 320, height: 580, label: "Phone", scale: 1 },
                      tablet: { width: 640, height: 500, label: "Tablet", scale: 1 },
                      desktop: { width: 900, height: 540, label: "Desktop", scale: 1 },
                    }
                    const device = deviceConfig[previewDevice]

                    return (
                      <div className="border-t border-border pt-6">
                        {/* Studio Header: Unified bar with Save Widget on far right */}
                        <div className="flex items-center justify-between mb-5">
                          <div>
                            <h3 className="text-[16px] font-bold text-gray-900">Widget Studio</h3>
                            <p className="text-[12px] text-gray-500">Customize and preview your chat widget live</p>
                          </div>
                        </div>

                        {/* Main Studio: 2-column split pane — left scrolls, right is sticky */}
                        <div className="flex gap-6 items-start">

                          {/* LEFT: customization panel — accordion style, no internal scrollbar */}
                          <div
                            className="bg-white shadow-sm border border-border rounded-2xl shrink-0 flex flex-col overflow-hidden"
                            style={{ width: 340 }}
                          >
                            {/* Header Accordion (Open by default) */}
                            <div className="border-b border-border last:border-b-0">
                              <button type="button" onClick={() => setExpandedWidgetSection(expandedWidgetSection === "header" ? "" : "header")}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors">
                                <span className="text-[15px] font-bold text-gray-900 tracking-tight">Header</span>
                                <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform duration-200", expandedWidgetSection === "header" ? "rotate-180" : "")} />
                              </button>
                              {expandedWidgetSection === "header" && (
                                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-1">Custom Header Icon Image URL</label>
                                    <input type="text" {...register("widgetCustomHeaderIcon")} placeholder="https://example.com/logo.png" className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white shadow-sm" />
                                  </div>
                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-1">Title</label>
                                    <input type="text" {...register("widgetTitle")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white shadow-sm" />
                                  </div>
                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-1">Subtitle</label>
                                    <input type="text" {...register("widgetSubtitle")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white shadow-sm" />
                                  </div>
                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-1">Greeting message</label>
                                    <textarea rows={2} {...register("widgetGreeting")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white resize-none shadow-sm" />
                                  </div>
                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-1">Input placeholder</label>
                                    <input type="text" {...register("widgetPlaceholder")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white shadow-sm" />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Theme Accordion */}
                            <div className="border-b border-border last:border-b-0">
                              <button type="button" onClick={() => setExpandedWidgetSection(expandedWidgetSection === "theme" ? "" : "theme")}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors">
                                <span className="text-[14px] font-semibold text-gray-900 tracking-tight">Theme & Style</span>
                                <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform duration-200", expandedWidgetSection === "theme" ? "rotate-180" : "")} />
                              </button>
                              {expandedWidgetSection === "theme" && (
                                <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-2">Primary Color</label>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className="relative flex items-center shadow-sm">
                                        <input type="color" {...register("widgetPrimaryColor")} className="w-10 h-10 rounded-l-lg border border-border border-r-0 cursor-pointer shrink-0 p-1 bg-white" />
                                        <input type="text" {...register("widgetPrimaryColor")} className="w-24 h-10 border border-border rounded-r-lg px-2 text-[13px] font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary uppercase bg-white" placeholder="#000000" />
                                      </div>
                                      <div className="w-px h-6 bg-border mx-2" />
                                      {["#7c3aed", "#2563eb", "#059669", "#ea580c", "#e11d48", "#0891b2", "#4f46e5", "#d97706", "#111827"].map(c => (
                                        <button key={c} type="button" onClick={() => setValue("widgetPrimaryColor", c)}
                                          className={cn("w-7 h-7 rounded-full border-2 transition-transform shrink-0", widgetPrimaryColor === c ? "border-foreground scale-110" : "border-white hover:scale-105 shadow")}
                                          style={{ backgroundColor: c }} />
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-2">Widget Style</label>
                                    <div className="grid grid-cols-2 gap-2">
                                      {stylePresets.map(preset => (
                                        <button key={preset.id} type="button" onClick={() => setValue("widgetStyle", preset.id)}
                                          className={cn("p-2.5 border-2 rounded-xl text-left transition-all",
                                            widgetStyle === preset.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 bg-white"
                                          )}>
                                          <p className="text-[12px] font-semibold text-gray-900">{preset.label}</p>
                                          <p className="text-[10px] text-gray-500">{preset.desc}</p>
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-2">Launcher Icon</label>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                      {launcherIcons.map(({ id, icon: Icon, label }) => (
                                        <button key={id} type="button" onClick={() => setValue("widgetIconId", id)}
                                          title={label}
                                          className={cn("w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
                                            widgetIconId === id && !watch("widgetCustomLauncherIcon") ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 bg-white shadow-sm hover:shadow"
                                          )}>
                                          <Icon className={cn("h-5 w-5", widgetIconId === id && !watch("widgetCustomLauncherIcon") ? "text-primary" : "text-gray-500")} />
                                        </button>
                                      ))}
                                    </div>
                                    <div className="space-y-3 pt-3 border-t border-border/50">
                                      <div>
                                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Custom Launcher Icon Image URL (overrides default)</label>
                                        <input type="text" {...register("widgetCustomLauncherIcon")} placeholder="https://example.com/launcher.png" className="w-full border border-border rounded-lg px-3 py-2 text-[12px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white shadow-sm" />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Custom Bot Message Avatar Image URL</label>
                                        <input type="text" {...register("widgetCustomBotAvatar")} placeholder="https://example.com/avatar.png" className="w-full border border-border rounded-lg px-3 py-2 text-[12px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white shadow-sm" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Position & Branding Accordion */}
                            <div className="border-b border-border last:border-b-0">
                              <button type="button" onClick={() => setExpandedWidgetSection(expandedWidgetSection === "position" ? "" : "position")}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors">
                                <span className="text-[14px] font-semibold text-gray-900 tracking-tight">Position & Options</span>
                                <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform duration-200", expandedWidgetSection === "position" ? "rotate-180" : "")} />
                              </button>
                              {expandedWidgetSection === "position" && (
                                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div>
                                    <label className="block text-[12px] font-medium text-gray-500 mb-1.5">Position</label>
                                    <CustomSelect
                                      value={watch("widgetPosition") || "right"}
                                      onChange={(val) => setValue("widgetPosition", val as "right" | "left")}
                                      options={[
                                        { value: "right", label: "Bottom Right" },
                                        { value: "left", label: "Bottom Left" }
                                      ]}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between w-full p-3 border border-border rounded-xl bg-white shadow-sm mt-3 transition-shadow hover:shadow-md">
                                    <div>
                                      <p className="text-[13px] font-semibold text-gray-900">Branding</p>
                                      <p className="text-[11px] text-gray-500 mt-0.5">Show "Powered by Flowra"</p>
                                    </div>
                                    <button type="button" onClick={() => setValue("widgetShowBranding", !widgetShowBranding)}
                                      className={cn("w-10 h-6 rounded-full relative transition-colors shrink-0", !widgetShowBranding && "bg-slate-200")}
                                      style={{ backgroundColor: widgetShowBranding ? (watch("widgetPrimaryColor") || "#7c3aed") : undefined }}>
                                      <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm", widgetShowBranding ? "translate-x-5" : "translate-x-1")} />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Install Accordion */}
                            <div className="border-b border-border last:border-b-0 bg-[#F9FAFB]">
                              <button type="button" onClick={() => setExpandedWidgetSection(expandedWidgetSection === "install" ? "" : "install")}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-100 transition-colors">
                                <span className="text-[14px] font-semibold text-gray-900 tracking-tight">Install</span>
                                <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform duration-200", expandedWidgetSection === "install" ? "rotate-180" : "")} />
                              </button>
                              {expandedWidgetSection === "install" && (
                                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div className="relative bg-foreground rounded-xl p-3 pr-16 overflow-hidden">
                                    <code className="text-[10px] font-mono text-white/70 break-all leading-relaxed">
                                      {`<script src="${origin}/api/widget/embed.js" data-workspace-id="${workspaceId}" async defer></script>`}
                                    </code>
                                    <button type="button" onClick={() => {
                                      navigator.clipboard.writeText(`<script src="${origin}/api/widget/embed.js" data-workspace-id="${workspaceId}" async defer></script>`)
                                      toast.success("Copied!")
                                    }} className="absolute right-2 top-2 flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-medium transition-colors">
                                      <Copy className="h-3 w-3" /> Copy
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* RIGHT: Live Preview Area — independent, no clipping */}
                          <div className="flex-1 flex flex-col min-w-0 sticky top-6">

                            {/* Command Bar — Unified */}
                            <div className="flex items-center gap-2 w-full mb-4">
                              {/* Device segment control */}
                              <div className="flex items-center bg-gray-100 p-1 rounded-md shrink-0">
                                {([
                                  { id: "desktop", icon: Monitor, label: "Desktop" },
                                  { id: "tablet", icon: Tablet, label: "Tablet" },
                                  { id: "phone", icon: Smartphone, label: "Phone" },
                                ] as const).map(({ id, icon: Icon, label }) => (
                                  <button key={id} type="button" onClick={() => setPreviewDevice(id)}
                                    title={label}
                                    className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded transition-colors",
                                      previewDevice === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                                    )}>
                                    <Icon className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{label}</span>
                                  </button>
                                ))}
                              </div>

                              {/* Widget open/close toggle */}
                              <button type="button" onClick={() => setWidgetOpen(p => !p)}
                                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-medium transition-colors shrink-0",
                                  widgetOpen ? "border-primary bg-primary text-white hover:bg-primary/90" : "border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                )}>
                                <MessageSquare className="h-3.5 w-3.5" />
                                {widgetOpen ? "Widget Open" : "Widget Closed"}
                              </button>

                              <div className="flex-1" />

                              {/* Save Widget */}
                              <button type="button" onClick={handleSubmit(onSave, (errs) => {
                                console.error("Validation errors:", errs);
                                toast.error("Could not save. Please check the 'Behavior' tab for invalid fields.");
                              })} disabled={savingSettings}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-bold bg-[#10B981] text-white rounded-md hover:bg-[#059669] transition-colors disabled:opacity-50 shadow-sm shrink-0">
                                {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                Save Widget
                              </button>
                            </div>

                            {/* Dot Grid Canvas — unclamped container */}
                            <div
                              className="relative w-full flex-1 flex flex-col items-center justify-start transition-all duration-300 bg-[#F9FAFB] rounded-xl border border-gray-100 overflow-hidden pt-6 pb-20 min-h-[700px]"
                              style={{
                                backgroundImage: "radial-gradient(#E5E7EB 1px, transparent 1px)",
                                backgroundSize: "20px 20px",
                              }}
                            >
                              {/* Locked Device Viewport with dynamic scaling so it doesn't overflow */}
                              <div
                                className={cn("relative flex flex-col bg-white shadow-2xl border border-gray-200 transition-all duration-300 origin-top",
                                  previewDevice === "phone" ? "w-[375px] h-[812px] rounded-[2.5rem] border-[8px] border-gray-100 shrink-0 scale-[0.75]" :
                                    previewDevice === "tablet" ? "w-[768px] h-[1024px] rounded-3xl border-[8px] border-gray-100 shrink-0 scale-[0.6]" :
                                      "w-full h-full min-h-[600px] border-x-0"
                                )}
                              >
                                {/* Browser Bar (Interactive URL) */}
                                <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 border-b border-gray-200 shrink-0">
                                  <div className="flex-1 flex items-center bg-white rounded-md px-3 py-1.5 border border-gray-200 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-sm">
                                    <Globe className="h-4 w-4 text-gray-500 mr-2 shrink-0" />
                                    <input
                                      type="text"
                                      value={previewUrlInput}
                                      onChange={e => setPreviewUrlInput(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") {
                                          const u = previewUrlInput.trim()
                                          setPreviewUrl(u ? (u.startsWith("http") ? u : `https://${u}`) : null)
                                        }
                                      }}
                                      placeholder="Enter website URL to preview (e.g. yourwebsite.com) and press Enter"
                                      className="flex-1 text-[13px] bg-transparent outline-none text-gray-900 placeholder:text-gray-500"
                                    />
                                  </div>
                                </div>

                                {/* Page content / iframe */}
                                <div className="flex-1 relative bg-white flex flex-col min-h-0 overflow-hidden">
                                  {previewUrl ? (
                                    <iframe
                                      key={previewUrl}
                                      src={previewUrl}
                                      className="w-full h-full border-0"
                                      sandbox="allow-scripts allow-same-origin allow-forms"
                                      title="Preview"
                                      onLoad={() => setPreviewUrlLoading(false)}
                                      onError={() => setPreviewUrlLoading(false)}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 opacity-40 p-8 text-center bg-gray-50/50">
                                      <Globe className="h-16 w-16 mb-4 text-gray-300" />
                                      <p className="text-[14px] max-w-[250px] leading-relaxed">Enter a URL in the browser bar above to preview the widget on your live site.</p>
                                    </div>
                                  )}

                                  {/* Floating Chat Widget — overlaid on page */}
                                  {widgetOpen && (
                                    <div
                                      className="absolute bottom-20 flex flex-col text-left transition-all duration-300 bg-white overflow-hidden min-w-[300px] min-h-[400px] max-w-[600px] max-h-[800px]"
                                      style={{
                                        [widgetPosition === "right" ? "right" : "left"]: "20px",
                                        width: widgetSize.width,
                                        height: widgetSize.height,
                                        borderRadius: currentStyle.borderRadius,
                                        boxShadow: "0 24px 48px -12px rgba(0,0,0,0.18)",
                                        border: "1px solid rgba(0,0,0,0.05)",
                                      }}
                                    >
                                      {/* Custom Drag Handle */}
                                      <div
                                        onMouseDown={handleWidgetResize}
                                        className={cn("absolute top-0 w-6 h-6 flex items-start justify-start p-1.5 z-50 transition-colors group",
                                          widgetPosition === "left" ? "right-0 cursor-nesw-resize" : "left-0 cursor-nwse-resize"
                                        )}
                                      >
                                        <div className="w-2.5 h-2.5 rounded-full bg-black/5 backdrop-blur-sm shadow-sm opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all flex items-center justify-center border border-black/10">
                                          <div className="w-1 h-1 rounded-full bg-black/40" />
                                        </div>
                                      </div>

                                      {/* Widget header */}
                                      <div className="p-4 text-white flex items-center justify-between shrink-0" style={{ backgroundColor: widgetPrimaryColor }}>
                                        <div className="flex items-center gap-3">
                                          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                            {watch("widgetCustomHeaderIcon") ? (
                                              <img src={watch("widgetCustomHeaderIcon")} alt="Header" className="w-full h-full object-cover" />
                                            ) : (
                                              <LauncherIcon className="h-5 w-5 text-white" />
                                            )}
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-[14px] font-bold leading-tight truncate">{widgetTitle || "Chat with us"}</p>
                                            <p className="text-[11px] text-white/80 leading-none mt-0.5 truncate">{widgetSubtitle || "Ask us anything"}</p>
                                          </div>
                                        </div>
                                        <div onClick={() => setWidgetOpen(false)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors shrink-0">
                                          <ChevronDown className="h-4 w-4 text-white" />
                                        </div>
                                      </div>

                                      {/* Messages */}
                                      <div className="flex-1 bg-[#F9FAFB] p-4 overflow-y-auto space-y-4">
                                        <div className="flex items-start gap-2 max-w-[85%]">
                                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] shrink-0 shadow-sm mt-1 overflow-hidden" style={{ backgroundColor: widgetPrimaryColor }}>
                                            {watch("widgetCustomBotAvatar") ? (
                                              <img src={watch("widgetCustomBotAvatar")} alt="Bot" className="w-full h-full object-cover" />
                                            ) : (
                                              <LauncherIcon className="h-3.5 w-3.5" />
                                            )}
                                          </div>
                                          <div className="bg-white border border-black/5 p-3 shadow-sm text-left relative" style={{ borderRadius: currentStyle.borderRadius }}>
                                            <p className="text-[13px] text-gray-900 leading-relaxed">{widgetGreeting || "Hi! How can I help?"}</p>
                                          </div>
                                        </div>
                                        {/* Dummy user message */}
                                        <div className="flex justify-end">
                                          <div className="px-3 py-2 text-white max-w-[75%] shadow-sm" style={{ backgroundColor: widgetPrimaryColor, borderRadius: currentStyle.borderRadius }}>
                                            <p className="text-[13px] leading-relaxed">What are your pricing plans?</p>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-2 max-w-[85%]">
                                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] shrink-0 shadow-sm mt-1 overflow-hidden" style={{ backgroundColor: widgetPrimaryColor }}>
                                            {watch("widgetCustomBotAvatar") ? (
                                              <img src={watch("widgetCustomBotAvatar")} alt="Bot" className="w-full h-full object-cover" />
                                            ) : (
                                              <LauncherIcon className="h-3.5 w-3.5" />
                                            )}
                                          </div>
                                          <div className="bg-white border border-black/5 p-3 shadow-sm relative" style={{ borderRadius: currentStyle.borderRadius }}>
                                            <p className="text-[13px] text-gray-900 leading-relaxed">We have plans starting from ₹999/mo. Would you like more details? 😊</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Input bar */}
                                      <div className="p-3 border-t border-black/5 bg-white shrink-0">
                                        <div className="flex gap-2 items-center border border-gray-200 rounded-full px-4 py-2 hover:border-gray-300 transition-colors bg-gray-50 focus-within:bg-white focus-within:ring-1 focus-within:ring-primary/20">
                                          <input disabled type="text" placeholder={widgetPlaceholder || "Type your message..."}
                                            className="flex-1 text-[13px] bg-transparent outline-none text-gray-900 placeholder:text-gray-500" />
                                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 cursor-not-allowed shadow-sm opacity-80" style={{ backgroundColor: widgetPrimaryColor }}>
                                            <Send className="w-3.5 h-3.5 ml-0.5" />
                                          </div>
                                        </div>
                                        {widgetShowBranding && (
                                          <p className="text-[10.5px] text-center text-gray-500/60 mt-2 font-medium">Powered by Flowra</p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Launcher button */}
                                  <button
                                    type="button"
                                    onClick={() => setWidgetOpen(p => !p)}
                                    className="absolute bottom-5 w-14 h-14 flex items-center justify-center text-white shadow-[0_12px_24px_-6px_rgba(0,0,0,0.2)] transition-all duration-200 hover:scale-105 border border-black/5 z-40 overflow-hidden"
                                    style={{
                                      [widgetPosition === "right" ? "right" : "left"]: "20px",
                                      backgroundColor: widgetPrimaryColor,
                                      borderRadius: widgetStyle === "sharp" ? "12px" : widgetStyle === "minimal" ? "16px" : "50%",
                                    }}
                                  >
                                    {widgetOpen
                                      ? <ChevronDown className="w-6 h-6" />
                                      : watch("widgetCustomLauncherIcon") ? (
                                        <img src={watch("widgetCustomLauncherIcon")} alt="Launcher" className="w-full h-full object-cover" />
                                      ) : (
                                        <LauncherIcon className="w-6 h-6" />
                                      )
                                    }
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Preview info bar — dimension badge lives here */}
                            <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-2">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-400" />
                                <span>Live preview — changes reflected instantly</span>
                              </div>
                              <span>·</span>
                              <span className="font-mono text-[11px] bg-slate-800 text-slate-100 px-2 py-0.5 rounded">
                                {device.width}px × {device.height}px
                              </span>
                              <span>·</span>
                              <span>{device.label}</span>
                              {previewUrl && (
                                <>
                                  <span>·</span>
                                  <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-primary hover:underline">
                                    <ExternalLink className="h-3 w-3" /> Open site
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </section>
              )}

              {/* Analytics Dashboard */}
              {activeTab === "Analytics" && (
                <section className="space-y-6">
                  <div className="mb-4">
                    <h2 className="text-[18px] font-bold text-gray-900 mb-1">Chatbot Analytics</h2>
                    <p className="text-[13px] text-gray-500">Monitor performance and engagement metrics.</p>
                  </div>
                  {/* Top Row: Metric Grid */}
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { label: "Total Conversations", value: "1,248" },
                      { label: "Escalation Rate", value: "12.4%" },
                      { label: "Avg Resolution Time", value: "3m 45s" },
                      { label: "AI Deflection Rate", value: "87.6%" },
                    ].map((metric, i) => (
                      <div key={i} className="bg-white border border-border p-4 rounded-xl shadow-sm">
                        <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider">{metric.label}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-2">{metric.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Main Chart Placeholder */}
                  <div className="bg-white border border-border rounded-xl p-6 shadow-sm min-h-[400px] flex flex-col items-center justify-center">
                    <BarChart3 className="h-10 w-10 text-gray-500/30 mb-3" />
                    <p className="text-[14px] font-semibold text-gray-500">Conversations over 30 Days</p>
                    <p className="text-[12px] text-gray-500">Line chart visualization pending integration.</p>
                  </div>
                </section>
              )}
            </form>
          </div>
        </div>

        {/* Full-Screen Immersive Chat Playground (Testing Tab) */}
        {activeTab === "Testing" && (
          <div className="absolute inset-0 bg-[#ECE5DD] z-40 flex flex-col items-center">
            <div className="w-full bg-[#075E54] p-4 flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#C4B1F9] flex items-center justify-center text-white text-lg font-bold">A</div>
                <div>
                  <p className="text-[15px] font-bold text-white">Aria Chatbot (Immersive Playground)</p>
                  <p className="text-[12px] text-white/80">Uses live knowledge base + behavior settings</p>
                </div>
              </div>
              <button onClick={() => setActiveTab("Behavior")} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[13px] rounded-lg transition-colors">
                Close Playground
              </button>
            </div>

            <div ref={chatScrollRef} className="flex-1 w-full max-w-3xl overflow-y-auto p-6 space-y-4">
              <div className="bg-[#E1F3FB] text-[#1E3A8A] text-[12px] p-2 rounded-lg text-center mx-auto max-w-xs mb-4 shadow-sm">
                Chat securely with your AI configuration
              </div>
              {testMessages.map(msg => (
                <div key={msg.id} className={cn("p-3 rounded-lg shadow-sm max-w-[75%] relative",
                  msg.sender === "user" ? "self-end ml-auto bg-[#DCF8C6] rounded-tr-none" : "self-start bg-white rounded-tl-none"
                )}>
                  <p className="text-[14px] text-gray-900 whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                </div>
              ))}
              {isTyping && (
                <div className="self-start bg-white px-4 py-3 rounded-lg rounded-tl-none shadow-sm flex gap-1">
                  {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
                </div>
              )}
            </div>

            <div className="w-full bg-[#F0F0F0] p-4 shrink-0 flex justify-center">
              <div className="w-full max-w-3xl flex items-center gap-3">
                <input type="text" value={testInput} onChange={e => setTestInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleTestSend()}
                  placeholder="Type a message..."
                  className="bg-white rounded-full flex-1 h-12 px-6 text-[14px] outline-none shadow-sm focus:ring-1 focus:ring-[#075E54]" />
                <button onClick={handleTestSend} disabled={isTyping || !testInput.trim()}
                  className="w-12 h-12 bg-[#075E54] rounded-full flex items-center justify-center shrink-0 hover:bg-[#054c44] transition-colors disabled:opacity-50 shadow-sm">
                  <Send className="h-5 w-5 text-white ml-[-2px]" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Global Test Bot Drawer */}
      <div className={cn("fixed top-0 right-0 h-screen w-[400px] z-50 bg-gray-50 border-l border-gray-200 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col",
        isTestDrawerOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-4 border-b border-border flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-gray-900">Test Chat</h3>
            <span className="text-[11px] text-[#059669] bg-[#059669]/10 px-2 py-0.5 rounded-full font-medium">Live AI</span>
          </div>
          <button onClick={() => setIsTestDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 bg-[#ECE5DD] flex flex-col overflow-hidden">
          <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 scroll-smooth">
            {testMessages.map(msg => (
              <div key={msg.id} className={cn("p-2.5 rounded-lg shadow-sm max-w-[85%] text-[13px] relative",
                msg.sender === "user" ? "self-end ml-auto bg-[#DCF8C6] rounded-tr-none" : "self-start bg-white rounded-tl-none"
              )}>
                <p className="text-gray-900 whitespace-pre-wrap">{msg.text}</p>
              </div>
            ))}
            {isTyping && (
              <div className="self-start bg-white px-3 py-2 rounded-lg rounded-tl-none shadow-sm flex gap-1">
                {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
              </div>
            )}
          </div>
          <div className="bg-[#F0F0F0] p-3 flex items-center gap-2 border-t border-border">
            <input type="text" value={testInput} onChange={e => setTestInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTestSend()}
              placeholder="Ask your bot..."
              className="bg-white rounded-full flex-1 h-10 px-4 text-[13px] outline-none shadow-sm" />
            <button onClick={handleTestSend} disabled={isTyping || !testInput.trim()}
              className="w-10 h-10 bg-[#075E54] rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 hover:bg-[#054c44] transition-colors shadow-sm">
              <Send className="h-4 w-4 text-white ml-[-2px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
