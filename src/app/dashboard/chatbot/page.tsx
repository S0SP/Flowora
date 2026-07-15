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

const navItems = [
  { icon: BookOpen,    label: "Knowledge",  tab: "Knowledge"  },
  { icon: Sliders,     label: "Behavior",   tab: "Behavior"   },
  { icon: HelpCircle,  label: "FAQs",       tab: "FAQs"       },
  { icon: GitBranch,   label: "Escalation", tab: "Escalation" },
  { icon: Radio,       label: "Channels",   tab: "Channels"   },
  { icon: FlaskConical,label: "Testing",    tab: "Testing"    },
  { icon: BarChart3,   label: "Analytics",  tab: "Analytics"  },
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
        <h2 className="text-[18px] font-bold text-foreground mb-1">Fixed FAQ Answers</h2>
        <p className="text-[13px] text-muted-foreground">
          These answers are returned <strong>instantly without AI</strong> when a customer's message matches.
          Useful for pricing, hours, contact info — no LLM cost, zero latency.
        </p>
      </div>

      {/* Priority notice */}
      <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[13px] text-foreground">
          FAQs are checked <strong>before the AI knowledge base</strong>. If a question matches, the fixed answer
          is sent instantly — no API call needed.
        </p>
      </div>

      {/* FAQ list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
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
                    <label className="text-[12px] font-medium text-foreground block mb-1">Trigger phrase (what customer says)</label>
                    <input
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
                      defaultValue={faq.question}
                      id={`q-${faq.id}`}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-foreground block mb-1">Reply (what bot says)</label>
                    <textarea rows={3}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
                      defaultValue={faq.answer}
                      id={`a-${faq.id}`}
                    />
                  </div>
                  <select defaultValue={faq.match_type} id={`m-${faq.id}`}
                    className="border border-border rounded-lg px-3 py-2 text-[13px]">
                    <option value="contains">Contains</option>
                    <option value="exact">Exact match</option>
                    <option value="starts_with">Starts with</option>
                  </select>
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
                      <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium capitalize">{faq.match_type}</span>
                      {!faq.is_active && <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-medium">Disabled</span>}
                    </div>
                    <p className="text-[13px] font-semibold text-foreground mb-0.5">"{faq.question}"</p>
                    <p className="text-[13px] text-muted-foreground line-clamp-2">{faq.answer}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setEditingId(faq.id ?? null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => faq.id && handleDelete(faq.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {faqs.length === 0 && !showAdd && (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No FAQs yet — add common customer questions</p>
            </div>
          )}
        </div>
      )}

      {/* Add new FAQ */}
      {showAdd ? (
        <div className="border-2 border-primary/30 border-dashed rounded-xl p-4 space-y-3 bg-primary/5">
          <p className="text-[13px] font-semibold text-foreground">New FAQ Entry</p>
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
          <select value={newFaq.match_type} onChange={e => setNewFaq(p => ({ ...p, match_type: e.target.value as any }))}
            className="border border-border rounded-lg px-3 py-2 text-[13px] outline-none">
            <option value="contains">Contains match (recommended)</option>
            <option value="exact">Exact match</option>
            <option value="starts_with">Starts with</option>
          </select>
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
          className="w-full border-2 border-dashed border-border rounded-xl py-3 flex items-center justify-center gap-2 text-[14px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
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
  const [previewDevice, setPreviewDevice] = useState<"phone" | "tablet" | "desktop">("phone")
  const [previewUrlInput, setPreviewUrlInput] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewUrlLoading, setPreviewUrlLoading] = useState(false)
  const [widgetOpen, setWidgetOpen] = useState(true)
  const [previewExpanded, setPreviewExpanded] = useState(false)

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
          })
        }
      })
      .catch(() => {})
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
      <div className="flex-shrink-0 p-6 border-b border-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">AI Chatbot</h1>
            <div className="flex items-center gap-1.5 bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
              <span className="text-[12px] font-medium text-[#22C55E]">Active</span>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground">
            Powered by your knowledge base — answers customer questions autonomously on WhatsApp and Web.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/knowledge" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2">
            <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
          </Link>
          <button onClick={handleSubmit(onSave)} disabled={savingSettings}
            className="flex items-center gap-1.5 px-5 py-2.5 text-[14px] font-bold text-foreground bg-primary hover:bg-primary/90 shadow-sm rounded-lg transition-colors disabled:opacity-50">
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
                activeTab === item.tab ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
              <item.icon className={cn("h-4 w-4", activeTab === item.tab ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Center Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-white">
          <div className="max-w-4xl">
            <form className="space-y-8" onSubmit={e => e.preventDefault()}>

              {/* Knowledge Sources */}
              {(activeTab === "Knowledge" || activeTab === "Behavior") && (
                <section>
                  <div className="mb-4">
                    <h2 className="text-[18px] font-bold text-foreground mb-1">Knowledge Sources</h2>
                    <p className="text-[13px] text-muted-foreground">
                      The AI uses your knowledge base (Graph RAG) to answer questions accurately.
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Zap className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-foreground">Company Knowledge Base</p>
                        <p className="text-[12px] text-muted-foreground">Managed in Knowledge Hub → used by chatbot + voice agent</p>
                      </div>
                    </div>
                    <Link href="/dashboard/knowledge" className="text-[13px] text-primary hover:underline font-medium">
                      Manage →
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="useKb" {...register("useKnowledgeBase")} className="accent-primary" />
                    <label htmlFor="useKb" className="text-[13px] text-foreground">Use knowledge base when answering questions</label>
                  </div>
                </section>
              )}

              {activeTab === "Behavior" && <div className="w-full h-px bg-[#E8E8E4]" />}

              {/* Behavior */}
              {activeTab === "Behavior" && (
                <section>
                  <h2 className="text-[18px] font-bold text-foreground mb-4">Chatbot Behavior</h2>
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
                      <select {...register("language")} className="w-full border border-border rounded-md px-3 py-2 text-[13px] bg-white outline-none">
                        <option value="auto">Auto-detect</option>
                        <option value="en">English only</option>
                        <option value="hi">Hindi only</option>
                        <option value="hinglish">Hinglish (Hindi + English)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5">Response Length</label>
                      <div className="flex items-center gap-4">
                        <span className="text-[12px] text-muted-foreground">Concise</span>
                        <input type="range" min={0} max={100} {...register("responseLength", { valueAsNumber: true })} className="flex-1 accent-primary" />
                        <span className="text-[12px] text-muted-foreground">Detailed</span>
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
                  <h2 className="text-[18px] font-bold text-foreground mb-4">Escalation Rules</h2>
                  <div className="space-y-4">
                    <div className="p-4 border border-border rounded-xl">
                      <p className="text-[14px] font-semibold text-foreground mb-1">Escalate to human agent when:</p>
                      <div className="space-y-2 mt-3">
                        {["Customer explicitly asks for human", "Sentiment is negative/angry", "Issue unresolved after 3 exchanges", "High-value deal detected (>₹10,000)"].map((rule, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <input type="checkbox" defaultChecked className="accent-primary" />
                            <span className="text-[13px] text-foreground">{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-[12px] text-muted-foreground">When escalated, the conversation is assigned to the next available agent in the Shared Inbox.</p>
                  </div>
                </section>
              )}

              {/* Channels */}
              {activeTab === "Channels" && (
                <section className="space-y-6">
                  {/* Channel toggles */}
                  <div>
                    <h2 className="text-[18px] font-bold text-foreground mb-4">Active Channels</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-border rounded-lg p-4 flex items-center justify-between bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#F0FDF4]">
                            <MessageSquare className="h-5 w-5 text-[#22C55E]" />
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-foreground">WhatsApp Business</p>
                            <p className="text-[12px] text-muted-foreground">Auto-reply on WhatsApp</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setValue("whatsappEnabled", !whatsappEnabled)}
                          className={cn("w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors", whatsappEnabled ? "bg-[#22C55E]" : "bg-muted-foreground/30")}>
                          <div className={cn("bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200", whatsappEnabled ? "translate-x-4" : "")} />
                        </button>
                      </div>
                      <div className="border border-border rounded-lg p-4 flex items-center justify-between bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-muted">
                            <Globe className="h-5 w-5 text-foreground" />
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-foreground">Web Widget</p>
                            <p className="text-[12px] text-muted-foreground">Chat bubble on your website</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setValue("webWidgetEnabled", !webWidgetEnabled)}
                          className={cn("w-10 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors", webWidgetEnabled ? "bg-[#22C55E]" : "bg-muted-foreground/30")}>
                          <div className={cn("bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200", webWidgetEnabled ? "translate-x-4" : "")} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-3">
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
                      phone:   { width: 320,  height: 580,  label: "Phone",   scale: 1 },
                      tablet:  { width: 640,  height: 500,  label: "Tablet",   scale: 1 },
                      desktop: { width: 900,  height: 540,  label: "Desktop",  scale: 1 },
                    }
                    const device = deviceConfig[previewDevice]

                    return (
                      <div className="border-t border-border pt-6">
                        {/* Studio Header */}
                        <div className="flex items-center justify-between mb-5">
                          <div>
                            <h3 className="text-[16px] font-bold text-foreground">Widget Studio</h3>
                            <p className="text-[12px] text-muted-foreground">Customize and preview your chat widget live</p>
                          </div>
                          <button type="button" onClick={handleSubmit(onSave)} disabled={savingSettings}
                            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold bg-primary text-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm">
                            {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save Widget
                          </button>
                        </div>

                        {/* Main Studio: 2-column */}
                        <div className="grid grid-cols-[340px_1fr] gap-6 items-start">

                          {/* LEFT: customization panel */}
                          <div className="space-y-5 bg-muted/20 border border-border rounded-2xl p-5">

                            {/* Installation snippet */}
                            <div>
                              <p className="text-[12px] font-bold text-foreground uppercase tracking-wider mb-2">Install</p>
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

                            <div className="w-full h-px bg-border" />

                            {/* Header content */}
                            <div className="space-y-3">
                              <p className="text-[12px] font-bold text-foreground uppercase tracking-wider">Header</p>
                              <div>
                                <label className="block text-[12px] font-medium text-muted-foreground mb-1">Title</label>
                                <input type="text" {...register("widgetTitle")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white" />
                              </div>
                              <div>
                                <label className="block text-[12px] font-medium text-muted-foreground mb-1">Subtitle</label>
                                <input type="text" {...register("widgetSubtitle")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white" />
                              </div>
                              <div>
                                <label className="block text-[12px] font-medium text-muted-foreground mb-1">Greeting message</label>
                                <textarea rows={2} {...register("widgetGreeting")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white resize-none" />
                              </div>
                              <div>
                                <label className="block text-[12px] font-medium text-muted-foreground mb-1">Input placeholder</label>
                                <input type="text" {...register("widgetPlaceholder")} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-white" />
                              </div>
                            </div>

                            <div className="w-full h-px bg-border" />

                            {/* Theme */}
                            <div className="space-y-3">
                              <p className="text-[12px] font-bold text-foreground uppercase tracking-wider">Theme</p>
                              <div>
                                <label className="block text-[12px] font-medium text-muted-foreground mb-2">Primary Color</label>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <input type="color" {...register("widgetPrimaryColor")} className="w-9 h-9 rounded-lg border border-border cursor-pointer shrink-0 p-0.5" />
                                  {["#7c3aed","#2563eb","#059669","#ea580c","#e11d48","#0891b2","#4f46e5","#d97706","#111827"].map(c => (
                                    <button key={c} type="button" onClick={() => setValue("widgetPrimaryColor", c)}
                                      className={cn("w-7 h-7 rounded-full border-2 transition-transform shrink-0", widgetPrimaryColor === c ? "border-foreground scale-110" : "border-white hover:scale-105 shadow")}
                                      style={{ backgroundColor: c }} />
                                  ))}
                                </div>
                              </div>

                              {/* Style presets */}
                              <div>
                                <label className="block text-[12px] font-medium text-muted-foreground mb-2">Widget Style</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {stylePresets.map(preset => (
                                    <button key={preset.id} type="button" onClick={() => setValue("widgetStyle", preset.id)}
                                      className={cn("p-2.5 border-2 rounded-xl text-left transition-all",
                                        widgetStyle === preset.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                                      )}>
                                      <p className="text-[12px] font-semibold text-foreground">{preset.label}</p>
                                      <p className="text-[10px] text-muted-foreground">{preset.desc}</p>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Launcher icon */}
                              <div>
                                <label className="block text-[12px] font-medium text-muted-foreground mb-2">Launcher Icon</label>
                                <div className="flex flex-wrap gap-2">
                                  {launcherIcons.map(({ id, icon: Icon, label }) => (
                                    <button key={id} type="button" onClick={() => setValue("widgetIconId", id)}
                                      title={label}
                                      className={cn("w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all",
                                        widgetIconId === id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 bg-white"
                                      )}>
                                      <Icon className={cn("h-4 w-4", widgetIconId === id ? "text-primary" : "text-muted-foreground")} />
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Position */}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Position</label>
                                  <select {...register("widgetPosition")} className="w-full border border-border rounded-lg px-3 py-2 text-[12px] bg-white outline-none">
                                    <option value="right">Bottom Right</option>
                                    <option value="left">Bottom Left</option>
                                  </select>
                                </div>
                                <div className="flex items-end">
                                  <div className="flex items-center justify-between w-full p-2.5 border border-border rounded-xl bg-white">
                                    <div>
                                      <p className="text-[11px] font-semibold text-foreground">Branding</p>
                                      <p className="text-[10px] text-muted-foreground">Powered by Flowra</p>
                                    </div>
                                    <button type="button" onClick={() => setValue("widgetShowBranding", !widgetShowBranding)}
                                      className={cn("w-8 h-4.5 rounded-full relative transition-colors shrink-0", widgetShowBranding ? "bg-primary" : "bg-border")}>
                                      <div className={cn("absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm", widgetShowBranding ? "left-[18px]" : "left-0.5")} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* RIGHT: Live Preview Area */}
                          <div className="flex flex-col gap-3">

                            {/* Preview controls bar */}
                            <div className="flex items-center gap-3 flex-wrap">
                              {/* URL input */}
                              <div className="flex-1 flex items-center gap-2 min-w-[200px] border border-border rounded-xl px-3 py-2 bg-white shadow-sm">
                                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
                                  placeholder="Enter website URL to preview with... (optional)"
                                  className="flex-1 text-[12px] outline-none bg-transparent"
                                />
                                {previewUrlInput && (
                                  <button type="button" onClick={() => {
                                    const u = previewUrlInput.trim()
                                    setPreviewUrl(u ? (u.startsWith("http") ? u : `https://${u}`) : null)
                                  }} className="text-[11px] font-bold text-primary hover:text-primary/80">
                                    Load
                                  </button>
                                )}
                                {previewUrl && (
                                  <button type="button" onClick={() => { setPreviewUrl(null); setPreviewUrlInput("") }}
                                    className="text-[11px] text-muted-foreground hover:text-destructive">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Device switcher */}
                              <div className="flex items-center border border-border rounded-xl overflow-hidden bg-white shadow-sm">
                                {([
                                  { id: "phone",   icon: Smartphone, label: "Phone" },
                                  { id: "tablet",  icon: Tablet,     label: "Tablet" },
                                  { id: "desktop", icon: Monitor,    label: "Desktop" },
                                ] as const).map(({ id, icon: Icon, label }) => (
                                  <button key={id} type="button" onClick={() => setPreviewDevice(id)}
                                    title={label}
                                    className={cn("flex items-center gap-1 px-3 py-2 text-[12px] font-medium transition-colors",
                                      previewDevice === id ? "bg-foreground text-white" : "text-muted-foreground hover:text-foreground"
                                    )}>
                                    <Icon className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{label}</span>
                                  </button>
                                ))}
                              </div>

                              {/* Widget open/close toggle */}
                              <button type="button" onClick={() => setWidgetOpen(p => !p)}
                                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-colors shadow-sm",
                                  widgetOpen ? "border-primary bg-primary/5 text-primary" : "border-border bg-white text-muted-foreground hover:text-foreground"
                                )}>
                                <MessageSquare className="h-3.5 w-3.5" />
                                {widgetOpen ? "Widget Open" : "Widget Closed"}
                              </button>

                              {/* Expand toggle */}
                              <button type="button" onClick={() => setPreviewExpanded(p => !p)}
                                title="Toggle expanded preview"
                                className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-border bg-white text-muted-foreground hover:text-foreground text-[12px] shadow-sm transition-colors">
                                {previewExpanded ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
                              </button>
                            </div>

                            {/* Device Preview Frame */}
                            <div className={cn(
                              "flex items-start justify-center bg-[#1a1a2e] rounded-2xl p-4 transition-all duration-300 overflow-hidden",
                              previewExpanded ? "min-h-[700px]" : "min-h-[520px]"
                            )}>
                              {/* Device chrome */}
                              <div
                                className="relative flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-white transition-all duration-300"
                                style={{
                                  width: previewExpanded ? Math.min(device.width * 1.15, 1100) : device.width,
                                  maxWidth: "100%",
                                  minHeight: previewExpanded ? device.height * 1.15 : device.height,
                                }}
                              >
                                {/* Browser chrome */}
                                <div className="bg-[#f5f5f7] px-4 py-2 flex items-center gap-2 border-b border-[#e0e0e0] shrink-0">
                                  <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                                    <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                                    <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                                  </div>
                                  <div className="flex-1 flex items-center bg-white rounded-md px-3 py-1 mx-4 border border-[#ddd]">
                                    <Globe className="h-3 w-3 text-muted-foreground mr-2 shrink-0" />
                                    <span className="text-[11px] text-muted-foreground truncate">
                                      {previewUrl || "mywebsite.com"}
                                    </span>
                                  </div>
                                </div>

                                {/* Page content / iframe */}
                                <div className="flex-1 relative overflow-hidden bg-gray-50">
                                  {previewUrl ? (
                                    <iframe
                                      key={previewUrl}
                                      src={previewUrl}
                                      className="w-full h-full border-0"
                                      style={{ minHeight: previewExpanded ? device.height * 1.15 - 38 : device.height - 38 }}
                                      sandbox="allow-scripts allow-same-origin allow-forms"
                                      title="Preview"
                                      onLoad={() => setPreviewUrlLoading(false)}
                                      onError={() => setPreviewUrlLoading(false)}
                                    />
                                  ) : (
                                    /* Placeholder website content */
                                    <div className="w-full h-full flex flex-col" style={{ minHeight: previewExpanded ? device.height * 1.15 - 38 : device.height - 38 }}>
                                      {/* Fake nav */}
                                      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between shrink-0">
                                        <div className="w-16 h-4 bg-gray-200 rounded" />
                                        <div className="flex gap-3">
                                          {[1,2,3].map(i => <div key={i} className="w-10 h-3 bg-gray-100 rounded" />)}
                                        </div>
                                        <div className="w-16 h-7 bg-primary/20 rounded-lg" />
                                      </div>
                                      {/* Fake hero */}
                                      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
                                        <div className="w-3/4 h-6 bg-gray-200 rounded" />
                                        <div className="w-2/3 h-4 bg-gray-100 rounded" />
                                        <div className="w-1/2 h-4 bg-gray-100 rounded" />
                                        <div className="w-28 h-9 bg-primary/20 rounded-xl mt-2" />
                                        <p className="text-[11px] text-muted-foreground/50 mt-4">Enter a URL above to preview with your real website</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Floating Chat Widget — overlaid on page */}
                                  {widgetOpen && (
                                    <div
                                      className="absolute bottom-16 bg-white shadow-2xl flex flex-col text-left transition-all duration-300 overflow-hidden"
                                      style={{
                                        [widgetPosition === "right" ? "right" : "left"]: "12px",
                                        width: Math.min(300, device.width - 40),
                                        maxHeight: device.height * 0.65,
                                        borderRadius: currentStyle.borderRadius,
                                        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                                        border: "1px solid rgba(0,0,0,0.08)",
                                      }}
                                    >
                                      {/* Widget header */}
                                      <div className="p-3 text-white flex items-center justify-between" style={{ backgroundColor: widgetPrimaryColor }}>
                                        <div className="flex items-center gap-2">
                                          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                            <LauncherIcon className="h-4 w-4 text-white" />
                                          </div>
                                          <div>
                                            <p className="text-[12px] font-bold leading-tight">{widgetTitle || "Chat with us"}</p>
                                            <p className="text-[9px] text-white/75 leading-none">{widgetSubtitle || "Ask us anything"}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20">
                                            <ChevronDown className="h-3 w-3 text-white" />
                                          </div>
                                        </div>
                                      </div>

                                      {/* Messages */}
                                      <div className="flex-1 bg-[#f9fafb] p-3 overflow-y-auto space-y-2" style={{ minHeight: 100, maxHeight: 180 }}>
                                        <div className="flex items-start gap-1.5 max-w-[88%]">
                                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] shrink-0" style={{ backgroundColor: widgetPrimaryColor }}>
                                            <LauncherIcon className="h-3 w-3" />
                                          </div>
                                          <div className="bg-white border border-gray-100 p-2.5 shadow-sm text-left" style={{ borderRadius: currentStyle.borderRadius }}>
                                            <p className="text-[11px] text-foreground leading-snug">{widgetGreeting || "Hi! How can I help?"}</p>
                                          </div>
                                        </div>
                                        {/* Dummy user message */}
                                        <div className="flex justify-end">
                                          <div className="px-3 py-2 text-white max-w-[75%]" style={{ backgroundColor: widgetPrimaryColor, borderRadius: currentStyle.borderRadius }}>
                                            <p className="text-[11px] leading-snug">What are your pricing plans?</p>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-1.5 max-w-[88%]">
                                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] shrink-0" style={{ backgroundColor: widgetPrimaryColor }}>
                                            <LauncherIcon className="h-3 w-3" />
                                          </div>
                                          <div className="bg-white border border-gray-100 p-2.5 shadow-sm" style={{ borderRadius: currentStyle.borderRadius }}>
                                            <p className="text-[11px] text-foreground leading-snug">We have plans starting from ₹999/mo. Would you like more details? 😊</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Input bar */}
                                      <div className="p-2.5 border-t border-gray-100 bg-white flex flex-col gap-1">
                                        <div className="flex gap-1.5 items-center border border-gray-200 rounded-full px-3 py-1.5" style={{ borderRadius: currentStyle.borderRadius }}>
                                          <input disabled type="text" placeholder={widgetPlaceholder || "Type your message..."}
                                            className="flex-1 text-[10px] bg-transparent outline-none text-muted-foreground" />
                                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0" style={{ backgroundColor: widgetPrimaryColor }}>
                                            <Send className="w-3 h-3" />
                                          </div>
                                        </div>
                                        {widgetShowBranding && (
                                          <p className="text-[8px] text-center text-muted-foreground/60">Powered by Flowra</p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Launcher button */}
                                  <button
                                    type="button"
                                    onClick={() => setWidgetOpen(p => !p)}
                                    className="absolute bottom-4 w-12 h-12 flex items-center justify-center text-white shadow-xl transition-all duration-200 hover:scale-105"
                                    style={{
                                      [widgetPosition === "right" ? "right" : "left"]: "12px",
                                      backgroundColor: widgetPrimaryColor,
                                      borderRadius: widgetStyle === "sharp" ? "8px" : widgetStyle === "minimal" ? "12px" : "50%",
                                    }}
                                  >
                                    {widgetOpen
                                      ? <ChevronDown className="w-5 h-5" />
                                      : <LauncherIcon className="w-5 h-5" />
                                    }
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Preview info bar */}
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-400" />
                                <span>Live preview — all changes reflected instantly</span>
                              </div>
                              <span>·</span>
                              <span>{device.label} · {device.width}×{device.height}px</span>
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

              {/* Testing */}
              {activeTab === "Testing" && (
                <section>
                  <h2 className="text-[18px] font-bold text-foreground mb-1">Test Your Chatbot</h2>
                  <p className="text-[13px] text-muted-foreground mb-4">
                    Messages here use your live knowledge base and behavior settings — same as your real WhatsApp bot.
                  </p>
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="bg-[#075E54] p-3 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#C4B1F9] flex items-center justify-center text-white text-sm font-bold">A</div>
                      <div>
                        <p className="text-[13px] font-bold text-white">AI Chatbot (Live Test)</p>
                        <p className="text-[11px] text-white/70">Uses real knowledge base + behavior settings</p>
                      </div>
                    </div>
                    <div ref={chatScrollRef} className="h-64 overflow-y-auto p-4 space-y-3 bg-[#ECE5DD]">
                      {testMessages.map(msg => (
                        <div key={msg.id} className={cn("p-2.5 rounded-lg shadow-sm max-w-[85%] relative",
                          msg.sender === "user" ? "self-end ml-auto bg-[#DCF8C6] rounded-tr-none" : "self-start bg-white rounded-tl-none"
                        )}>
                          <p className="text-[13px] text-foreground whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      ))}
                      {isTyping && (
                        <div className="self-start bg-white px-3 py-2 rounded-lg rounded-tl-none shadow-sm flex gap-1">
                          {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
                        </div>
                      )}
                    </div>
                    <div className="bg-[#F0F0F0] p-2 flex items-center gap-2 border-t border-border">
                      <input type="text" value={testInput} onChange={e => setTestInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleTestSend()}
                        placeholder="Type a test message…"
                        className="bg-white rounded-full flex-1 h-9 px-4 text-[13px] outline-none border border-border" />
                      <button onClick={handleTestSend} disabled={isTyping || !testInput.trim()}
                        className="w-9 h-9 bg-primary rounded-full flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors disabled:opacity-50">
                        <ArrowRight className="h-4 w-4 text-foreground" />
                      </button>
                    </div>
                  </div>
                </section>
              )}

            </form>
          </div>
        </div>

        {/* Right: Test Chat (quick access on non-Testing tabs) */}
        {activeTab !== "Testing" && (
          <div className="w-[300px] bg-white border-l border-border flex flex-col shrink-0">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-foreground">Test Chat</h3>
              <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Live AI</span>
            </div>
            <div className="flex-1 bg-[#ECE5DD] flex flex-col">
              <div ref={chatScrollRef} className="flex-1 p-3 overflow-y-auto flex flex-col gap-2 scroll-smooth">
                {testMessages.map(msg => (
                  <div key={msg.id} className={cn("p-2 rounded-lg shadow-sm max-w-[90%] text-[12px]",
                    msg.sender === "user" ? "self-end ml-auto bg-[#DCF8C6] rounded-tr-none" : "self-start bg-white rounded-tl-none"
                  )}>
                    <p className="text-foreground whitespace-pre-wrap">{msg.text}</p>
                  </div>
                ))}
                {isTyping && (
                  <div className="self-start bg-white px-2.5 py-1.5 rounded-lg rounded-tl-none shadow-sm flex gap-0.5">
                    {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
                  </div>
                )}
              </div>
              <div className="bg-[#F0F0F0] p-2 flex items-center gap-1.5 border-t border-border">
                <input type="text" value={testInput} onChange={e => setTestInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleTestSend()}
                  placeholder="Ask your bot…"
                  className="bg-white rounded-full flex-1 h-8 px-3 text-[12px] outline-none" />
                <button onClick={handleTestSend} disabled={isTyping || !testInput.trim()}
                  className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shrink-0 disabled:opacity-50">
                  <ArrowRight className="h-3.5 w-3.5 text-foreground" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
